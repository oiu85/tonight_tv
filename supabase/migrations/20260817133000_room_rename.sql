create function public.rename_room(p_room_id uuid, p_name text)
returns table (
  id uuid,
  owner_user_id uuid,
  name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := pg_catalog.btrim(p_name);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_room_id is null then
    raise exception using errcode = '22023', message = 'Room ID is required';
  end if;

  if v_name is null or pg_catalog.char_length(v_name) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Room name must contain between 1 and 120 characters';
  end if;

  return query
  update public.rooms as r
  set name = v_name
  where r.id = p_room_id
    and r.owner_user_id = v_user_id
  returning r.id, r.owner_user_id, r.name, r.created_at, r.updated_at;

  if not found then
    raise exception using errcode = '42501', message = 'Room ownership is required';
  end if;
end;
$$;

revoke all on function public.rename_room(uuid, text)
  from public, anon, authenticated;
grant execute on function public.rename_room(uuid, text) to authenticated;

create function private.broadcast_room_changed()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.send_room_event(
    new.id,
    'room_changed',
    pg_catalog.jsonb_build_object(
      'name', new.name,
      'updated_at', new.updated_at
    )
  );
  return null;
end;
$$;

revoke all on function private.broadcast_room_changed()
  from public, anon, authenticated;

create trigger rooms_broadcast_changed
after update of name on public.rooms
for each row execute function private.broadcast_room_changed();
