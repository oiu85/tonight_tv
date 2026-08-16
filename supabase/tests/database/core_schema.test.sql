begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(47);

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

select is(
  (
    select array_agg(enumlabel::text order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.playback_status'::regtype
  ),
  array['idle', 'paused', 'playing', 'ended']::text[],
  'playback_status contains exactly the MVP states in canonical order'
);

select is(
  (
    select array_agg(enumlabel::text order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.media_source_type'::regtype
  ),
  array['auto', 'mp4', 'hls']::text[],
  'media_source_type contains exactly the MVP source types'
);

select has_table('public', 'rooms', 'rooms exists');
select has_table('public', 'room_sessions', 'room_sessions exists');
select has_table('public', 'media_items', 'media_items exists');
select has_table('public', 'subtitles', 'subtitles exists');
select has_table('public', 'room_playback_state', 'room_playback_state exists');
select has_table('public', 'chat_messages', 'chat_messages exists');

select is(
  (
    select count(*)
    from pg_tables
    where schemaname = 'public'
      and tablename in (
        'rooms',
        'room_sessions',
        'media_items',
        'subtitles',
        'room_playback_state',
        'chat_messages'
      )
      and rowsecurity
  ),
  6::bigint,
  'RLS is enabled on every application table'
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
  ),
  6::bigint,
  'Prompt 3 installs exactly one member-scoped SELECT policy per application table'
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
      and privilege_type = 'SELECT'
  ),
  6::bigint,
  'authenticated receives SELECT on all application tables'
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
  'authenticated receives no direct application-table writes'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'public'
      and table_name in (
        'rooms',
        'room_sessions',
        'media_items',
        'subtitles',
        'room_playback_state',
        'chat_messages'
      )
  ),
  0::bigint,
  'anon receives no application-table privileges'
);

select ok(to_regclass('public.rooms_owner_user_id_idx') is not null, 'room owner lookup index exists');
select ok(to_regclass('public.room_sessions_room_id_user_id_key') is not null, 'room membership unique index exists');
select ok(to_regclass('public.room_sessions_user_id_room_id_idx') is not null, 'reverse membership lookup index exists');
select ok(to_regclass('public.media_items_room_id_id_key') is not null, 'same-room media relationship index exists');
select ok(to_regclass('public.media_items_room_queue_idx') is not null, 'deterministic queue index exists');
select ok(to_regclass('public.subtitles_room_media_idx') is not null, 'subtitle room/media index exists');
select ok(to_regclass('public.chat_messages_room_history_idx') is not null, 'chat room/history index exists');

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-one@example.test', now(), now()),
  ('00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-two@example.test', now(), now()),
  ('00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'chat-user@example.test', now(), now());

insert into public.rooms (id, owner_user_id, name)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Room One'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Room Two');

insert into public.media_items (
  id,
  room_id,
  title,
  source_url,
  source_type,
  queue_position,
  created_by
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Room One First',
    'https://media.example.test/one.mp4',
    'mp4',
    0,
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Room One Second',
    'https://media.example.test/two.m3u8',
    'hls',
    0,
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    'Room Two First',
    'https://media.example.test/three.mp4',
    'auto',
    0,
    '00000000-0000-4000-8000-000000000002'
  );

select ok(
  (
    select count(*) = 2
    from public.media_items
    where room_id = '10000000-0000-4000-8000-000000000001'
      and queue_position = 0
  ),
  'duplicate intermediate queue positions are allowed for transactional reorder'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.rooms (owner_user_id, name)
    values ('00000000-0000-4000-8000-000000000001', '  invalid  ')
  $sql$),
  '23514',
  'room names must already be normalized and nonempty'
);

select ok(
  pg_temp.sqlstate_of($sql$
    insert into public.room_sessions (room_id, user_id, display_name)
    values (
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      'Owner One'
    )
  $sql$) is null,
  'a valid durable room membership can be stored'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.room_sessions (room_id, user_id, display_name)
    values (
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      'Duplicate'
    )
  $sql$),
  '23505',
  'a user has at most one durable membership per room'
);

select ok(
  pg_temp.sqlstate_of($sql$
    insert into public.subtitles (
      id,
      room_id,
      media_id,
      label,
      language_code,
      storage_path,
      created_by
    )
    values (
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'English',
      'en',
      'rooms/10000000-0000-4000-8000-000000000001/media/20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001.vtt',
      '00000000-0000-4000-8000-000000000001'
    )
  $sql$) is null,
  'valid same-room VTT subtitle metadata can be stored'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.subtitles (
      id,
      room_id,
      media_id,
      label,
      storage_path,
      created_by
    )
    values (
      '30000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000003',
      'Cross-room',
      'rooms/10000000-0000-4000-8000-000000000001/media/20000000-0000-4000-8000-000000000003/30000000-0000-4000-8000-000000000002.vtt',
      '00000000-0000-4000-8000-000000000001'
    )
  $sql$),
  '23503',
  'a subtitle cannot reference media from another room'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.subtitles (
      id,
      room_id,
      media_id,
      label,
      storage_path,
      created_by
    )
    values (
      '30000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'Wrong path',
      'other-bucket/wrong.vtt',
      '00000000-0000-4000-8000-000000000001'
    )
  $sql$),
  '23514',
  'subtitle metadata cannot escape its deterministic room/media path'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.subtitles (
      id,
      room_id,
      media_id,
      label,
      storage_path,
      format,
      created_by
    )
    values (
      '30000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'SRT is not canonical',
      'rooms/10000000-0000-4000-8000-000000000001/media/20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000004.vtt',
      'srt',
      '00000000-0000-4000-8000-000000000001'
    )
  $sql$),
  '23514',
  'only canonical VTT subtitle metadata is accepted'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.room_playback_state (room_id, current_media_id, status)
    values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000003',
      'playing'
    )
  $sql$),
  '23503',
  'playback cannot select media from another room'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.media_items (
      room_id, title, source_url, queue_position, created_by
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      'Invalid queue position',
      'https://media.example.test/invalid.mp4',
      -1,
      '00000000-0000-4000-8000-000000000001'
    )
  $sql$),
  '23514',
  'queue positions cannot be negative'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.room_playback_state (
      room_id, current_media_id, status, anchor_position_sec
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'paused',
      -0.1
    )
  $sql$),
  '23514',
  'anchor position cannot be negative'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.room_playback_state (
      room_id, current_media_id, status, anchor_position_sec
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'paused',
      'NaN'::double precision
    )
  $sql$),
  '23514',
  'anchor position rejects NaN'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.room_playback_state (
      room_id, current_media_id, status, anchor_position_sec
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'paused',
      'Infinity'::double precision
    )
  $sql$),
  '23514',
  'anchor position rejects infinity'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.room_playback_state (
      room_id, current_media_id, status, state_version
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'paused',
      -1
    )
  $sql$),
  '23514',
  'state version cannot be negative'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.room_playback_state (room_id, current_media_id, status)
    values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'idle'
    )
  $sql$),
  '23514',
  'idle playback cannot retain current media'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.room_playback_state (room_id, status)
    values ('10000000-0000-4000-8000-000000000001', 'playing')
  $sql$),
  '23514',
  'non-idle playback requires current media'
);

select ok(
  pg_temp.sqlstate_of($sql$
    insert into public.room_playback_state (
      room_id,
      current_media_id,
      status,
      anchor_position_sec,
      state_version
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'paused',
      12.5,
      1
    )
  $sql$) is null,
  'one valid authoritative playback row can be stored'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.room_playback_state (room_id)
    values ('10000000-0000-4000-8000-000000000001')
  $sql$),
  '23505',
  'room primary key permits only one authoritative playback row'
);

select is(
  pg_temp.sqlstate_of($sql$
    update public.room_playback_state
    set state_version = 0
    where room_id = '10000000-0000-4000-8000-000000000001'
  $sql$),
  '23514',
  'playback state_version cannot stay unchanged or move backward on update'
);

select is(
  pg_temp.sqlstate_of($sql$
    delete from public.media_items
    where id = '20000000-0000-4000-8000-000000000001'
  $sql$),
  '23503',
  'currently selected media cannot be deleted'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.chat_messages (room_id, user_id, sender_display_name, body)
    values (
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000003',
      'Chat User',
      '   '
    )
  $sql$),
  '23514',
  'empty chat bodies are rejected'
);

select is(
  pg_temp.sqlstate_of($sql$
    insert into public.chat_messages (room_id, user_id, sender_display_name, body)
    values (
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000003',
      'Chat User',
      repeat('x', 1001)
    )
  $sql$),
  '23514',
  'chat bodies longer than 1000 characters are rejected'
);

insert into public.chat_messages (
  id,
  room_id,
  user_id,
  sender_display_name,
  body
)
values (
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  'Chat User',
  'Hello'
);

select is(
  (
    select body
    from public.chat_messages
    where id = '40000000-0000-4000-8000-000000000001'
  ),
  'Hello',
  'valid plain-text chat is stored'
);

select ok(
  pg_temp.sqlstate_of($sql$
    delete from auth.users
    where id = '00000000-0000-4000-8000-000000000003'
  $sql$) is null,
  'deleting a chat-only Auth identity preserves message history'
);

select is(
  (
    select user_id
    from public.chat_messages
    where id = '40000000-0000-4000-8000-000000000001'
  ),
  null::uuid,
  'deleted chat senders are null while their display-name snapshot remains'
);

insert into public.rooms (id, owner_user_id, name, updated_at)
values (
  '10000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  'Timestamp Test',
  '2000-01-01 00:00:00+00'
);

update public.rooms
set name = 'Timestamp Updated'
where id = '10000000-0000-4000-8000-000000000003';

select ok(
  (
    select updated_at > '2000-01-01 00:00:00+00'::timestamptz
    from public.rooms
    where id = '10000000-0000-4000-8000-000000000003'
  ),
  'the shared trigger refreshes updated_at from database time'
);

set local role authenticated;

select is(
  (select count(*) from public.rooms),
  0::bigint,
  'authenticated role without a verified user identity cannot read rooms'
);

reset role;

select * from finish();
rollback;
