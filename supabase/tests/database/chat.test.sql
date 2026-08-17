begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

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

create temporary table chat_context (
  key text primary key,
  value uuid not null
);
grant select, insert on table pg_temp.chat_context to authenticated, anon;

select ok(
  to_regprocedure('public.send_chat_message(uuid,text)') is not null,
  'send_chat_message exists'
);

select ok(
  to_regclass('public.chat_messages_room_sender_rate_idx') is not null,
  'chat rate-limit lookup index exists'
);

select is(
  (
    select count(*)
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'send_chat_message'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ),
  1::bigint,
  'authenticated can execute the chat RPC'
);

select is(
  (
    select count(*)
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'send_chat_message'
      and grantee in ('anon', 'public')
      and privilege_type = 'EXECUTE'
  ),
  0::bigint,
  'anon and PUBLIC cannot execute the chat RPC'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'chat_messages'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ),
  0::bigint,
  'client roles cannot directly mutate chat_messages'
);

insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'chat-owner@example.test', false, now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', null, true, now(), now()),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', null, true, now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

insert into pg_temp.chat_context (key, value)
select 'room_a', room_id
from public.create_room('Persistent Chat Room');

select is(
  (
    select sender_display_name
    from public.send_chat_message(
      (select value from pg_temp.chat_context where key = 'room_a'),
      '  Owner message  '
    )
  ),
  'Room owner',
  'owner can send without spoofed identity and uses trusted owner context'
);

select is(
  (
    select count(*)
    from public.chat_messages
    where room_id = (select value from pg_temp.chat_context where key = 'room_a')
  ),
  1::bigint,
  'the room owner can read persisted room chat'
);

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","is_anonymous":true}';

select ok(
  (
    select result.user_id = '00000000-0000-4000-8000-0000000000b2'::uuid
      and result.sender_display_name = 'Viewer B'
      and result.body = 'Member message'
      and result.created_at between statement_timestamp() - interval '5 seconds'
        and statement_timestamp() + interval '5 seconds'
    from public.join_room(
      (select value from pg_temp.chat_context where key = 'room_a'),
      'Viewer B'
    ) as joined
    cross join lateral public.send_chat_message(
      (select value from pg_temp.chat_context where key = 'room_a'),
      E'\t Member message \n'
    ) as result
  ),
  'joined member send uses auth.uid, trusted membership name, trimmed body, and DB time'
);

select is(
  to_regprocedure('public.send_chat_message(uuid,text,uuid,text)') is null,
  true,
  'chat RPC exposes no user_id or display-name spoofing parameters'
);

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated","is_anonymous":true}';

select is(
  pg_temp.sqlstate_of(format(
    'select public.send_chat_message(%L::uuid, ''Outsider message'')',
    (select value::text from pg_temp.chat_context where key = 'room_a')
  )),
  '42501',
  'an authenticated outsider cannot send room chat'
);

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","is_anonymous":true}';

select is(
  pg_temp.sqlstate_of(format(
    'select public.send_chat_message(%L::uuid, %L)',
    (select value::text from pg_temp.chat_context where key = 'room_a'),
    E' \t\n '
  )),
  '22023',
  'whitespace-only messages are rejected'
);

select is(
  pg_temp.sqlstate_of(format(
    'select public.send_chat_message(%L::uuid, repeat(''x'', 1001))',
    (select value::text from pg_temp.chat_context where key = 'room_a')
  )),
  '22023',
  'messages over the fixed 1000-character limit are rejected'
);

select is(
  pg_temp.sqlstate_of(format(
    'select public.send_chat_message(%L::uuid, ''Rate 1'')',
    (select value::text from pg_temp.chat_context where key = 'room_a')
  )),
  null,
  'the first message in the rolling rate window succeeds'
);

select is(
  pg_temp.sqlstate_of(format(
    'select public.send_chat_message(%L::uuid, ''Rate 2'')',
    (select value::text from pg_temp.chat_context where key = 'room_a')
  )),
  null,
  'the second message in the rolling rate window succeeds'
);

select is(
  pg_temp.sqlstate_of(format(
    'select public.send_chat_message(%L::uuid, ''Rate 3'')',
    (select value::text from pg_temp.chat_context where key = 'room_a')
  )),
  null,
  'the third message in the rolling rate window succeeds'
);

select is(
  pg_temp.sqlstate_of(format(
    'select public.send_chat_message(%L::uuid, ''Rate 4'')',
    (select value::text from pg_temp.chat_context where key = 'room_a')
  )),
  null,
  'the fifth total message in the rolling rate window succeeds'
);

select is(
  pg_temp.sqlstate_of(format(
    'select public.send_chat_message(%L::uuid, ''Rate 5'')',
    (select value::text from pg_temp.chat_context where key = 'room_a')
  )),
  'P0001',
  'the sixth message is rejected by the server-side rate limit'
);

select is(
  pg_temp.sqlstate_of(format(
    'insert into public.chat_messages (room_id, user_id, sender_display_name, body) values (%L::uuid, %L::uuid, ''Viewer B'', ''direct'')',
    (select value::text from pg_temp.chat_context where key = 'room_a'),
    '00000000-0000-4000-8000-0000000000b2'
  )),
  '42501',
  'joined members cannot bypass the canonical chat RPC with INSERT'
);

select is(
  pg_temp.sqlstate_of(format(
    'update public.chat_messages set body = ''edited'' where room_id = %L::uuid',
    (select value::text from pg_temp.chat_context where key = 'room_a')
  )),
  '42501',
  'chat messages cannot be updated by the client'
);

select is(
  pg_temp.sqlstate_of(format(
    'delete from public.chat_messages where room_id = %L::uuid',
    (select value::text from pg_temp.chat_context where key = 'room_a')
  )),
  '42501',
  'chat messages cannot be deleted by the client'
);

select ok(
  (
    select prosecdef
      and proconfig = array['search_path=""']::text[]
    from pg_proc
    where oid = 'private.broadcast_chat_message_created()'::regprocedure
  ),
  'the chat Broadcast trigger function is hardened as privileged code'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.broadcast_chat_message_created()',
    'EXECUTE'
  )
    and not has_function_privilege(
      'anon',
      'private.broadcast_chat_message_created()',
      'EXECUTE'
    ),
  'client roles cannot execute the chat Broadcast trigger function'
);

select ok(
  (select count(*) >= 6 from public.chat_messages
    where room_id = (select value from pg_temp.chat_context where key = 'room_a')),
  'joined member can read persisted room chat'
);

select set_config(
  'realtime.topic',
  'room:' || (select value::text from pg_temp.chat_context where key = 'room_a'),
  true
);

select ok(
  exists (
    select 1
    from realtime.messages
    where topic = 'room:' || (select value::text from pg_temp.chat_context where key = 'room_a')
      and extension = 'broadcast'
      and event = 'chat_message_created'
      and private is true
      and payload->>'body' = 'Member message'
  ),
  'a committed chat row emits a database-originated private Broadcast'
);

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated","is_anonymous":true}';

select set_config(
  'realtime.topic',
  'room:' || (select value::text from pg_temp.chat_context where key = 'room_a'),
  true
);

select is(
  (select count(*) from public.chat_messages
    where room_id = (select value from pg_temp.chat_context where key = 'room_a')),
  0::bigint,
  'an outsider cannot read room chat'
);

select is(
  (select count(*) from realtime.messages
    where topic = 'room:' || (select value::text from pg_temp.chat_context where key = 'room_a')
      and extension = 'broadcast'),
  0::bigint,
  'an outsider cannot read the private chat Broadcast'
);

reset role;

select * from finish();
rollback;
