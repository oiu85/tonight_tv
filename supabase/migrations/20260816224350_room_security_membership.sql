create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

create function private.authorized_room_ids()
returns table (room_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.rooms as r
  where r.owner_user_id = auth.uid()

  union

  select rs.room_id
  from public.room_sessions as rs
  where rs.user_id = auth.uid();
$$;

revoke all on function private.authorized_room_ids()
  from public, anon, authenticated;
grant execute on function private.authorized_room_ids()
  to authenticated;

create policy rooms_member_select
on public.rooms
for select
to authenticated
using (
  id in (select authorized.room_id from private.authorized_room_ids() as authorized)
);

create policy room_sessions_member_select
on public.room_sessions
for select
to authenticated
using (
  room_id in (select authorized.room_id from private.authorized_room_ids() as authorized)
);

create policy media_items_member_select
on public.media_items
for select
to authenticated
using (
  room_id in (select authorized.room_id from private.authorized_room_ids() as authorized)
);

create policy subtitles_member_select
on public.subtitles
for select
to authenticated
using (
  room_id in (select authorized.room_id from private.authorized_room_ids() as authorized)
);

create policy room_playback_state_member_select
on public.room_playback_state
for select
to authenticated
using (
  room_id in (select authorized.room_id from private.authorized_room_ids() as authorized)
);

create policy chat_messages_member_select
on public.chat_messages
for select
to authenticated
using (
  room_id in (select authorized.room_id from private.authorized_room_ids() as authorized)
);

create function public.create_room(p_name text)
returns table (
  room_id uuid,
  owner_user_id uuid,
  room_name text,
  created_at timestamptz,
  updated_at timestamptz,
  playback_status public.playback_status,
  anchor_position_sec double precision,
  anchor_server_time timestamptz,
  state_version bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := pg_catalog.btrim(p_name);
  v_room_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required';
  end if;

  if v_name is null or pg_catalog.char_length(v_name) not between 1 and 120 then
    raise exception using
      errcode = '22023',
      message = 'Room name must contain between 1 and 120 characters';
  end if;

  insert into public.rooms (owner_user_id, name)
  values (v_user_id, v_name)
  returning id into v_room_id;

  insert into public.room_playback_state (room_id)
  values (v_room_id);

  return query
  select
    r.id,
    r.owner_user_id,
    r.name,
    r.created_at,
    r.updated_at,
    ps.status,
    ps.anchor_position_sec,
    ps.anchor_server_time,
    ps.state_version
  from public.rooms as r
  join public.room_playback_state as ps on ps.room_id = r.id
  where r.id = v_room_id;
end;
$$;

create function public.join_room(p_room_id uuid, p_display_name text)
returns table (
  session_id uuid,
  room_id uuid,
  user_id uuid,
  display_name text,
  joined_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := pg_catalog.btrim(p_display_name);
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required';
  end if;

  if p_room_id is null then
    raise exception using
      errcode = '22023',
      message = 'Room ID is required';
  end if;

  if v_display_name is null
     or pg_catalog.char_length(v_display_name) not between 1 and 40 then
    raise exception using
      errcode = '22023',
      message = 'Display name must contain between 1 and 40 characters';
  end if;

  if not exists (
    select 1
    from public.rooms as r
    where r.id = p_room_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'Room not found';
  end if;

  insert into public.room_sessions (room_id, user_id, display_name)
  values (p_room_id, v_user_id, v_display_name)
  on conflict on constraint room_sessions_room_id_user_id_key
  do update
    set display_name = excluded.display_name
  returning id into v_session_id;

  return query
  select
    rs.id,
    rs.room_id,
    rs.user_id,
    rs.display_name,
    rs.joined_at,
    rs.updated_at
  from public.room_sessions as rs
  where rs.id = v_session_id;
end;
$$;

create function public.get_server_time()
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required';
  end if;

  return pg_catalog.statement_timestamp();
end;
$$;

create function public.get_room_join_preview(p_room_id uuid)
returns table (
  room_id uuid,
  room_name text,
  current_title text,
  has_active_media boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.name,
    current_media.title,
    (ps.current_media_id is not null)
  from public.rooms as r
  join public.room_playback_state as ps on ps.room_id = r.id
  left join public.media_items as current_media
    on current_media.room_id = ps.room_id
   and current_media.id = ps.current_media_id
  where r.id = p_room_id;
$$;

create function public.get_room_snapshot(
  p_room_id uuid,
  p_chat_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_chat_limit integer := least(
    greatest(coalesce(p_chat_limit, 50), 1),
    100
  );
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required';
  end if;

  if p_room_id is null then
    raise exception using
      errcode = '22023',
      message = 'Room ID is required';
  end if;

  if not exists (
    select 1
    from public.rooms as r
    where r.id = p_room_id
      and r.owner_user_id = v_user_id
  ) and not exists (
    select 1
    from public.room_sessions as rs
    where rs.room_id = p_room_id
      and rs.user_id = v_user_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Room membership is required';
  end if;

  select pg_catalog.jsonb_build_object(
    'server_time', pg_catalog.statement_timestamp(),
    'room', pg_catalog.jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'owner_user_id', r.owner_user_id,
      'created_at', r.created_at,
      'updated_at', r.updated_at
    ),
    'caller', pg_catalog.jsonb_build_object(
      'user_id', v_user_id,
      'is_owner', r.owner_user_id = v_user_id,
      'room_session_id', caller_session.id,
      'display_name', caller_session.display_name
    ),
    'playback', pg_catalog.jsonb_build_object(
      'room_id', ps.room_id,
      'current_media_id', ps.current_media_id,
      'status', ps.status,
      'anchor_position_sec', ps.anchor_position_sec,
      'anchor_server_time', ps.anchor_server_time,
      'state_version', ps.state_version,
      'updated_at', ps.updated_at
    ),
    'current_media', case
      when current_media.id is null then null
      else pg_catalog.jsonb_build_object(
        'id', current_media.id,
        'title', current_media.title,
        'source_url', current_media.source_url,
        'source_type', current_media.source_type,
        'queue_position', current_media.queue_position,
        'created_at', current_media.created_at,
        'updated_at', current_media.updated_at
      )
    end,
    'subtitles', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', s.id,
          'media_id', s.media_id,
          'label', s.label,
          'language_code', s.language_code,
          'storage_path', s.storage_path,
          'format', s.format,
          'created_at', s.created_at
        )
        order by s.created_at, s.id
      )
      from public.subtitles as s
      where s.room_id = r.id
        and s.media_id = ps.current_media_id
    ), '[]'::jsonb),
    'queue', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', queue_item.id,
          'title', queue_item.title,
          'source_url', queue_item.source_url,
          'source_type', queue_item.source_type,
          'queue_position', queue_item.queue_position,
          'created_at', queue_item.created_at,
          'updated_at', queue_item.updated_at
        )
        order by queue_item.queue_position, queue_item.id
      )
      from public.media_items as queue_item
      where queue_item.room_id = r.id
    ), '[]'::jsonb),
    'recent_chat', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', recent.id,
          'user_id', recent.user_id,
          'sender_display_name', recent.sender_display_name,
          'body', recent.body,
          'created_at', recent.created_at
        )
        order by recent.created_at, recent.id
      )
      from (
        select
          cm.id,
          cm.user_id,
          cm.sender_display_name,
          cm.body,
          cm.created_at
        from public.chat_messages as cm
        where cm.room_id = r.id
        order by cm.created_at desc, cm.id desc
        limit v_chat_limit
      ) as recent
    ), '[]'::jsonb)
  )
  into v_snapshot
  from public.rooms as r
  join public.room_playback_state as ps on ps.room_id = r.id
  left join public.media_items as current_media
    on current_media.room_id = ps.room_id
   and current_media.id = ps.current_media_id
  left join public.room_sessions as caller_session
    on caller_session.room_id = r.id
   and caller_session.user_id = v_user_id
  where r.id = p_room_id;

  if v_snapshot is null then
    raise exception using
      errcode = 'P0002',
      message = 'Room snapshot is unavailable';
  end if;

  return v_snapshot;
end;
$$;

revoke all on function public.create_room(text)
  from public, anon, authenticated;
revoke all on function public.join_room(uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_server_time()
  from public, anon, authenticated;
revoke all on function public.get_room_join_preview(uuid)
  from public, anon, authenticated;
revoke all on function public.get_room_snapshot(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.create_room(text) to authenticated;
grant execute on function public.join_room(uuid, text) to authenticated;
grant execute on function public.get_server_time() to authenticated;
grant execute on function public.get_room_snapshot(uuid, integer) to authenticated;
grant execute on function public.get_room_join_preview(uuid) to anon, authenticated;
