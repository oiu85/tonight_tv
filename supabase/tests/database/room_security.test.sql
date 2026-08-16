begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(51);

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

select ok(to_regprocedure('public.create_room(text)') is not null, 'create_room exists');
select ok(to_regprocedure('public.join_room(uuid,text)') is not null, 'join_room exists');
select ok(to_regprocedure('public.get_server_time()') is not null, 'get_server_time exists');
select ok(to_regprocedure('public.get_room_snapshot(uuid,integer)') is not null, 'get_room_snapshot exists');
select ok(to_regprocedure('public.get_room_join_preview(uuid)') is not null, 'exact-ID join preview exists');

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'rooms',
        'room_sessions',
        'media_items',
        'subtitles',
        'room_playback_state',
        'chat_messages'
      )
  ),
  6::bigint,
  'each room-scoped table has exactly one policy'
);

select is(
  (
    select array_agg(policyname order by policyname)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'rooms',
        'room_sessions',
        'media_items',
        'subtitles',
        'room_playback_state',
        'chat_messages'
      )
  ),
  array[
    'chat_messages_member_select',
    'media_items_member_select',
    'room_playback_state_member_select',
    'room_sessions_member_select',
    'rooms_member_select',
    'subtitles_member_select'
  ]::name[],
  'only the named member SELECT policies are installed'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'rooms',
        'room_sessions',
        'media_items',
        'subtitles',
        'room_playback_state',
        'chat_messages'
      )
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
  ),
  6::bigint,
  'all room policies are authenticated-only SELECT policies'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'rooms',
        'room_sessions',
        'media_items',
        'subtitles',
        'room_playback_state',
        'chat_messages'
      )
      and cmd <> 'SELECT'
  ),
  0::bigint,
  'no direct client write policies exist'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name in (
        'rooms',
        'room_sessions',
        'media_items',
        'subtitles',
        'room_playback_state',
        'chat_messages'
      )
      and privilege_type <> 'SELECT'
  ),
  0::bigint,
  'authenticated has no direct table-write grant'
);

select is(
  (
    select count(*)
    from pg_proc as p
    where p.oid in (
      'public.create_room(text)'::regprocedure,
      'public.join_room(uuid,text)'::regprocedure,
      'public.get_server_time()'::regprocedure,
      'public.get_room_join_preview(uuid)'::regprocedure,
      'public.get_room_snapshot(uuid,integer)'::regprocedure,
      'private.authorized_room_ids()'::regprocedure
    )
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  6::bigint,
  'authenticated can execute only the six required room entry points/helpers'
);

select is(
  (
    select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
    from pg_proc as p
    where p.oid in (
      'public.create_room(text)'::regprocedure,
      'public.join_room(uuid,text)'::regprocedure,
      'public.get_server_time()'::regprocedure,
      'public.get_room_join_preview(uuid)'::regprocedure,
      'public.get_room_snapshot(uuid,integer)'::regprocedure,
      'private.authorized_room_ids()'::regprocedure
    )
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  array['get_room_join_preview(uuid)']::text[],
  'anon can execute only the exact-ID safe preview'
);

select is(
  (
    select count(*)
    from pg_proc as p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) as acl
    where p.oid in (
      'public.set_updated_at()'::regprocedure,
      'public.enforce_playback_state_version()'::regprocedure,
      'public.create_room(text)'::regprocedure,
      'public.join_room(uuid,text)'::regprocedure,
      'public.get_server_time()'::regprocedure,
      'public.get_room_join_preview(uuid)'::regprocedure,
      'public.get_room_snapshot(uuid,integer)'::regprocedure,
      'private.authorized_room_ids()'::regprocedure
    )
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  0::bigint,
  'PUBLIC cannot execute any reviewed application function'
);

select is(
  (
    select count(*)
    from pg_proc
    where oid in (
      'public.create_room(text)'::regprocedure,
      'public.join_room(uuid,text)'::regprocedure,
      'public.get_room_join_preview(uuid)'::regprocedure,
      'public.get_room_snapshot(uuid,integer)'::regprocedure,
      'private.authorized_room_ids()'::regprocedure
    )
      and prosecdef
  ),
  5::bigint,
  'only the five privilege-crossing functions are SECURITY DEFINER'
);

select is(
  (
    select count(*)
    from pg_proc
    where oid in (
      'public.set_updated_at()'::regprocedure,
      'public.enforce_playback_state_version()'::regprocedure,
      'public.create_room(text)'::regprocedure,
      'public.join_room(uuid,text)'::regprocedure,
      'public.get_server_time()'::regprocedure,
      'public.get_room_join_preview(uuid)'::regprocedure,
      'public.get_room_snapshot(uuid,integer)'::regprocedure,
      'private.authorized_room_ids()'::regprocedure
    )
      and proconfig = array['search_path=""']::text[]
  ),
  8::bigint,
  'every function from Prompts 2 and 3 has an empty search_path'
);

select is(
  (
    select pg_get_function_identity_arguments('public.create_room(text)'::regprocedure)
  ),
  'p_name text',
  'create_room accepts no caller-supplied owner identity'
);

select is(
  (
    select pg_get_function_identity_arguments('public.join_room(uuid,text)'::regprocedure)
  ),
  'p_room_id uuid, p_display_name text',
  'join_room accepts no caller-supplied user identity'
);

select ok(
  has_schema_privilege('authenticated', 'private', 'USAGE')
    and not has_schema_privilege('anon', 'private', 'USAGE'),
  'the private policy-helper schema is available only to authenticated requests'
);

insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'owner-a@example.test', false, now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', null, true, now(), now()),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'outsider-c@example.test', false, now(), now());

create temporary table test_context (
  key text primary key,
  value uuid not null
);
grant select, insert, update on table pg_temp.test_context to authenticated, anon;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

insert into pg_temp.test_context (key, value)
select 'room_a', room_id
from public.create_room('  Movie Night  ');

insert into pg_temp.test_context (key, value)
select 'room_a_secondary', room_id
from public.create_room('Owner Secondary');

select ok(
  (
    select r.name = 'Movie Night'
      and r.owner_user_id = '00000000-0000-4000-8000-0000000000a1'::uuid
    from public.rooms as r
    where r.id = (select value from pg_temp.test_context where key = 'room_a')
  ),
  'Owner A creates a normalized room owned only by auth.uid()'
);

select is(
  (
    select count(*)
    from public.room_playback_state
    where room_id = (select value from pg_temp.test_context where key = 'room_a')
      and status = 'idle'
      and current_media_id is null
      and state_version = 0
  ),
  1::bigint,
  'create_room atomically creates exactly one canonical playback row'
);

select is(
  (select count(*) from public.rooms),
  2::bigint,
  'Owner A can read both rooms they created'
);

select is(
  pg_temp.sqlstate_of($sql$select * from public.create_room('   ')$sql$),
  '22023',
  'create_room rejects an invalid normalized name'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","is_anonymous":true}';

select is((select count(*) from public.rooms), 0::bigint, 'Viewer B cannot read Room A before joining');
select is((select count(*) from public.room_playback_state), 0::bigint, 'Viewer B cannot read Room A playback before joining');

select is(
  (
    select pg_catalog.jsonb_build_object(
      'room_id', preview.room_id,
      'room_name', preview.room_name,
      'current_title', preview.current_title,
      'has_active_media', preview.has_active_media
    )
    from public.get_room_join_preview(
      (select value from pg_temp.test_context where key = 'room_a')
    ) as preview
  ),
  pg_catalog.jsonb_build_object(
    'room_id', (select value from pg_temp.test_context where key = 'room_a'),
    'room_name', 'Movie Night',
    'current_title', null,
    'has_active_media', false
  ),
  'pre-join preview returns only the minimal exact-ID contract'
);

select is(
  (
    select count(*)
    from public.get_room_join_preview('ffffffff-ffff-4fff-8fff-ffffffffffff')
  ),
  0::bigint,
  'an unknown exact room ID has no preview row'
);

select is(
  (select count(*) from public.room_sessions),
  0::bigint,
  'preview does not create durable membership'
);

select ok(
  (
    select joined.user_id = '00000000-0000-4000-8000-0000000000b2'::uuid
      and joined.display_name = 'Viewer B'
    from public.join_room(
      (select value from pg_temp.test_context where key = 'room_a'),
      '  Viewer B  '
    ) as joined
  ),
  'authenticated anonymous Viewer B joins only as their Auth identity'
);

select is(
  (
    select count(*)
    from public.join_room(
      (select value from pg_temp.test_context where key = 'room_a'),
      'Viewer B Updated'
    )
  ),
  1::bigint,
  'repeated join returns the single canonical membership'
);

select is(
  (
    select count(*)
    from public.room_sessions
    where room_id = (select value from pg_temp.test_context where key = 'room_a')
      and user_id = '00000000-0000-4000-8000-0000000000b2'
  ),
  1::bigint,
  'repeated join cannot create duplicate memberships'
);

select is(
  (
    select display_name
    from public.room_sessions
    where room_id = (select value from pg_temp.test_context where key = 'room_a')
      and user_id = '00000000-0000-4000-8000-0000000000b2'
  ),
  'Viewer B Updated',
  'repeated join safely updates the caller display name'
);

select is(
  (select count(*) from public.rooms),
  1::bigint,
  'Viewer B can read Room A after joining without seeing other rooms'
);

select ok(
  (select count(*) from public.room_sessions) = 1
    and (select count(*) from public.room_playback_state) = 1,
  'Viewer B can read joined-room membership and playback data'
);

select is(
  pg_temp.sqlstate_of(format(
    'insert into public.room_sessions (room_id, user_id, display_name) values (%L::uuid, %L::uuid, %L)',
    (select value::text from pg_temp.test_context where key = 'room_a'),
    '00000000-0000-4000-8000-0000000000c3',
    'Forged Outsider'
  )),
  '42501',
  'Viewer B cannot create a membership row for another user'
);

select is(
  pg_temp.sqlstate_of(format(
    'update public.room_playback_state set anchor_position_sec = 10, state_version = 1 where room_id = %L::uuid',
    (select value::text from pg_temp.test_context where key = 'room_a')
  )),
  '42501',
  'Viewer B cannot directly update playback state'
);

select is(
  pg_temp.sqlstate_of(format(
    'update public.rooms set owner_user_id = %L::uuid where id = %L::uuid',
    '00000000-0000-4000-8000-0000000000b2',
    (select value::text from pg_temp.test_context where key = 'room_a')
  )),
  '42501',
  'Viewer B cannot mutate room ownership'
);

select is(
  pg_temp.sqlstate_of(format(
    'insert into public.media_items (room_id, title, source_url, queue_position, created_by) values (%L::uuid, %L, %L, 0, %L::uuid)',
    (select value::text from pg_temp.test_context where key = 'room_a'),
    'Forbidden media',
    'https://media.example.test/forbidden.mp4',
    '00000000-0000-4000-8000-0000000000b2'
  )),
  '42501',
  'Viewer B cannot directly mutate the media queue'
);

select is(
  pg_temp.sqlstate_of(format(
    'insert into public.subtitles (room_id, media_id, label, storage_path, created_by) values (%L::uuid, %L::uuid, %L, %L, %L::uuid)',
    (select value::text from pg_temp.test_context where key = 'room_a'),
    '99999999-9999-4999-8999-999999999999',
    'Forbidden subtitle',
    'rooms/forbidden/media/forbidden/subtitle.vtt',
    '00000000-0000-4000-8000-0000000000b2'
  )),
  '42501',
  'Viewer B cannot directly mutate subtitle metadata'
);

select is(
  pg_temp.sqlstate_of(format(
    'insert into public.chat_messages (room_id, user_id, sender_display_name, body) values (%L::uuid, %L::uuid, %L, %L)',
    (select value::text from pg_temp.test_context where key = 'room_a'),
    '00000000-0000-4000-8000-0000000000b2',
    'Viewer B',
    'Forbidden direct chat'
  )),
  '42501',
  'chat insert remains reserved for a later hardened RPC'
);

reset role;

insert into public.media_items (
  id, room_id, title, source_url, source_type, queue_position, created_by
)
values
  (
    '20000000-0000-4000-8000-0000000000a1',
    (select value from pg_temp.test_context where key = 'room_a'),
    'Second in queue',
    'https://media.example.test/second.m3u8',
    'hls',
    10,
    '00000000-0000-4000-8000-0000000000a1'
  ),
  (
    '20000000-0000-4000-8000-0000000000a2',
    (select value from pg_temp.test_context where key = 'room_a'),
    'First in queue',
    'https://media.example.test/first.mp4',
    'mp4',
    1,
    '00000000-0000-4000-8000-0000000000a1'
  ),
  (
    '20000000-0000-4000-8000-0000000000ff',
    (select value from pg_temp.test_context where key = 'room_a_secondary'),
    'Cross-room hidden',
    'https://media.example.test/hidden.mp4',
    'mp4',
    0,
    '00000000-0000-4000-8000-0000000000a1'
  );

update public.room_playback_state
set
  current_media_id = '20000000-0000-4000-8000-0000000000a2',
  status = 'playing',
  anchor_position_sec = 12.5,
  anchor_server_time = statement_timestamp(),
  state_version = 1
where room_id = (select value from pg_temp.test_context where key = 'room_a');

insert into public.subtitles (
  id, room_id, media_id, label, language_code, storage_path, created_by
)
values (
  '30000000-0000-4000-8000-0000000000a1',
  (select value from pg_temp.test_context where key = 'room_a'),
  '20000000-0000-4000-8000-0000000000a2',
  'English',
  'en',
  format(
    'rooms/%s/media/20000000-0000-4000-8000-0000000000a2/30000000-0000-4000-8000-0000000000a1.vtt',
    (select value from pg_temp.test_context where key = 'room_a')
  ),
  '00000000-0000-4000-8000-0000000000a1'
);

insert into public.chat_messages (
  room_id, user_id, sender_display_name, body, created_at
)
select
  (select value from pg_temp.test_context where key = 'room_a'),
  '00000000-0000-4000-8000-0000000000b2',
  'Viewer B Updated',
  format('Message %s', sequence_number),
  '2026-08-17 00:00:00+00'::timestamptz + (sequence_number * interval '1 second')
from generate_series(1, 105) as sequence_number;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","is_anonymous":true}';

select ok(
  (
    select snapshot->'room'->>'id' = (select value::text from pg_temp.test_context where key = 'room_a')
      and snapshot->'caller'->>'user_id' = '00000000-0000-4000-8000-0000000000b2'
      and (snapshot->'caller'->>'is_owner')::boolean = false
    from (select public.get_room_snapshot(
      (select value from pg_temp.test_context where key = 'room_a'),
      50
    ) as snapshot) as result
  ),
  'Viewer B can fetch a snapshot only after joining and sees their caller identity'
);

select is(
  (
    select array_agg(item->>'title' order by ordinal)
    from pg_catalog.jsonb_array_elements(
      public.get_room_snapshot(
        (select value from pg_temp.test_context where key = 'room_a'),
        50
      )->'queue'
    ) with ordinality as queue(item, ordinal)
  ),
  array['First in queue', 'Second in queue'],
  'snapshot queue is deterministic and excludes cross-room media'
);

select ok(
  (
    select snapshot->'current_media'->>'title' = 'First in queue'
      and pg_catalog.jsonb_array_length(snapshot->'subtitles') = 1
      and snapshot->'subtitles'->0->>'label' = 'English'
    from (select public.get_room_snapshot(
      (select value from pg_temp.test_context where key = 'room_a'),
      50
    ) as snapshot) as result
  ),
  'snapshot includes authoritative current media and only its subtitles'
);

select is(
  (
    select array_agg(item->>'body' order by ordinal)
    from pg_catalog.jsonb_array_elements(
      public.get_room_snapshot(
        (select value from pg_temp.test_context where key = 'room_a'),
        2
      )->'recent_chat'
    ) with ordinality as chat(item, ordinal)
  ),
  array['Message 104', 'Message 105'],
  'bounded recent chat is returned in chronological display order'
);

select is(
  pg_catalog.jsonb_array_length(
    public.get_room_snapshot(
      (select value from pg_temp.test_context where key = 'room_a'),
      1000
    )->'recent_chat'
  ),
  100,
  'snapshot clamps the recent-chat limit server-side'
);

select ok(
  not (
    public.get_room_snapshot(
      (select value from pg_temp.test_context where key = 'room_a'),
      50
    ) ? 'presence'
  ),
  'snapshot never includes ephemeral Presence data'
);

select is(
  pg_temp.sqlstate_of(format(
    'select public.get_room_snapshot(%L::uuid, 50)',
    (select value::text from pg_temp.test_context where key = 'room_a_secondary')
  )),
  '42501',
  'Viewer B cannot fetch a snapshot for an unjoined room'
);

select ok(
  public.get_server_time() between statement_timestamp() - interval '5 seconds'
    and statement_timestamp() + interval '5 seconds',
  'an authenticated member can sample database server time'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}';

select is((select count(*) from public.rooms), 0::bigint, 'Outsider C cannot enumerate private rooms');
select is((select count(*) from public.media_items), 0::bigint, 'Outsider C cannot read private room data');
select is(
  pg_temp.sqlstate_of(format(
    'select public.get_room_snapshot(%L::uuid, 50)',
    (select value::text from pg_temp.test_context where key = 'room_a')
  )),
  '42501',
  'Outsider C cannot fetch Room A snapshot'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select ok(
  (
    select preview.room_name = 'Movie Night'
      and preview.current_title = 'First in queue'
      and preview.has_active_media
    from public.get_room_join_preview(
      (select value from pg_temp.test_context where key = 'room_a')
    ) as preview
  ),
  'unauthenticated exact-ID preview exposes only safe pre-join fields'
);

reset role;

select * from finish();
rollback;
