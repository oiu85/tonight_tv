create function private.lock_owned_room(p_room_id uuid)
returns public.rooms
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
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

  select r.*
  into v_room
  from public.rooms as r
  where r.id = p_room_id
    and r.owner_user_id = v_user_id
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Room ownership is required';
  end if;

  return v_room;
end;
$$;

revoke all on function private.lock_owned_room(uuid)
  from public, anon, authenticated;

create or replace function private.lock_owned_playback_state(
  p_room_id uuid,
  p_expected_version bigint
)
returns public.room_playback_state
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.room_playback_state%rowtype;
begin
  perform private.lock_owned_room(p_room_id);

  if p_expected_version is null or p_expected_version < 0 then
    raise exception using
      errcode = '22023',
      message = 'Expected version must be a nonnegative integer';
  end if;

  select ps.*
  into v_state
  from public.room_playback_state as ps
  where ps.room_id = p_room_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Playback state is unavailable';
  end if;

  if v_state.state_version <> p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'Playback state version conflict',
      detail = pg_catalog.format(
        'Expected version %s but canonical version is %s',
        p_expected_version,
        v_state.state_version
      );
  end if;

  return v_state;
end;
$$;

create function public.add_media_item(
  p_room_id uuid,
  p_title text,
  p_source_url text,
  p_source_type public.media_source_type default 'auto'
)
returns table (
  id uuid,
  room_id uuid,
  title text,
  source_url text,
  source_type public.media_source_type,
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
  v_source_url text := pg_catalog.btrim(p_source_url);
  v_queue_count integer;
  v_queue_position integer;
begin
  v_room := private.lock_owned_room(p_room_id);

  if v_title is null or pg_catalog.char_length(v_title) not between 1 and 200 then
    raise exception using
      errcode = '22023',
      message = 'Media title must contain between 1 and 200 characters';
  end if;

  if v_source_url is null
     or pg_catalog.char_length(v_source_url) not between 8 and 4096
     or v_source_url !~* '^https?://[^[:space:][:cntrl:]]+$'
     or v_source_url ~* '^https?://[^/]*@' then
    raise exception using
      errcode = '22023',
      message = 'Media source must be a valid direct HTTP or HTTPS URL';
  end if;

  if p_source_type is null then
    raise exception using
      errcode = '22023',
      message = 'Media source type is required';
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
    queue_position,
    created_by
  )
  values (
    v_room.id,
    v_title,
    v_source_url,
    p_source_type,
    v_queue_position,
    auth.uid()
  )
  returning
    mi.id,
    mi.room_id,
    mi.title,
    mi.source_url,
    mi.source_type,
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
  p_source_url text,
  p_source_type public.media_source_type
)
returns table (
  id uuid,
  room_id uuid,
  title text,
  source_url text,
  source_type public.media_source_type,
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
  v_source_url text := pg_catalog.btrim(p_source_url);
begin
  perform private.lock_owned_room(p_room_id);

  if p_media_id is null then
    raise exception using
      errcode = '22023',
      message = 'Media ID is required';
  end if;

  if v_title is null or pg_catalog.char_length(v_title) not between 1 and 200 then
    raise exception using
      errcode = '22023',
      message = 'Media title must contain between 1 and 200 characters';
  end if;

  if v_source_url is null
     or pg_catalog.char_length(v_source_url) not between 8 and 4096
     or v_source_url !~* '^https?://[^[:space:][:cntrl:]]+$'
     or v_source_url ~* '^https?://[^/]*@' then
    raise exception using
      errcode = '22023',
      message = 'Media source must be a valid direct HTTP or HTTPS URL';
  end if;

  if p_source_type is null then
    raise exception using
      errcode = '22023',
      message = 'Media source type is required';
  end if;

  return query
  update public.media_items as mi
  set
    title = v_title,
    source_url = v_source_url,
    source_type = p_source_type
  where mi.room_id = p_room_id
    and mi.id = p_media_id
  returning
    mi.id,
    mi.room_id,
    mi.title,
    mi.source_url,
    mi.source_type,
    mi.queue_position,
    mi.created_by,
    mi.created_at,
    mi.updated_at;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Media item was not found in the room';
  end if;
end;
$$;

create function public.remove_media_item(
  p_room_id uuid,
  p_media_id uuid
)
returns table (
  id uuid,
  room_id uuid,
  title text,
  source_url text,
  source_type public.media_source_type,
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
    raise exception using
      errcode = '22023',
      message = 'Media ID is required';
  end if;

  if not exists (
    select 1
    from public.media_items as mi
    where mi.room_id = p_room_id
      and mi.id = p_media_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'Media item was not found in the room';
  end if;

  if exists (
    select 1
    from public.room_playback_state as ps
    where ps.room_id = p_room_id
      and ps.current_media_id = p_media_id
  ) then
    raise exception using
      errcode = '55000',
      message = 'Current media cannot be removed; select another item first';
  end if;

  return query
  delete from public.media_items as mi
  where mi.room_id = p_room_id
    and mi.id = p_media_id
  returning
    mi.id,
    mi.room_id,
    mi.title,
    mi.source_url,
    mi.source_type,
    mi.queue_position,
    mi.created_by,
    mi.created_at,
    mi.updated_at;
end;
$$;

create function public.reorder_media_items(
  p_room_id uuid,
  p_ordered_media_ids uuid[]
)
returns table (
  id uuid,
  room_id uuid,
  title text,
  source_url text,
  source_type public.media_source_type,
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
    raise exception using
      errcode = '22023',
      message = 'Ordered media IDs are required';
  end if;

  v_provided_count := pg_catalog.cardinality(p_ordered_media_ids);
  if v_provided_count > 500 or pg_catalog.array_position(p_ordered_media_ids, null) is not null then
    raise exception using
      errcode = '22023',
      message = 'Ordered media IDs are invalid';
  end if;

  select count(distinct provided.media_id)::integer
  into v_distinct_count
  from pg_catalog.unnest(p_ordered_media_ids) as provided(media_id);

  if v_distinct_count <> v_provided_count then
    raise exception using
      errcode = '22023',
      message = 'Ordered media IDs cannot contain duplicates';
  end if;

  select count(*)::integer
  into v_expected_count
  from public.media_items as mi
  where mi.room_id = p_room_id;

  if v_expected_count <> v_provided_count then
    raise exception using
      errcode = '22023',
      message = 'Reorder must contain every media item in the room exactly once';
  end if;

  select count(*)::integer
  into v_matched_count
  from public.media_items as mi
  where mi.room_id = p_room_id
    and mi.id = any(p_ordered_media_ids);

  if v_matched_count <> v_provided_count then
    raise exception using
      errcode = '22023',
      message = 'Ordered media IDs must all belong to the room';
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
  where mi.room_id = p_room_id
    and mi.id = ordered.media_id;

  return query
  select
    mi.id,
    mi.room_id,
    mi.title,
    mi.source_url,
    mi.source_type,
    mi.queue_position,
    mi.created_by,
    mi.created_at,
    mi.updated_at
  from public.media_items as mi
  where mi.room_id = p_room_id
  order by mi.queue_position, mi.id;
end;
$$;

drop trigger media_items_broadcast_queue_change on public.media_items;
drop function private.broadcast_queue_changed();

create function private.broadcast_media_items_statement()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
begin
  if tg_op = 'INSERT' then
    for v_room_id in
      select distinct inserted.room_id
      from new_rows as inserted
    loop
      perform private.send_room_event(v_room_id, 'queue_changed');
    end loop;
  elsif tg_op = 'UPDATE' then
    for v_room_id in
      select changed.room_id
      from (
        select old_row.room_id from old_rows as old_row
        union
        select new_row.room_id from new_rows as new_row
      ) as changed
    loop
      perform private.send_room_event(v_room_id, 'queue_changed');
    end loop;
  elsif tg_op = 'DELETE' then
    for v_room_id in
      select distinct deleted.room_id
      from old_rows as deleted
    loop
      perform private.send_room_event(v_room_id, 'queue_changed');
    end loop;
  end if;

  return null;
end;
$$;

revoke all on function private.broadcast_media_items_statement()
  from public, anon, authenticated;

create trigger media_items_broadcast_insert
after insert on public.media_items
referencing new table as new_rows
for each statement execute function private.broadcast_media_items_statement();

create trigger media_items_broadcast_update
after update on public.media_items
referencing old table as old_rows new table as new_rows
for each statement execute function private.broadcast_media_items_statement();

create trigger media_items_broadcast_delete
after delete on public.media_items
referencing old table as old_rows
for each statement execute function private.broadcast_media_items_statement();

revoke all on function public.add_media_item(uuid, text, text, public.media_source_type)
  from public, anon, authenticated;
revoke all on function public.edit_media_item(uuid, uuid, text, text, public.media_source_type)
  from public, anon, authenticated;
revoke all on function public.remove_media_item(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.reorder_media_items(uuid, uuid[])
  from public, anon, authenticated;

grant execute on function public.add_media_item(uuid, text, text, public.media_source_type)
  to authenticated;
grant execute on function public.edit_media_item(uuid, uuid, text, text, public.media_source_type)
  to authenticated;
grant execute on function public.remove_media_item(uuid, uuid)
  to authenticated;
grant execute on function public.reorder_media_items(uuid, uuid[])
  to authenticated;
