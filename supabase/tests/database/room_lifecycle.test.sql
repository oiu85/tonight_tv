begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(29);

create function pg_temp.sqlstate_of(command text)
returns text
language plpgsql
as $$
begin
  execute command;
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

select ok(to_regprocedure('public.list_owned_rooms(boolean)') is not null, 'list_owned_rooms exists');
select ok(to_regprocedure('public.deactivate_room(uuid)') is not null, 'deactivate_room exists');
select ok(to_regprocedure('public.reactivate_room(uuid)') is not null, 'reactivate_room exists');
select ok(to_regprocedure('public.hard_delete_room(uuid)') is not null, 'hard_delete_room exists');
select ok(to_regtype('public.room_status') is not null, 'room_status enum exists');

select is(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.room_status'::regtype),
  array['active', 'deactivated']::text[],
  'room_status only carries the two lifecycle states'
);

select has_column('public', 'rooms', 'status', 'rooms has a status column');
select has_column('public', 'rooms', 'deactivated_at', 'rooms has a deactivated_at column');
select col_is_null('public', 'rooms', 'deactivated_at', 'deactivated_at is nullable');

-- Grant posture: authenticated owns the lifecycle RPCs and the public schema
-- (and anonymous) cannot execute them.
select is(
  (
    select count(*) from pg_proc as p
    where p.oid in (
      'public.list_owned_rooms(boolean)'::regprocedure,
      'public.deactivate_room(uuid)'::regprocedure,
      'public.reactivate_room(uuid)'::regprocedure,
      'public.hard_delete_room(uuid)'::regprocedure
    ) and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  4::bigint,
  'authenticated can execute every room lifecycle RPC'
);

select is(
  (
    select count(*) from pg_proc as p
    where p.oid in (
      'public.list_owned_rooms(boolean)'::regprocedure,
      'public.deactivate_room(uuid)'::regprocedure,
      'public.reactivate_room(uuid)'::regprocedure,
      'public.hard_delete_room(uuid)'::regprocedure
    ) and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0::bigint,
  'anon cannot execute room lifecycle RPCs'
);

insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'owner-a@example.test', false, now(), now()),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'outsider-c@example.test', false, now(), now());

create temporary table test_context (key text primary key, value uuid not null);
grant select, insert, update on table pg_temp.test_context to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

insert into pg_temp.test_context (key, value)
select 'room_one', room_id from public.create_room('Movie Night');

insert into pg_temp.test_context (key, value)
select 'room_two', room_id from public.create_room('Saturday Cinema');

-- After creation, the new columns default to active + null.
select is(
  (select (status = 'active' and deactivated_at is null)
   from public.rooms
   where id = (select value from pg_temp.test_context where key = 'room_one')),
  true,
  'fresh rooms are active with a null deactivated_at'
);

select results_eq(
  $sql$ select name::text from public.list_owned_rooms(false) order by name $sql$,
  $sql$ values ('Movie Night'), ('Saturday Cinema') $sql$,
  'list_owned_rooms(false) returns only the active rooms in updated_at desc order'
);

select results_eq(
  $sql$ select count(*)::bigint from public.list_owned_rooms(true) $sql$,
  $sql$ values (2::bigint) $sql$,
  'list_owned_rooms(true) returns every room the owner can see'
);

-- Deactivate the second room through the owner-authorized RPC; direct table
-- writes remain unavailable to the authenticated client role.
select * from public.deactivate_room((select value from pg_temp.test_context where key = 'room_two'));

select results_eq(
  $sql$ select name::text from public.list_owned_rooms(false) $sql$,
  $sql$ values ('Movie Night') $sql$,
  'deactivated rooms are hidden from the default listing'
);

select is(
  (select count(*) from public.list_owned_rooms(true)),
  2::bigint,
  'the inclusive listing still shows deactivated rooms'
);

-- Reactivate via the RPC, then ensure the default listing is back to 2.
select is(
  (select count(*) from public.reactivate_room((select value from pg_temp.test_context where key = 'room_two'))),
  1::bigint,
  'reactivate_room returns the row that was updated'
);

select is(
  (select count(*) from public.list_owned_rooms(false)),
  2::bigint,
  'reactivate_room restores the room to the default listing'
);

-- Ownership enforcement: outsider C cannot deactivate / reactivate / hard-delete owner A's rooms.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}';

select is(
  pg_temp.sqlstate_of(
    format(
      'select * from public.deactivate_room(%L)',
      (select value from pg_temp.test_context where key = 'room_one')
    )
  ),
  '42501',
  'outsider cannot deactivate a room they do not own'
);

select is(
  pg_temp.sqlstate_of(
    format(
      'select * from public.hard_delete_room(%L)',
      (select value from pg_temp.test_context where key = 'room_one')
    )
  ),
  '42501',
  'outsider cannot hard-delete a room they do not own'
);

-- Join gating: deactivate owner A's room and prove join_room refuses it.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select * from public.deactivate_room((select value from pg_temp.test_context where key = 'room_one'));

-- Snapshot still works for the owner on a deactivated room.
select ok(
  (select snapshot->'room'->>'status' = 'deactivated'
   from public.get_room_snapshot((select value from pg_temp.test_context where key = 'room_one')) as snapshot),
  'owner can still snapshot their own deactivated room'
);

-- Join preview hides it for non-owners (returns zero rows).
reset role;
select is(
  (select count(*) from public.get_room_join_preview((select value from pg_temp.test_context where key = 'room_one'))),
  0::bigint,
  'deactivated rooms have no public join preview'
);

-- Hard-delete: confirm cascading wipe.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

insert into pg_temp.test_context (key, value)
select 'room_three', room_id from public.create_room('Cleanup Room');

select is(
  (select count(*) from public.hard_delete_room((select value from pg_temp.test_context where key = 'room_three'))),
  1::bigint,
  'hard_delete_room returns the deleted id'
);

select is(
  (select count(*) from public.rooms where id = (select value from pg_temp.test_context where key = 'room_three')),
  0::bigint,
  'hard_delete_room removes the room row'
);

select is(
  (select count(*) from public.room_playback_state where room_id = (select value from pg_temp.test_context where key = 'room_three')),
  0::bigint,
  'hard_delete_room cascades to the playback state'
);

select is(
  pg_temp.sqlstate_of(
    format(
      'select * from public.deactivate_room(%L)',
      'ffffffff-ffff-4fff-8fff-ffffffffffff'
    )
  ),
  '42501',
  'deactivate_room on a room the caller does not own surfaces a permission error'
);

select is(
  pg_temp.sqlstate_of($sql$ select * from public.deactivate_room(null::uuid) $sql$),
  '22023',
  'deactivate_room rejects a null room id'
);

select is(
  pg_temp.sqlstate_of($sql$ select * from public.reactivate_room(null::uuid) $sql$),
  '22023',
  'reactivate_room rejects a null room id'
);

select is(
  pg_temp.sqlstate_of($sql$ select * from public.hard_delete_room(null::uuid) $sql$),
  '22023',
  'hard_delete_room rejects a null room id'
);

select * from finish();
rollback;
