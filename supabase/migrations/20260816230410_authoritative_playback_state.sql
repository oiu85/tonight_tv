create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.clock_timestamp();
  return new;
end;
$$;

create function private.lock_owned_playback_state(
  p_room_id uuid,
  p_expected_version bigint
)
returns public.room_playback_state
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_state public.room_playback_state%rowtype;
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

  if p_expected_version is null or p_expected_version < 0 then
    raise exception using
      errcode = '22023',
      message = 'Expected version must be a nonnegative integer';
  end if;

  select ps.*
  into v_state
  from public.room_playback_state as ps
  join public.rooms as r on r.id = ps.room_id
  where ps.room_id = p_room_id
    and r.owner_user_id = v_user_id
  for update of ps;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Room ownership is required';
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

revoke all on function private.lock_owned_playback_state(uuid, bigint)
  from public, anon, authenticated;

create function public.room_play(
  p_room_id uuid,
  p_expected_version bigint
)
returns table (
  room_id uuid,
  current_media_id uuid,
  status public.playback_status,
  anchor_position_sec double precision,
  anchor_server_time timestamptz,
  state_version bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.room_playback_state%rowtype;
  v_now timestamptz;
begin
  v_state := private.lock_owned_playback_state(p_room_id, p_expected_version);

  if v_state.status = 'playing' then
    return query
    select ps.room_id, ps.current_media_id, ps.status,
      ps.anchor_position_sec, ps.anchor_server_time,
      ps.state_version, ps.updated_at
    from public.room_playback_state as ps
    where ps.room_id = p_room_id;
    return;
  end if;

  if v_state.status <> 'paused' then
    raise exception using
      errcode = '22023',
      message = 'Play requires paused playback with current media';
  end if;

  v_now := pg_catalog.clock_timestamp();

  return query
  update public.room_playback_state as ps
  set
    status = 'playing',
    anchor_server_time = v_now,
    state_version = v_state.state_version + 1
  where ps.room_id = p_room_id
  returning ps.room_id, ps.current_media_id, ps.status,
    ps.anchor_position_sec, ps.anchor_server_time,
    ps.state_version, ps.updated_at;
end;
$$;

create function public.room_pause(
  p_room_id uuid,
  p_expected_version bigint
)
returns table (
  room_id uuid,
  current_media_id uuid,
  status public.playback_status,
  anchor_position_sec double precision,
  anchor_server_time timestamptz,
  state_version bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.room_playback_state%rowtype;
  v_now timestamptz;
  v_position double precision;
begin
  v_state := private.lock_owned_playback_state(p_room_id, p_expected_version);

  if v_state.status = 'paused' then
    return query
    select ps.room_id, ps.current_media_id, ps.status,
      ps.anchor_position_sec, ps.anchor_server_time,
      ps.state_version, ps.updated_at
    from public.room_playback_state as ps
    where ps.room_id = p_room_id;
    return;
  end if;

  if v_state.status <> 'playing' then
    raise exception using
      errcode = '22023',
      message = 'Pause requires playing playback';
  end if;

  v_now := pg_catalog.clock_timestamp();
  v_position := v_state.anchor_position_sec + greatest(
    extract(epoch from (v_now - v_state.anchor_server_time)),
    0
  );

  return query
  update public.room_playback_state as ps
  set
    status = 'paused',
    anchor_position_sec = v_position,
    anchor_server_time = v_now,
    state_version = v_state.state_version + 1
  where ps.room_id = p_room_id
  returning ps.room_id, ps.current_media_id, ps.status,
    ps.anchor_position_sec, ps.anchor_server_time,
    ps.state_version, ps.updated_at;
end;
$$;

create function public.room_seek(
  p_room_id uuid,
  p_expected_version bigint,
  p_target_position_sec double precision
)
returns table (
  room_id uuid,
  current_media_id uuid,
  status public.playback_status,
  anchor_position_sec double precision,
  anchor_server_time timestamptz,
  state_version bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.room_playback_state%rowtype;
  v_now timestamptz;
  v_target double precision;
begin
  v_state := private.lock_owned_playback_state(p_room_id, p_expected_version);

  if p_target_position_sec is null
     or not (
       p_target_position_sec >= 0
       and p_target_position_sec < 'Infinity'::double precision
     ) then
    raise exception using
      errcode = '22023',
      message = 'Seek target must be finite and nonnegative';
  end if;

  if v_state.status not in ('playing', 'paused') then
    raise exception using
      errcode = '22023',
      message = 'Seek requires playing or paused playback';
  end if;

  v_target := pg_catalog.round(p_target_position_sec::numeric, 3)::double precision;
  v_now := pg_catalog.clock_timestamp();

  return query
  update public.room_playback_state as ps
  set
    anchor_position_sec = v_target,
    anchor_server_time = v_now,
    state_version = v_state.state_version + 1
  where ps.room_id = p_room_id
  returning ps.room_id, ps.current_media_id, ps.status,
    ps.anchor_position_sec, ps.anchor_server_time,
    ps.state_version, ps.updated_at;
end;
$$;

create function public.room_restart(
  p_room_id uuid,
  p_expected_version bigint
)
returns table (
  room_id uuid,
  current_media_id uuid,
  status public.playback_status,
  anchor_position_sec double precision,
  anchor_server_time timestamptz,
  state_version bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.room_playback_state%rowtype;
  v_now timestamptz;
  v_status public.playback_status;
begin
  v_state := private.lock_owned_playback_state(p_room_id, p_expected_version);

  if v_state.status = 'idle' then
    raise exception using
      errcode = '22023',
      message = 'Restart requires current media';
  end if;

  v_status := case
    when v_state.status = 'playing' then 'playing'::public.playback_status
    else 'paused'::public.playback_status
  end;
  v_now := pg_catalog.clock_timestamp();

  return query
  update public.room_playback_state as ps
  set
    status = v_status,
    anchor_position_sec = 0,
    anchor_server_time = v_now,
    state_version = v_state.state_version + 1
  where ps.room_id = p_room_id
  returning ps.room_id, ps.current_media_id, ps.status,
    ps.anchor_position_sec, ps.anchor_server_time,
    ps.state_version, ps.updated_at;
end;
$$;

create function public.room_select_media(
  p_room_id uuid,
  p_expected_version bigint,
  p_media_id uuid,
  p_autoplay boolean
)
returns table (
  room_id uuid,
  current_media_id uuid,
  status public.playback_status,
  anchor_position_sec double precision,
  anchor_server_time timestamptz,
  state_version bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.room_playback_state%rowtype;
  v_now timestamptz;
begin
  v_state := private.lock_owned_playback_state(p_room_id, p_expected_version);

  if p_media_id is null or p_autoplay is null then
    raise exception using
      errcode = '22023',
      message = 'Media ID and autoplay choice are required';
  end if;

  if not exists (
    select 1
    from public.media_items as mi
    where mi.room_id = p_room_id
      and mi.id = p_media_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Selected media does not belong to the room';
  end if;

  v_now := pg_catalog.clock_timestamp();

  return query
  update public.room_playback_state as ps
  set
    current_media_id = p_media_id,
    status = case
      when p_autoplay then 'playing'::public.playback_status
      else 'paused'::public.playback_status
    end,
    anchor_position_sec = 0,
    anchor_server_time = v_now,
    state_version = v_state.state_version + 1
  where ps.room_id = p_room_id
  returning ps.room_id, ps.current_media_id, ps.status,
    ps.anchor_position_sec, ps.anchor_server_time,
    ps.state_version, ps.updated_at;
end;
$$;

create function public.room_mark_ended(
  p_room_id uuid,
  p_expected_version bigint
)
returns table (
  room_id uuid,
  current_media_id uuid,
  status public.playback_status,
  anchor_position_sec double precision,
  anchor_server_time timestamptz,
  state_version bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.room_playback_state%rowtype;
  v_now timestamptz;
  v_position double precision;
begin
  v_state := private.lock_owned_playback_state(p_room_id, p_expected_version);

  if v_state.status = 'ended' then
    return query
    select ps.room_id, ps.current_media_id, ps.status,
      ps.anchor_position_sec, ps.anchor_server_time,
      ps.state_version, ps.updated_at
    from public.room_playback_state as ps
    where ps.room_id = p_room_id;
    return;
  end if;

  if v_state.status not in ('playing', 'paused') then
    raise exception using
      errcode = '22023',
      message = 'Mark ended requires active current media';
  end if;

  v_now := pg_catalog.clock_timestamp();
  v_position := v_state.anchor_position_sec;

  if v_state.status = 'playing' then
    v_position := v_position + greatest(
      extract(epoch from (v_now - v_state.anchor_server_time)),
      0
    );
  end if;

  return query
  update public.room_playback_state as ps
  set
    status = 'ended',
    anchor_position_sec = v_position,
    anchor_server_time = v_now,
    state_version = v_state.state_version + 1
  where ps.room_id = p_room_id
  returning ps.room_id, ps.current_media_id, ps.status,
    ps.anchor_position_sec, ps.anchor_server_time,
    ps.state_version, ps.updated_at;
end;
$$;

create function public.room_play_next(
  p_room_id uuid,
  p_expected_version bigint
)
returns table (
  room_id uuid,
  current_media_id uuid,
  status public.playback_status,
  anchor_position_sec double precision,
  anchor_server_time timestamptz,
  state_version bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.room_playback_state%rowtype;
  v_next_media_id uuid;
  v_now timestamptz;
begin
  v_state := private.lock_owned_playback_state(p_room_id, p_expected_version);

  if v_state.current_media_id is null then
    select mi.id
    into v_next_media_id
    from public.media_items as mi
    where mi.room_id = p_room_id
    order by mi.queue_position, mi.id
    limit 1;
  else
    select candidate.id
    into v_next_media_id
    from public.media_items as current_item
    join public.media_items as candidate
      on candidate.room_id = current_item.room_id
     and (
       candidate.queue_position > current_item.queue_position
       or (
         candidate.queue_position = current_item.queue_position
         and candidate.id > current_item.id
       )
     )
    where current_item.room_id = p_room_id
      and current_item.id = v_state.current_media_id
    order by candidate.queue_position, candidate.id
    limit 1;
  end if;

  if v_next_media_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'No next media item is available';
  end if;

  v_now := pg_catalog.clock_timestamp();

  return query
  update public.room_playback_state as ps
  set
    current_media_id = v_next_media_id,
    status = 'playing',
    anchor_position_sec = 0,
    anchor_server_time = v_now,
    state_version = v_state.state_version + 1
  where ps.room_id = p_room_id
  returning ps.room_id, ps.current_media_id, ps.status,
    ps.anchor_position_sec, ps.anchor_server_time,
    ps.state_version, ps.updated_at;
end;
$$;

revoke all on function public.room_play(uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.room_pause(uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.room_seek(uuid, bigint, double precision)
  from public, anon, authenticated;
revoke all on function public.room_restart(uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.room_select_media(uuid, bigint, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.room_mark_ended(uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.room_play_next(uuid, bigint)
  from public, anon, authenticated;

grant execute on function public.room_play(uuid, bigint) to authenticated;
grant execute on function public.room_pause(uuid, bigint) to authenticated;
grant execute on function public.room_seek(uuid, bigint, double precision) to authenticated;
grant execute on function public.room_restart(uuid, bigint) to authenticated;
grant execute on function public.room_select_media(uuid, bigint, uuid, boolean) to authenticated;
grant execute on function public.room_mark_ended(uuid, bigint) to authenticated;
grant execute on function public.room_play_next(uuid, bigint) to authenticated;
