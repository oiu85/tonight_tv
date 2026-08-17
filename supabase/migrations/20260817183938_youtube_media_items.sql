alter table public.media_items
  alter column source_url drop not null,
  add column youtube_video_id text;

alter table public.media_items
  drop constraint media_items_source_url_check,
  add constraint media_items_source_identity_check check (
    (
      source_type = 'youtube'
      and source_url is null
      and youtube_video_id = pg_catalog.btrim(youtube_video_id)
      and youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
    )
    or
    (
      source_type <> 'youtube'
      and source_url is not null
      and source_url = pg_catalog.btrim(source_url)
      and pg_catalog.char_length(source_url) between 1 and 4096
      and youtube_video_id is null
    )
  );

drop function public.add_media_item(uuid, text, text, public.media_source_type);
drop function public.edit_media_item(uuid, uuid, text, text, public.media_source_type);
drop function public.remove_media_item(uuid, uuid);
drop function public.reorder_media_items(uuid, uuid[]);

create function public.add_media_item(
  p_room_id uuid,
  p_title text,
  p_source_url text default null,
  p_source_type public.media_source_type default 'auto',
  p_youtube_video_id text default null
)
returns table (
  id uuid,
  room_id uuid,
  title text,
  source_url text,
  source_type public.media_source_type,
  youtube_video_id text,
  queue_position integer,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_title text := pg_catalog.btrim(p_title);
  v_source_url text := nullif(pg_catalog.btrim(p_source_url), ''::text);
  v_youtube_video_id text := nullif(pg_catalog.btrim(p_youtube_video_id), ''::text);
  v_queue_count integer;
  v_queue_position integer;
begin
  v_room := private.lock_owned_room(p_room_id);

  if v_title is null or pg_catalog.char_length(v_title) not between 1 and 200 then
    raise exception using
      errcode = '22023',
      message = 'Media title must contain between 1 and 200 characters';
  end if;

  if p_source_type is null then
    raise exception using
      errcode = '22023',
      message = 'Media source type is required';
  end if;

  if p_source_type = 'youtube' then
    if v_source_url is not null then
      raise exception using
        errcode = '22023',
        message = 'YouTube media must not include a source URL';
    end if;
    if v_youtube_video_id is null or v_youtube_video_id !~ '^[A-Za-z0-9_-]{11}$' then
      raise exception using
        errcode = '22023',
        message = 'YouTube video ID must contain exactly 11 valid characters';
    end if;
  else
    if v_youtube_video_id is not null then
      raise exception using
        errcode = '22023',
        message = 'Only YouTube media may include a YouTube video ID';
    end if;
    if v_source_url is null
       or pg_catalog.char_length(v_source_url) not between 8 and 4096
       or v_source_url !~* '^https?://[^[:space:][:cntrl:]]+$'
       or v_source_url ~* '^https?://[^/]*@' then
      raise exception using
        errcode = '22023',
        message = 'Media source must be a valid direct HTTP or HTTPS URL';
    end if;
  end if;

  select
    count(*)::integer,
    coalesce(pg_catalog.max(mi.queue_position) + 1, 0)
  into v_queue_count, v_queue_position
  from public.media_items as mi
  where mi.room_id = v_room.id;

  if v_queue_count >= 500 then
    raise exception using
      errcode = '22023',
      message = 'The room queue cannot contain more than 500 media items';
  end if;

  return query
  insert into public.media_items as mi (
    room_id,
    title,
    source_url,
    source_type,
    youtube_video_id,
    queue_position,
    created_by
  )
  values (
    v_room.id,
    v_title,
    v_source_url,
    p_source_type,
    v_youtube_video_id,
    v_queue_position,
    auth.uid()
  )
  returning
    mi.id,
    mi.room_id,
    mi.title,
    mi.source_url,
    mi.source_type,
    mi.youtube_video_id,
    mi.queue_position,
    mi.created_by,
    mi.created_at,
    mi.updated_at;
end;
$$;

create function public.edit_media_item(
  p_room_id uuid,
  p_media_id uuid,
  p_title text,
  p_source_url text default null,
  p_source_type public.media_source_type default 'auto',
  p_youtube_video_id text default null
)
returns table (
  id uuid,
  room_id uuid,
  title text,
  source_url text,
  source_type public.media_source_type,
  youtube_video_id text,
  queue_position integer,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := pg_catalog.btrim(p_title);
  v_source_url text := nullif(pg_catalog.btrim(p_source_url), ''::text);
  v_youtube_video_id text := nullif(pg_catalog.btrim(p_youtube_video_id), ''::text);
begin
  perform private.lock_owned_room(p_room_id);

  if p_media_id is null then
    raise exception using errcode = '22023', message = 'Media ID is required';
  end if;
  if v_title is null or pg_catalog.char_length(v_title) not between 1 and 200 then
    raise exception using
      errcode = '22023',
      message = 'Media title must contain between 1 and 200 characters';
  end if;
  if p_source_type is null then
    raise exception using errcode = '22023', message = 'Media source type is required';
  end if;

  if p_source_type = 'youtube' then
    if v_source_url is not null then
      raise exception using errcode = '22023', message = 'YouTube media must not include a source URL';
    end if;
    if v_youtube_video_id is null or v_youtube_video_id !~ '^[A-Za-z0-9_-]{11}$' then
      raise exception using
        errcode = '22023',
        message = 'YouTube video ID must contain exactly 11 valid characters';
    end if;
  else
    if v_youtube_video_id is not null then
      raise exception using errcode = '22023', message = 'Only YouTube media may include a YouTube video ID';
    end if;
    if v_source_url is null
       or pg_catalog.char_length(v_source_url) not between 8 and 4096
       or v_source_url !~* '^https?://[^[:space:][:cntrl:]]+$'
       or v_source_url ~* '^https?://[^/]*@' then
      raise exception using
        errcode = '22023',
        message = 'Media source must be a valid direct HTTP or HTTPS URL';
    end if;
  end if;

  return query
  update public.media_items as mi
  set
    title = v_title,
    source_url = v_source_url,
    source_type = p_source_type,
    youtube_video_id = v_youtube_video_id
  where mi.room_id = p_room_id
    and mi.id = p_media_id
  returning
    mi.id,
    mi.room_id,
    mi.title,
    mi.source_url,
    mi.source_type,
    mi.youtube_video_id,
    mi.queue_position,
    mi.created_by,
    mi.created_at,
    mi.updated_at;

  if not found then
    raise exception using errcode = 'P0002', message = 'Media item was not found in the room';
  end if;
end;
$$;

create function public.remove_media_item(p_room_id uuid, p_media_id uuid)
returns table (
  id uuid,
  room_id uuid,
  title text,
  source_url text,
  source_type public.media_source_type,
  youtube_video_id text,
  queue_position integer,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_owned_room(p_room_id);
  if p_media_id is null then
    raise exception using errcode = '22023', message = 'Media ID is required';
  end if;
  if not exists (
    select 1 from public.media_items as mi
    where mi.room_id = p_room_id and mi.id = p_media_id
  ) then
    raise exception using errcode = 'P0002', message = 'Media item was not found in the room';
  end if;
  if exists (
    select 1 from public.room_playback_state as ps
    where ps.room_id = p_room_id and ps.current_media_id = p_media_id
  ) then
    raise exception using
      errcode = '55000',
      message = 'Current media cannot be removed; select another item first';
  end if;

  return query
  delete from public.media_items as mi
  where mi.room_id = p_room_id and mi.id = p_media_id
  returning
    mi.id,
    mi.room_id,
    mi.title,
    mi.source_url,
    mi.source_type,
    mi.youtube_video_id,
    mi.queue_position,
    mi.created_by,
    mi.created_at,
    mi.updated_at;
end;
$$;

create function public.reorder_media_items(p_room_id uuid, p_ordered_media_ids uuid[])
returns table (
  id uuid,
  room_id uuid,
  title text,
  source_url text,
  source_type public.media_source_type,
  youtube_video_id text,
  queue_position integer,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_count integer;
  v_provided_count integer;
  v_distinct_count integer;
  v_matched_count integer;
begin
  perform private.lock_owned_room(p_room_id);
  if p_ordered_media_ids is null then
    raise exception using errcode = '22023', message = 'Ordered media IDs are required';
  end if;
  v_provided_count := pg_catalog.cardinality(p_ordered_media_ids);
  if v_provided_count > 500 or pg_catalog.array_position(p_ordered_media_ids, null) is not null then
    raise exception using errcode = '22023', message = 'Ordered media IDs are invalid';
  end if;
  select count(distinct provided.media_id)::integer
    into v_distinct_count
  from pg_catalog.unnest(p_ordered_media_ids) as provided(media_id);
  if v_distinct_count <> v_provided_count then
    raise exception using errcode = '22023', message = 'Ordered media IDs cannot contain duplicates';
  end if;
  select count(*)::integer into v_expected_count
  from public.media_items as mi where mi.room_id = p_room_id;
  if v_expected_count <> v_provided_count then
    raise exception using
      errcode = '22023',
      message = 'Reorder must contain every media item in the room exactly once';
  end if;
  select count(*)::integer into v_matched_count
  from public.media_items as mi
  where mi.room_id = p_room_id and mi.id = any(p_ordered_media_ids);
  if v_matched_count <> v_provided_count then
    raise exception using errcode = '22023', message = 'Ordered media IDs must all belong to the room';
  end if;

  perform 1
  from public.media_items as mi
  where mi.room_id = p_room_id
  order by mi.id
  for update;

  update public.media_items as mi
  set queue_position = ordered.ordinality::integer - 1
  from pg_catalog.unnest(p_ordered_media_ids)
    with ordinality as ordered(media_id, ordinality)
  where mi.room_id = p_room_id and mi.id = ordered.media_id;

  return query
  select
    mi.id,
    mi.room_id,
    mi.title,
    mi.source_url,
    mi.source_type,
    mi.youtube_video_id,
    mi.queue_position,
    mi.created_by,
    mi.created_at,
    mi.updated_at
  from public.media_items as mi
  where mi.room_id = p_room_id
  order by mi.queue_position, mi.id;
end;
$$;

create or replace function public.get_room_snapshot(
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
  v_chat_limit integer := least(greatest(coalesce(p_chat_limit, 50), 1), 100);
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;
  if p_room_id is null then
    raise exception using errcode = '22023', message = 'Room ID is required';
  end if;
  if not exists (
    select 1 from public.rooms as r
    where r.id = p_room_id and r.owner_user_id = v_user_id
  ) and not exists (
    select 1 from public.room_sessions as rs
    where rs.room_id = p_room_id and rs.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Room membership is required';
  end if;

  select pg_catalog.jsonb_build_object(
    'server_time', pg_catalog.statement_timestamp(),
    'room', pg_catalog.jsonb_build_object(
      'id', r.id, 'name', r.name, 'owner_user_id', r.owner_user_id,
      'created_at', r.created_at, 'updated_at', r.updated_at
    ),
    'caller', pg_catalog.jsonb_build_object(
      'user_id', v_user_id, 'is_owner', r.owner_user_id = v_user_id,
      'room_session_id', caller_session.id, 'display_name', caller_session.display_name
    ),
    'playback', pg_catalog.jsonb_build_object(
      'room_id', ps.room_id, 'current_media_id', ps.current_media_id,
      'status', ps.status, 'anchor_position_sec', ps.anchor_position_sec,
      'anchor_server_time', ps.anchor_server_time, 'state_version', ps.state_version,
      'updated_at', ps.updated_at
    ),
    'current_media', case when current_media.id is null then null else pg_catalog.jsonb_build_object(
      'id', current_media.id, 'title', current_media.title,
      'source_url', current_media.source_url, 'source_type', current_media.source_type,
      'youtube_video_id', current_media.youtube_video_id,
      'queue_position', current_media.queue_position,
      'created_at', current_media.created_at, 'updated_at', current_media.updated_at
    ) end,
    'subtitles', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', s.id, 'media_id', s.media_id, 'label', s.label,
        'language_code', s.language_code, 'storage_path', s.storage_path,
        'format', s.format, 'created_at', s.created_at
      ) order by s.created_at, s.id)
      from public.subtitles as s
      where s.room_id = r.id and s.media_id = ps.current_media_id
    ), '[]'::jsonb),
    'queue', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', queue_item.id, 'title', queue_item.title,
        'source_url', queue_item.source_url, 'source_type', queue_item.source_type,
        'youtube_video_id', queue_item.youtube_video_id,
        'queue_position', queue_item.queue_position,
        'created_at', queue_item.created_at, 'updated_at', queue_item.updated_at
      ) order by queue_item.queue_position, queue_item.id)
      from public.media_items as queue_item where queue_item.room_id = r.id
    ), '[]'::jsonb),
    'recent_chat', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', recent.id, 'user_id', recent.user_id,
        'sender_display_name', recent.sender_display_name,
        'body', recent.body, 'created_at', recent.created_at
      ) order by recent.created_at, recent.id)
      from (
        select cm.id, cm.user_id, cm.sender_display_name, cm.body, cm.created_at
        from public.chat_messages as cm
        where cm.room_id = r.id
        order by cm.created_at desc, cm.id desc
        limit v_chat_limit
      ) as recent
    ), '[]'::jsonb)
  ) into v_snapshot
  from public.rooms as r
  join public.room_playback_state as ps on ps.room_id = r.id
  left join public.media_items as current_media
    on current_media.room_id = ps.room_id and current_media.id = ps.current_media_id
  left join public.room_sessions as caller_session
    on caller_session.room_id = r.id and caller_session.user_id = v_user_id
  where r.id = p_room_id;

  if v_snapshot is null then
    raise exception using errcode = 'P0002', message = 'Room snapshot is unavailable';
  end if;
  return v_snapshot;
end;
$$;

revoke all on function public.add_media_item(uuid, text, text, public.media_source_type, text)
  from public, anon, authenticated;
revoke all on function public.edit_media_item(uuid, uuid, text, text, public.media_source_type, text)
  from public, anon, authenticated;
revoke all on function public.remove_media_item(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.reorder_media_items(uuid, uuid[])
  from public, anon, authenticated;

grant execute on function public.add_media_item(uuid, text, text, public.media_source_type, text)
  to authenticated;
grant execute on function public.edit_media_item(uuid, uuid, text, text, public.media_source_type, text)
  to authenticated;
grant execute on function public.remove_media_item(uuid, uuid)
  to authenticated;
grant execute on function public.reorder_media_items(uuid, uuid[])
  to authenticated;
