begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(44);

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

select has_function('public', 'add_media_item', array['uuid', 'text', 'text', 'media_source_type', 'text', 'uuid', 'text', 'torrent_input_kind', 'text', 'text', 'text', 'integer', 'text', 'text', 'bigint'], 'add_media_item exists');
select has_function('public', 'edit_media_item', array['uuid', 'uuid', 'text', 'text', 'media_source_type', 'text', 'text', 'torrent_input_kind', 'text', 'text', 'text', 'integer', 'text', 'text', 'bigint'], 'edit_media_item exists');
select has_function('public', 'remove_media_item', array['uuid', 'uuid'], 'remove_media_item exists');
select has_function('public', 'reorder_media_items', array['uuid', 'uuid[]'], 'reorder_media_items exists');

select is(
  (
    select count(*)
    from pg_proc
    where oid in (
      'private.lock_owned_room(uuid)'::regprocedure,
      'public.add_media_item(uuid,text,text,public.media_source_type,text,uuid,text,public.torrent_input_kind,text,text,text,integer,text,text,bigint)'::regprocedure,
      'public.edit_media_item(uuid,uuid,text,text,public.media_source_type,text,text,public.torrent_input_kind,text,text,text,integer,text,text,bigint)'::regprocedure,
      'public.remove_media_item(uuid,uuid)'::regprocedure,
      'public.reorder_media_items(uuid,uuid[])'::regprocedure
    )
      and proconfig = array['search_path=""']::text[]
  ),
  5::bigint,
  'all queue boundary functions use an empty search_path'
);

select is(
  (
    select count(*)
    from pg_proc
    where oid in (
      'public.add_media_item(uuid,text,text,public.media_source_type,text,uuid,text,public.torrent_input_kind,text,text,text,integer,text,text,bigint)'::regprocedure,
      'public.edit_media_item(uuid,uuid,text,text,public.media_source_type,text,text,public.torrent_input_kind,text,text,text,integer,text,text,bigint)'::regprocedure,
      'public.remove_media_item(uuid,uuid)'::regprocedure,
      'public.reorder_media_items(uuid,uuid[])'::regprocedure
    )
      and prosecdef
  ),
  4::bigint,
  'queue RPCs are explicit privileged database boundaries'
);

select is(
  (
    select count(*)
    from pg_proc as p
    where p.oid in (
      'public.add_media_item(uuid,text,text,public.media_source_type,text,uuid,text,public.torrent_input_kind,text,text,text,integer,text,text,bigint)'::regprocedure,
      'public.edit_media_item(uuid,uuid,text,text,public.media_source_type,text,text,public.torrent_input_kind,text,text,text,integer,text,text,bigint)'::regprocedure,
      'public.remove_media_item(uuid,uuid)'::regprocedure,
      'public.reorder_media_items(uuid,uuid[])'::regprocedure
    )
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  4::bigint,
  'authenticated callers may execute the queue RPCs'
);

select is(
  (
    select count(*)
    from pg_proc as p
    where p.oid in (
      'public.add_media_item(uuid,text,text,public.media_source_type,text,uuid,text,public.torrent_input_kind,text,text,text,integer,text,text,bigint)'::regprocedure,
      'public.edit_media_item(uuid,uuid,text,text,public.media_source_type,text,text,public.torrent_input_kind,text,text,text,integer,text,text,bigint)'::regprocedure,
      'public.remove_media_item(uuid,uuid)'::regprocedure,
      'public.reorder_media_items(uuid,uuid[])'::regprocedure
    )
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0::bigint,
  'anon cannot execute queue RPCs'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'media_items'
      and privilege_type <> 'SELECT'
  ),
  0::bigint,
  'queue writes remain RPC-only without direct authenticated table grants'
);

insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'queue-owner-a@example.test', false, now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', null, true, now(), now()),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', null, true, now(), now()),
  ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', 'queue-owner-d@example.test', false, now(), now());

create temporary table queue_context (
  key text primary key,
  value uuid not null
);
grant select, insert on table pg_temp.queue_context to authenticated, anon;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

insert into pg_temp.queue_context (key, value)
select 'room_a', room_id from public.create_room('Queue Room A');

select ok(
  (select count(*) = 1 from public.rooms where id = (select value from pg_temp.queue_context where key = 'room_a')),
  'Owner A creates the private queue room'
);

insert into pg_temp.queue_context (key, value)
select 'media_1', id
from public.add_media_item(
  (select value from pg_temp.queue_context where key = 'room_a'),
  '  First MP4  ',
  '  https://media.example.test/first.mp4  ',
  'mp4'
);

select ok(
  (
    select mi.title = 'First MP4'
      and mi.source_url = 'https://media.example.test/first.mp4'
      and mi.source_type = 'mp4'
      and mi.queue_position = 0
      and mi.created_by = '00000000-0000-4000-8000-0000000000a1'::uuid
    from public.media_items as mi
    where mi.id = (select value from pg_temp.queue_context where key = 'media_1')
  ),
  'add normalizes metadata, appends deterministically, and derives creator identity'
);

insert into pg_temp.queue_context (key, value)
select 'media_2', id
from public.add_media_item(
  (select value from pg_temp.queue_context where key = 'room_a'),
  'Second HLS',
  'https://media.example.test/second.m3u8',
  'hls'
);

select is(
  (select queue_position from public.media_items where id = (select value from pg_temp.queue_context where key = 'media_2')),
  1,
  'second item receives the next deterministic queue position'
);

insert into pg_temp.queue_context (key, value)
select 'media_3', id
from public.add_media_item(
  (select value from pg_temp.queue_context where key = 'room_a'),
  'Auto Source',
  'https://media.example.test/source',
  'auto'
);

select is(
  (select queue_position from public.media_items where id = (select value from pg_temp.queue_context where key = 'media_3')),
  2,
  'third item appends without relying on client-provided position'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.add_media_item(%L::uuid, %L, %L, %L::public.media_source_type)',
    (select value::text from pg_temp.queue_context where key = 'room_a'),
    '   ',
    'https://media.example.test/invalid.mp4',
    'mp4'
  )),
  '22023',
  'empty normalized title is rejected'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.add_media_item(%L::uuid, %L, %L, %L::public.media_source_type)',
    (select value::text from pg_temp.queue_context where key = 'room_a'),
    'Bad URL',
    'javascript:alert(1)',
    'auto'
  )),
  '22023',
  'non-HTTP media source is rejected'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.add_media_item(%L::uuid, %L, %L, %L::public.media_source_type)',
    (select value::text from pg_temp.queue_context where key = 'room_a'),
    'Credential URL',
    'https://user:secret@media.example.test/private.mp4',
    'mp4'
  )),
  '22023',
  'credential-bearing media source is rejected'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}';

insert into pg_temp.queue_context (key, value)
select 'room_d', room_id from public.create_room('Queue Room D');

insert into pg_temp.queue_context (key, value)
select 'media_d', id
from public.add_media_item(
  (select value from pg_temp.queue_context where key = 'room_d'),
  'Other Room Media',
  'https://media.example.test/other.mp4',
  'mp4'
);

select ok(
  (select count(*) = 1 from public.media_items where room_id = (select value from pg_temp.queue_context where key = 'room_d')),
  'a second owner has an isolated queue for cross-room testing'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","is_anonymous":true}';

select ok(
  (
    select count(*) = 1
    from public.join_room(
      (select value from pg_temp.queue_context where key = 'room_a'),
      'Viewer B'
    )
  ),
  'Viewer B joins as an authenticated anonymous member'
);

select is(
  (select count(*) from public.media_items where room_id = (select value from pg_temp.queue_context where key = 'room_a')),
  3::bigint,
  'joined viewer reads the complete room queue through member RLS'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.add_media_item(%L::uuid, %L, %L, %L::public.media_source_type)',
    (select value::text from pg_temp.queue_context where key = 'room_a'),
    'Forbidden',
    'https://media.example.test/forbidden.mp4',
    'mp4'
  )),
  '42501',
  'joined viewer cannot add media'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.edit_media_item(%L::uuid, %L::uuid, %L, %L, %L::public.media_source_type)',
    (select value::text from pg_temp.queue_context where key = 'room_a'),
    (select value::text from pg_temp.queue_context where key = 'media_1'),
    'Forbidden edit',
    'https://media.example.test/forbidden.mp4',
    'mp4'
  )),
  '42501',
  'joined viewer cannot edit media'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.remove_media_item(%L::uuid, %L::uuid)',
    (select value::text from pg_temp.queue_context where key = 'room_a'),
    (select value::text from pg_temp.queue_context where key = 'media_1')
  )),
  '42501',
  'joined viewer cannot remove media'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.reorder_media_items(%L::uuid, array[%L::uuid,%L::uuid,%L::uuid])',
    (select value::text from pg_temp.queue_context where key = 'room_a'),
    (select value::text from pg_temp.queue_context where key = 'media_3'),
    (select value::text from pg_temp.queue_context where key = 'media_2'),
    (select value::text from pg_temp.queue_context where key = 'media_1')
  )),
  '42501',
  'joined viewer cannot reorder media'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated","is_anonymous":true}';

select is(
  (select count(*) from public.media_items),
  0::bigint,
  'outsider cannot enumerate private queue rows'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.add_media_item(%L::uuid, %L, %L, %L::public.media_source_type)',
    (select value::text from pg_temp.queue_context where key = 'room_a'),
    'Outsider',
    'https://media.example.test/outsider.mp4',
    'mp4'
  )),
  '42501',
  'outsider cannot mutate a private queue'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  has_table_privilege('anon', 'public.media_items', 'SELECT'),
  false,
  'unauthenticated caller has no queue table read privilege'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select ok(
  (
    select result.title = 'First MP4 Updated'
      and result.source_url = 'https://media.example.test/first-v2.mp4'
      and result.source_type = 'mp4'
    from public.edit_media_item(
      (select value from pg_temp.queue_context where key = 'room_a'),
      (select value from pg_temp.queue_context where key = 'media_1'),
      ' First MP4 Updated ',
      ' https://media.example.test/first-v2.mp4 ',
      'mp4'
    ) as result
  ),
  'owner edits normalized media metadata through the canonical RPC'
);

select is(
  (select state_version from public.room_playback_state where room_id = (select value from pg_temp.queue_context where key = 'room_a')),
  0::bigint,
  'editing queue metadata does not mutate authoritative playback'
);

reset role;
delete from realtime.messages
where topic = 'room:' || (select value::text from pg_temp.queue_context where key = 'room_a')
  and event = 'queue_changed';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select is(
  (
    select array_agg(result.id order by result.queue_position)
    from public.reorder_media_items(
      (select value from pg_temp.queue_context where key = 'room_a'),
      array[
        (select value from pg_temp.queue_context where key = 'media_3'),
        (select value from pg_temp.queue_context where key = 'media_1'),
        (select value from pg_temp.queue_context where key = 'media_2')
      ]
    ) as result
  ),
  array[
    (select value from pg_temp.queue_context where key = 'media_3'),
    (select value from pg_temp.queue_context where key = 'media_1'),
    (select value from pg_temp.queue_context where key = 'media_2')
  ]::uuid[],
  'atomic reorder returns the final deterministic order'
);

select is(
  (
    select array_agg(mi.queue_position order by mi.queue_position)
    from public.media_items as mi
    where mi.room_id = (select value from pg_temp.queue_context where key = 'room_a')
  ),
  array[0, 1, 2],
  'atomic reorder writes contiguous nonnegative final positions'
);

select is(
  (
    select count(*)
    from realtime.messages
    where topic = 'room:' || (select value::text from pg_temp.queue_context where key = 'room_a')
      and extension = 'broadcast'
      and event = 'queue_changed'
      and private is true
  ),
  1::bigint,
  'one transactional reorder emits exactly one compact queue signal'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.reorder_media_items(%L::uuid, array[%L::uuid,%L::uuid,%L::uuid])',
    (select value::text from pg_temp.queue_context where key = 'room_a'),
    (select value::text from pg_temp.queue_context where key = 'media_3'),
    (select value::text from pg_temp.queue_context where key = 'media_3'),
    (select value::text from pg_temp.queue_context where key = 'media_2')
  )),
  '22023',
  'duplicate reorder IDs are rejected'
);

select is(
  (
    select array_agg(mi.id order by mi.queue_position)
    from public.media_items as mi
    where mi.room_id = (select value from pg_temp.queue_context where key = 'room_a')
  ),
  array[
    (select value from pg_temp.queue_context where key = 'media_3'),
    (select value from pg_temp.queue_context where key = 'media_1'),
    (select value from pg_temp.queue_context where key = 'media_2')
  ]::uuid[],
  'failed duplicate reorder leaves the queue unchanged atomically'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.reorder_media_items(%L::uuid, array[%L::uuid,%L::uuid])',
    (select value::text from pg_temp.queue_context where key = 'room_a'),
    (select value::text from pg_temp.queue_context where key = 'media_3'),
    (select value::text from pg_temp.queue_context where key = 'media_1')
  )),
  '22023',
  'partial reorder set is rejected'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.reorder_media_items(%L::uuid, array[%L::uuid,%L::uuid,%L::uuid])',
    (select value::text from pg_temp.queue_context where key = 'room_a'),
    (select value::text from pg_temp.queue_context where key = 'media_3'),
    (select value::text from pg_temp.queue_context where key = 'media_1'),
    (select value::text from pg_temp.queue_context where key = 'media_d')
  )),
  '22023',
  'cross-room reorder ID is rejected'
);

select ok(
  (
    select result.current_media_id = (select value from pg_temp.queue_context where key = 'media_3')
      and result.state_version = 1
    from public.room_select_media(
      (select value from pg_temp.queue_context where key = 'room_a'),
      0,
      (select value from pg_temp.queue_context where key = 'media_3'),
      false
    ) as result
  ),
  'owner selects the first reordered item without hidden queue mutation'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.remove_media_item(%L::uuid, %L::uuid)',
    (select value::text from pg_temp.queue_context where key = 'room_a'),
    (select value::text from pg_temp.queue_context where key = 'media_3')
  )),
  '55000',
  'current media deletion returns the explicit domain error'
);

select ok(
  (
    select exists (
      select 1 from public.media_items
      where id = (select value from pg_temp.queue_context where key = 'media_3')
    )
      and ps.current_media_id = (select value from pg_temp.queue_context where key = 'media_3')
      and ps.state_version = 1
    from public.room_playback_state as ps
    where ps.room_id = (select value from pg_temp.queue_context where key = 'room_a')
  ),
  'rejected current deletion preserves media and playback state'
);

select ok(
  (
    select result.id = (select value from pg_temp.queue_context where key = 'media_2')
    from public.remove_media_item(
      (select value from pg_temp.queue_context where key = 'room_a'),
      (select value from pg_temp.queue_context where key = 'media_2')
    ) as result
  ),
  'owner removes a non-current media item'
);

select is(
  (select count(*) from public.media_items where room_id = (select value from pg_temp.queue_context where key = 'room_a')),
  2::bigint,
  'non-current removal leaves the remaining queue intact'
);

select ok(
  (
    select result.current_media_id = (select value from pg_temp.queue_context where key = 'media_1')
      and result.status = 'playing'
      and result.anchor_position_sec = 0
      and result.state_version = 2
    from public.room_play_next(
      (select value from pg_temp.queue_context where key = 'room_a'),
      1
    ) as result
  ),
  'manual Play Next uses the reordered queue and remains authoritative'
);

select ok(
  (
    select result.source_url = 'https://media.example.test/current-replaced.mp4'
    from public.edit_media_item(
      (select value from pg_temp.queue_context where key = 'room_a'),
      (select value from pg_temp.queue_context where key = 'media_1'),
      'Current Replaced',
      'https://media.example.test/current-replaced.mp4',
      'mp4'
    ) as result
  ),
  'owner can replace current source metadata without deleting the item'
);

select ok(
  (
    select ps.current_media_id = (select value from pg_temp.queue_context where key = 'media_1')
      and ps.status = 'playing'
      and ps.state_version = 2
    from public.room_playback_state as ps
    where ps.room_id = (select value from pg_temp.queue_context where key = 'room_a')
  ),
  'editing the current source never sends a hidden playback command'
);

select is(
  (
    select array_agg(mi.id order by mi.queue_position, mi.id)
    from public.media_items as mi
    where mi.room_id = (select value from pg_temp.queue_context where key = 'room_a')
  ),
  array[
    (select value from pg_temp.queue_context where key = 'media_3'),
    (select value from pg_temp.queue_context where key = 'media_1')
  ]::uuid[],
  'queue remains deterministic after CRUD, reorder, and manual next'
);

select * from finish();
rollback;
