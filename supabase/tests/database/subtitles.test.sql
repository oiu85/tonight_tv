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

create temporary table subtitle_context (
  key text primary key,
  value uuid not null
);
grant select, insert, update on table pg_temp.subtitle_context to authenticated, anon;

select ok(
  to_regprocedure('public.create_subtitle_metadata(uuid,uuid,uuid,text,text)') is not null,
  'create_subtitle_metadata exists'
);
select ok(
  to_regprocedure('public.delete_subtitle_metadata(uuid,uuid)') is not null,
  'delete_subtitle_metadata exists'
);
select ok(
  to_regprocedure('private.subtitle_object_path(text)') is not null,
  'the exact subtitle object-path parser exists'
);

select ok(to_regclass('public.chat_messages_user_id_idx') is not null, 'chat sender FK index exists');
select ok(to_regclass('public.media_items_created_by_idx') is not null, 'media creator FK index exists');
select ok(to_regclass('public.room_playback_state_current_media_idx') is not null, 'playback current-media FK index exists');
select ok(to_regclass('public.subtitles_created_by_idx') is not null, 'subtitle creator FK index exists');

select ok(
  exists (
    select 1
    from storage.buckets
    where id = 'subtitles'
      and name = 'subtitles'
      and public = false
      and file_size_limit = 1048576
      and allowed_mime_types @> array['text/vtt']::text[]
  ),
  'the subtitles bucket is private and bounded'
);

select is(
  (
    select array_agg(policyname order by policyname)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'subtitle_objects_%'
  ),
  array[
    'subtitle_objects_member_select',
    'subtitle_objects_owner_delete',
    'subtitle_objects_owner_insert',
    'subtitle_objects_owner_update'
  ]::name[],
  'Storage has only the four intended subtitle policies'
);

select is(
  (
    select array_agg(cmd order by cmd)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'subtitle_objects_%'
  ),
  array['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[],
  'subtitle Storage policies cover exact CRUD operations'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'subtitle_objects_%'
      and roles = array['authenticated']::name[]
  ),
  4::bigint,
  'all subtitle Storage policies are authenticated-only'
);

select is(
  (
    select count(*)
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('create_subtitle_metadata', 'delete_subtitle_metadata')
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ),
  2::bigint,
  'authenticated can execute both subtitle metadata RPCs'
);

select is(
  (
    select count(*)
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('create_subtitle_metadata', 'delete_subtitle_metadata')
      and grantee in ('anon', 'PUBLIC')
      and privilege_type = 'EXECUTE'
  ),
  0::bigint,
  'anon and PUBLIC cannot execute subtitle metadata RPCs'
);

select is(
  (
    select count(*)
    from private.subtitle_object_path(
      'rooms/10000000-0000-4000-8000-000000000001/media/20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001.vtt'
    ) as parsed
    where parsed.room_id = '10000000-0000-4000-8000-000000000001'
      and parsed.media_id = '20000000-0000-4000-8000-000000000001'
      and parsed.subtitle_id = '30000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the deterministic subtitle path parses exact room/media/subtitle IDs'
);

select is(
  (
    select count(*)
    from private.subtitle_object_path('../rooms/escape.vtt')
  ),
  0::bigint,
  'path traversal and malformed paths do not parse'
);

insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'subtitle-owner@example.test', false, now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', null, true, now(), now()),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', null, true, now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

insert into pg_temp.subtitle_context (key, value)
select 'room_a', room_id
from public.create_room('Private Subtitle Room');

insert into pg_temp.subtitle_context (key, value)
select 'media_a', id
from public.add_media_item(
  (select value from pg_temp.subtitle_context where key = 'room_a'),
  'Subtitle Media',
  'https://media.example.test/subtitle.mp4',
  'mp4'
);

insert into pg_temp.subtitle_context (key, value)
values ('subtitle_a', '30000000-0000-4000-8000-0000000000a1');

select is(
  pg_temp.sqlstate_of(format(
    'insert into storage.objects (bucket_id, name, owner_id) values (''subtitles'', %L, %L)',
    'rooms/' || (select value from pg_temp.subtitle_context where key = 'room_a')::text
      || '/media/' || (select value from pg_temp.subtitle_context where key = 'media_a')::text
      || '/' || (select value from pg_temp.subtitle_context where key = 'subtitle_a')::text || '.vtt',
    '00000000-0000-4000-8000-0000000000a1'
  )),
  null,
  'the owner can upload an object only inside the deterministic room/media path'
);

select is(
  pg_temp.sqlstate_of(format(
    'insert into storage.objects (bucket_id, name, owner_id) values (''subtitles'', %L, %L)',
    '../rooms/' || (select value from pg_temp.subtitle_context where key = 'room_a')::text || '/escape.vtt',
    '00000000-0000-4000-8000-0000000000a1'
  )),
  '42501',
  'the owner cannot escape the deterministic subtitle namespace'
);

select ok(
  exists (
    select 1
    from public.create_subtitle_metadata(
      (select value from pg_temp.subtitle_context where key = 'room_a'),
      (select value from pg_temp.subtitle_context where key = 'media_a'),
      (select value from pg_temp.subtitle_context where key = 'subtitle_a'),
      ' English ',
      ' en '
    ) as subtitle
    where subtitle.label = 'English'
      and subtitle.language_code = 'en'
      and subtitle.created_by = '00000000-0000-4000-8000-0000000000a1'
  ),
  'owner metadata creation derives identity and normalizes labels'
);

select is(
  (
    select storage_path
    from public.subtitles
    where id = (select value from pg_temp.subtitle_context where key = 'subtitle_a')
  ),
  'rooms/' || (select value from pg_temp.subtitle_context where key = 'room_a')::text
    || '/media/' || (select value from pg_temp.subtitle_context where key = 'media_a')::text
    || '/' || (select value from pg_temp.subtitle_context where key = 'subtitle_a')::text || '.vtt',
  'metadata always stores the deterministic path'
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'subtitles'
  ),
  1::bigint,
  'owner can read the private object after metadata is committed'
);

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","is_anonymous":true}';

select lives_ok(
  format(
    'select public.join_room(%L::uuid, ''Viewer B'')',
    (select value::text from pg_temp.subtitle_context where key = 'room_a')
  ),
  'viewer joins the exact room before reading subtitles'
);

select is(
  (
    select count(*)
    from public.subtitles
    where room_id = (select value from pg_temp.subtitle_context where key = 'room_a')
  ),
  1::bigint,
  'joined viewer can read subtitle metadata'
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'subtitles'
  ),
  1::bigint,
  'joined viewer can read the private subtitle object'
);

select is(
  pg_temp.sqlstate_of(format(
    'insert into storage.objects (bucket_id, name, owner_id) values (''subtitles'', %L, %L)',
    'rooms/' || (select value from pg_temp.subtitle_context where key = 'room_a')::text
      || '/media/' || (select value from pg_temp.subtitle_context where key = 'media_a')::text
      || '/30000000-0000-4000-8000-0000000000b2.vtt',
    '00000000-0000-4000-8000-0000000000b2'
  )),
  '42501',
  'joined viewer cannot upload subtitle objects'
);

select is(
  pg_temp.sqlstate_of(format(
    'select public.create_subtitle_metadata(%L::uuid, %L::uuid, %L::uuid, ''Spoof'', ''en'')',
    (select value::text from pg_temp.subtitle_context where key = 'room_a'),
    (select value::text from pg_temp.subtitle_context where key = 'media_a'),
    '30000000-0000-4000-8000-0000000000b2'
  )),
  '42501',
  'joined viewer cannot create subtitle metadata'
);

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated","is_anonymous":true}';

select is(
  (select count(*) from public.subtitles),
  0::bigint,
  'authenticated outsider cannot read subtitle metadata'
);

select is(
  (select count(*) from storage.objects where bucket_id = 'subtitles'),
  0::bigint,
  'authenticated outsider cannot read subtitle objects'
);

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

insert into pg_temp.subtitle_context (key, value)
select 'room_b', room_id
from public.create_room('Other Room');

select is(
  pg_temp.sqlstate_of(format(
    'select public.create_subtitle_metadata(%L::uuid, %L::uuid, %L::uuid, ''Cross room'', ''en'')',
    (select value::text from pg_temp.subtitle_context where key = 'room_b'),
    (select value::text from pg_temp.subtitle_context where key = 'media_a'),
    '30000000-0000-4000-8000-0000000000c3'
  )),
  '22023',
  'metadata cannot attach media from another room'
);

select is(
  (
    select count(*)
    from public.delete_subtitle_metadata(
      (select value from pg_temp.subtitle_context where key = 'room_a'),
      (select value from pg_temp.subtitle_context where key = 'subtitle_a')
    )
  ),
  1::bigint,
  'owner can delete the canonical subtitle metadata'
);

reset role;
select * from finish();
rollback;
