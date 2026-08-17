begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

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

select ok(
  to_regprocedure('private.realtime_room_id(text)') is not null
    and to_regprocedure('private.send_room_event(uuid,text,jsonb)') is not null,
  'private topic parsing and database Broadcast helpers exist'
);

select is(
  (
    select array_agg(policyname order by policyname)
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
  ),
  array[
    'realtime_room_member_presence_send',
    'realtime_room_member_receive'
  ]::name[],
  'realtime.messages has only the two explicit room policies'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and roles = array['authenticated']::name[]
      and cmd in ('SELECT', 'INSERT')
  ),
  2::bigint,
  'Realtime authorization is authenticated-only for receive and Presence send'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and cmd = 'INSERT'
      and with_check like '%extension = ''presence''%'
      and with_check not like '%broadcast%'
  ),
  1::bigint,
  'the send policy permits Presence without granting client Broadcast'
);

select is(
  private.realtime_room_id('room:11111111-1111-4111-8111-111111111111'),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'the exact room topic parses to its UUID'
);

select is(
  private.realtime_room_id('rooms:11111111-1111-4111-8111-111111111111'),
  null,
  'a noncanonical topic prefix is rejected'
);

select is(
  private.realtime_room_id('room:not-a-uuid'),
  null,
  'a malformed topic is rejected without a cast error'
);

select is(
  (
    select count(*)
    from pg_proc
    where oid in (
      'private.realtime_room_id(text)'::regprocedure,
      'private.send_room_event(uuid,text,jsonb)'::regprocedure,
      'private.broadcast_playback_state_changed()'::regprocedure,
      'private.broadcast_media_items_statement()'::regprocedure,
      'private.broadcast_subtitle_metadata_changed()'::regprocedure
    )
      and proconfig = array['search_path=""']::text[]
  ),
  5::bigint,
  'every Prompt 5 database function has an empty search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'private.realtime_room_id(text)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'anon',
      'private.realtime_room_id(text)',
      'EXECUTE'
    ),
  'only authenticated policy evaluation can execute the topic parser'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.send_room_event(uuid,text,jsonb)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'anon',
      'private.send_room_event(uuid,text,jsonb)',
      'EXECUTE'
    ),
  'clients cannot execute the database Broadcast helper'
);

select is(
  (
    select count(*)
    from pg_proc as p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) as acl
    where p.oid in (
      'private.realtime_room_id(text)'::regprocedure,
      'private.send_room_event(uuid,text,jsonb)'::regprocedure,
      'private.broadcast_playback_state_changed()'::regprocedure,
      'private.broadcast_media_items_statement()'::regprocedure,
      'private.broadcast_subtitle_metadata_changed()'::regprocedure
    )
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  0::bigint,
  'PUBLIC cannot execute Prompt 5 database functions'
);

insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'realtime-owner-a@example.test', false, now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', null, true, now(), now()),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', null, true, now(), now());

create temporary table realtime_context (
  key text primary key,
  value uuid not null
);
grant select, insert on table pg_temp.realtime_context to authenticated, anon;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

insert into pg_temp.realtime_context (key, value)
select 'room_a', room_id
from public.create_room('Realtime Room A');

select ok(
  (
    select count(*) = 1
    from public.join_room(
      (select value from pg_temp.realtime_context where key = 'room_a'),
      'Owner A'
    )
  ),
  'Owner A has a durable room session for Presence identity'
);

select set_config(
  'realtime.topic',
  'room:' || (select value::text from pg_temp.realtime_context where key = 'room_a'),
  true
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into realtime.messages (topic, extension, event, private)
    values (current_setting('realtime.topic'), 'presence', 'track', true)
  $sql$),
  null,
  'Owner A can publish Presence on the private room topic'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into realtime.messages (topic, extension, event, payload, private)
    values (
      current_setting('realtime.topic'),
      'broadcast',
      'playback_state_changed',
      '{"state_version":999}'::jsonb,
      true
    )
  $sql$),
  '42501',
  'Owner A cannot bypass the database by publishing application Broadcast'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","is_anonymous":true}';

select is(
  (
    select count(*)
    from public.join_room(
      (select value from pg_temp.realtime_context where key = 'room_a'),
      'Viewer B'
    )
  ),
  1::bigint,
  'authenticated anonymous Viewer B joins the room durably'
);

select set_config(
  'realtime.topic',
  'room:' || (select value::text from pg_temp.realtime_context where key = 'room_a'),
  true
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into realtime.messages (topic, extension, event, private)
    values (current_setting('realtime.topic'), 'presence', 'track', true)
  $sql$),
  null,
  'joined Viewer B can publish Presence'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into realtime.messages (topic, extension, event, payload, private)
    values (
      current_setting('realtime.topic'),
      'broadcast',
      'queue_changed',
      '{}'::jsonb,
      true
    )
  $sql$),
  '42501',
  'joined Viewer B cannot forge queue Broadcast'
);

reset role;

insert into public.media_items (
  id, room_id, title, source_url, source_type, queue_position, created_by
)
values (
  '20000000-0000-4000-8000-0000000000a1',
  (select value from pg_temp.realtime_context where key = 'room_a'),
  'Realtime Test Media',
  'https://media.example.test/realtime.mp4',
  'mp4',
  0,
  '00000000-0000-4000-8000-0000000000a1'
);

select is(
  (
    select count(*)
    from realtime.messages
    where topic = 'room:' || (
        select value::text from pg_temp.realtime_context where key = 'room_a'
      )
      and extension = 'broadcast'
      and event = 'queue_changed'
      and private is true
      and payload->>'room_id' = (
        select value::text from pg_temp.realtime_context where key = 'room_a'
      )
  ),
  1::bigint,
  'a committed queue mutation creates one compact room-scoped private database Broadcast'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select ok(
  (
    select result.state_version = 1
    from public.room_select_media(
      (select value from pg_temp.realtime_context where key = 'room_a'),
      0,
      '20000000-0000-4000-8000-0000000000a1',
      false
    ) as result
  ),
  'the authoritative playback RPC commits version one'
);

select ok(
  (
    select (message.payload->>'state_version')::bigint = state.state_version
      and message.payload->>'status' = state.status::text
      and message.payload->>'current_media_id' = state.current_media_id::text
    from public.room_playback_state as state
    join lateral (
      select payload
      from realtime.messages
      where topic = 'room:' || state.room_id::text
        and extension = 'broadcast'
        and event = 'playback_state_changed'
        and private is true
      order by inserted_at desc, id desc
      limit 1
    ) as message on true
    where state.room_id = (
      select value from pg_temp.realtime_context where key = 'room_a'
    )
  ),
  'the playback Broadcast matches the canonical committed row and state_version'
);

select set_config(
  'realtime.topic',
  'room:' || (select value::text from pg_temp.realtime_context where key = 'room_a'),
  true
);

select ok(
  exists (
    select 1
    from realtime.messages
    where event = 'playback_state_changed'
      and extension = 'broadcast'
  ),
  'Owner A can receive database-originated Broadcast on the room topic'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","is_anonymous":true}';
select set_config(
  'realtime.topic',
  'room:' || (select value::text from pg_temp.realtime_context where key = 'room_a'),
  true
);

select ok(
  exists (
    select 1
    from realtime.messages
    where event = 'playback_state_changed'
      and extension = 'broadcast'
  ),
  'joined Viewer B can receive database-originated Broadcast'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated","is_anonymous":true}';
select set_config(
  'realtime.topic',
  'room:' || (select value::text from pg_temp.realtime_context where key = 'room_a'),
  true
);

select is(
  (select count(*) from realtime.messages),
  0::bigint,
  'Outsider C cannot receive room Broadcast or Presence messages'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into realtime.messages (topic, extension, event, private)
    values (current_setting('realtime.topic'), 'presence', 'track', true)
  $sql$),
  '42501',
  'Outsider C cannot publish Presence on Room A'
);

select set_config('realtime.topic', 'room:not-a-uuid', true);
select is(
  (select count(*) from realtime.messages),
  0::bigint,
  'malformed topics fail closed without leaking messages'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select set_config(
  'realtime.topic',
  'room:' || (select value::text from pg_temp.realtime_context where key = 'room_a'),
  true
);

select is(
  (select count(*) from realtime.messages),
  0::bigint,
  'unauthenticated requests cannot receive private room messages'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into realtime.messages (topic, extension, event, private)
    values (current_setting('realtime.topic'), 'presence', 'track', true)
  $sql$),
  '42501',
  'unauthenticated requests cannot publish Presence'
);

reset role;

select * from finish();
rollback;
