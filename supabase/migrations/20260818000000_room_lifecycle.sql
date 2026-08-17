-- Room lifecycle: deactivate (soft), reactivate, and hard delete.
--
-- This migration introduces:
--   * a `room_status` enum and matching `status` / `deactivated_at` columns on `public.rooms`,
--   * a public list helper that defaults to active rooms and can include deactivated ones,
--   * three owner-only RPCs: `deactivate_room`, `reactivate_room`, `hard_delete_room`,
--   * a private broadcast trigger so admins see lifecycle events in real time.
--
-- Existing rows default to `active` and `deactivated_at` stays null until a room is
-- deactivated, so nothing breaks for owners that never use this feature.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'room_status') then
    create type public.room_status as enum ('active', 'deactivated');
  end if;
end
$$;

alter table public.rooms
  add column if not exists status public.room_status not null default 'active',
  add column if not exists deactivated_at timestamptz;

alter table public.rooms
  drop constraint if exists rooms_deactivated_at_check;

alter table public.rooms
  add constraint rooms_deactivated_at_check check (
    (status = 'active' and deactivated_at is null)
    or (status = 'deactivated' and deactivated_at is not null)
  );

create index if not exists rooms_status_updated_at_idx
  on public.rooms (status, updated_at desc);

-- Owner listing helper that defaults to active rooms only and can include
-- deactivated ones when the caller asks for them.
create or replace function public.list_owned_rooms(p_include_deactivated boolean default false)
returns table (
  id uuid,
  owner_user_id uuid,
  name text,
  created_at timestamptz,
  updated_at timestamptz,
  status public.room_status,
  deactivated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.owner_user_id,
    r.name,
    r.created_at,
    r.updated_at,
    r.status,
    r.deactivated_at
  from public.rooms as r
  where r.owner_user_id = auth.uid()
    and (p_include_deactivated or r.status = 'active')
  order by r.updated_at desc;
$$;

revoke all on function public.list_owned_rooms(boolean)
  from public, anon, authenticated;
grant execute on function public.list_owned_rooms(boolean)
  to authenticated;

create or replace function public.deactivate_room(p_room_id uuid)
returns table (
  id uuid,
  owner_user_id uuid,
  name text,
  created_at timestamptz,
  updated_at timestamptz,
  status public.room_status,
  deactivated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_room_id is null then
    raise exception using errcode = '22023', message = 'Room ID is required';
  end if;

  update public.rooms as r
  set status = 'deactivated',
      deactivated_at = statement_timestamp()
  where r.id = p_room_id
    and r.owner_user_id = v_user_id
  returning r.* into v_room;

  if not found then
    raise exception using errcode = '42501', message = 'Room ownership is required';
  end if;

  return query
  select v_room.id, v_room.owner_user_id, v_room.name, v_room.created_at,
         v_room.updated_at, v_room.status, v_room.deactivated_at;
end;
$$;

revoke all on function public.deactivate_room(uuid)
  from public, anon, authenticated;
grant execute on function public.deactivate_room(uuid)
  to authenticated;

create or replace function public.reactivate_room(p_room_id uuid)
returns table (
  id uuid,
  owner_user_id uuid,
  name text,
  created_at timestamptz,
  updated_at timestamptz,
  status public.room_status,
  deactivated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_room_id is null then
    raise exception using errcode = '22023', message = 'Room ID is required';
  end if;

  update public.rooms as r
  set status = 'active',
      deactivated_at = null
  where r.id = p_room_id
    and r.owner_user_id = v_user_id
  returning r.* into v_room;

  if not found then
    raise exception using errcode = '42501', message = 'Room ownership is required';
  end if;

  return query
  select v_room.id, v_room.owner_user_id, v_room.name, v_room.created_at,
         v_room.updated_at, v_room.status, v_room.deactivated_at;
end;
$$;

revoke all on function public.reactivate_room(uuid)
  from public, anon, authenticated;
grant execute on function public.reactivate_room(uuid)
  to authenticated;

-- Permanently removes a room and every dependent row. CASCADE on the
-- related foreign keys already wipes sessions / media / subtitles / playback /
-- chat, so the only thing the RPC needs to assert is ownership.
create or replace function public.hard_delete_room(p_room_id uuid)
returns table (id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_room_id is null then
    raise exception using errcode = '22023', message = 'Room ID is required';
  end if;

  delete from public.rooms as r
  where r.id = p_room_id
    and r.owner_user_id = v_user_id
  returning r.id into v_deleted_id;

  if v_deleted_id is null then
    raise exception using errcode = '42501', message = 'Room ownership is required';
  end if;

  return query select v_deleted_id;
end;
$$;

revoke all on function public.hard_delete_room(uuid)
  from public, anon, authenticated;
grant execute on function public.hard_delete_room(uuid)
  to authenticated;

-- Broadcast lifecycle events on the same private channel the room already
-- uses, so any open watcher (and the owner in another tab) sees the change.
create or replace function private.broadcast_room_lifecycle()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event text;
begin
  if tg_op = 'DELETE' then
    v_event := 'room_removed';
    perform private.send_room_event(
      old.id,
      v_event,
      pg_catalog.jsonb_build_object('id', old.id)
    );
    return old;
  end if;

  if (tg_op = 'UPDATE')
     and (old.status is distinct from new.status) then
    v_event := case when new.status = 'deactivated' then 'room_deactivated' else 'room_reactivated' end;
    perform private.send_room_event(
      new.id,
      v_event,
      pg_catalog.jsonb_build_object(
        'status', new.status,
        'deactivated_at', new.deactivated_at
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function private.broadcast_room_lifecycle()
  from public, anon, authenticated;

drop trigger if exists rooms_broadcast_lifecycle on public.rooms;
create trigger rooms_broadcast_lifecycle
after update of status on public.rooms
for each row execute function private.broadcast_room_lifecycle();

drop trigger if exists rooms_broadcast_removed on public.rooms;
create trigger rooms_broadcast_removed
after delete on public.rooms
for each row execute function private.broadcast_room_lifecycle();

-- Hide deactivated rooms from the public join preview. Anyone with the link
-- still receives a structured "room unavailable" response instead of
-- silently joining a paused room.
create or replace function public.get_room_join_preview(p_room_id uuid)
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
  where r.id = p_room_id
    and r.status = 'active';
$$;
