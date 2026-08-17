-- Block non-owner joins against a deactivated room. The room preview and
-- snapshot already hide deactivated rooms from non-members; this guards
-- against an old session rejoining directly.

create or replace function public.join_room(p_room_id uuid, p_display_name text)
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

  if exists (
    select 1
    from public.rooms as r
    where r.id = p_room_id
      and r.status = 'deactivated'
  ) then
    raise exception using
      errcode = '55000',
      message = 'This room is currently unavailable. Ask the room owner to reactivate it.';
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

revoke all on function public.join_room(uuid, text)
  from public, anon, authenticated;
grant execute on function public.join_room(uuid, text) to authenticated;
