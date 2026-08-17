begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select ok(
  enum_range(null::public.media_source_type)::text[] @> array['torrent'],
  'torrent is an additive media source type'
);

select ok(
  to_regtype('public.torrent_input_kind') is not null,
  'torrent input kind enum exists'
);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'media_items'
      and column_name in (
        'source_revision', 'torrent_info_hash', 'torrent_input_kind',
        'torrent_magnet_uri', 'torrent_metadata_path', 'torrent_name',
        'torrent_file_index', 'torrent_file_path', 'torrent_file_name',
        'torrent_file_size'
      )
  ),
  10::bigint,
  'media items contain the complete durable Torrent identity'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'media_items_source_identity_check'
      and conrelid = 'public.media_items'::regclass
  ),
  'provider identity combinations are constrained'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'media_items_bump_source_revision'
      and tgrelid = 'public.media_items'::regclass
      and not tgisinternal
  ),
  'source identity edits increment a stable source revision'
);

select ok(
  exists (
    select 1 from storage.buckets
    where id = 'torrent-metadata' and public = false
  ),
  'Torrent metadata bucket is private'
);

select is(
  (select file_size_limit from storage.buckets where id = 'torrent-metadata'),
  2097152::bigint,
  'Torrent metadata uploads are bounded to 2 MiB'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'torrent_metadata_%'
  ),
  4::bigint,
  'Torrent metadata Storage has explicit member-read and owner-write policies'
);

select ok(
  has_function_privilege(
    'authenticated',
    'private.torrent_metadata_object_path(text)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated Storage policies may parse validated object paths'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'private.bump_media_source_revision()'::regprocedure
  ),
  array['search_path=""']::text[],
  'source revision trigger function uses an empty search path'
);

select * from finish();
rollback;
