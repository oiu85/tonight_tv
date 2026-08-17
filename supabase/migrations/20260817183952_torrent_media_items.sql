create type public.torrent_input_kind as enum ('magnet', 'torrent_file');

alter table public.media_items
  add column source_revision bigint not null default 1,
  add column torrent_info_hash text,
  add column torrent_input_kind public.torrent_input_kind,
  add column torrent_magnet_uri text,
  add column torrent_metadata_path text,
  add column torrent_name text,
  add column torrent_file_index integer,
  add column torrent_file_path text,
  add column torrent_file_name text,
  add column torrent_file_size bigint;

alter table public.media_items
  drop constraint media_items_source_identity_check,
  add constraint media_items_source_revision_check check (source_revision > 0),
  add constraint media_items_source_identity_check check (
    (
      source_type = 'youtube'
      and source_url is null
      and youtube_video_id = pg_catalog.btrim(youtube_video_id)
      and youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
      and torrent_info_hash is null
      and torrent_input_kind is null
      and torrent_magnet_uri is null
      and torrent_metadata_path is null
      and torrent_name is null
      and torrent_file_index is null
      and torrent_file_path is null
      and torrent_file_name is null
      and torrent_file_size is null
    )
    or
    (
      source_type = 'torrent'
      and source_url is null
      and youtube_video_id is null
      and torrent_info_hash = pg_catalog.lower(pg_catalog.btrim(torrent_info_hash))
      and torrent_info_hash ~ '^[a-f0-9]{40}$'
      and torrent_input_kind is not null
      and (
        (
          torrent_input_kind = 'magnet'
          and torrent_magnet_uri = pg_catalog.btrim(torrent_magnet_uri)
          and pg_catalog.char_length(torrent_magnet_uri) between 20 and 16384
          and torrent_magnet_uri like 'magnet:?%'
          and torrent_metadata_path is null
        )
        or
        (
          torrent_input_kind = 'torrent_file'
          and torrent_magnet_uri is null
          and torrent_metadata_path = 'rooms/' || room_id::text || '/media/' || id::text || '/' || torrent_info_hash || '.torrent'
        )
      )
      and (torrent_name is null or (
        torrent_name = pg_catalog.btrim(torrent_name)
        and pg_catalog.char_length(torrent_name) between 1 and 255
      ))
      and torrent_file_index >= 0
      and torrent_file_path = pg_catalog.btrim(torrent_file_path)
      and pg_catalog.char_length(torrent_file_path) between 1 and 1024
      and torrent_file_path !~ '(^|/)\.\.(/|$)'
      and torrent_file_name = pg_catalog.btrim(torrent_file_name)
      and pg_catalog.char_length(torrent_file_name) between 1 and 255
      and torrent_file_size >= 0
    )
    or
    (
      source_type not in ('youtube', 'torrent')
      and source_url is not null
      and source_url = pg_catalog.btrim(source_url)
      and pg_catalog.char_length(source_url) between 1 and 4096
      and youtube_video_id is null
      and torrent_info_hash is null
      and torrent_input_kind is null
      and torrent_magnet_uri is null
      and torrent_metadata_path is null
      and torrent_name is null
      and torrent_file_index is null
      and torrent_file_path is null
      and torrent_file_name is null
      and torrent_file_size is null
    )
  );

create function private.bump_media_source_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if row(
    new.source_url,
    new.source_type,
    new.youtube_video_id,
    new.torrent_info_hash,
    new.torrent_input_kind,
    new.torrent_magnet_uri,
    new.torrent_metadata_path,
    new.torrent_file_index,
    new.torrent_file_path,
    new.torrent_file_size
  ) is distinct from row(
    old.source_url,
    old.source_type,
    old.youtube_video_id,
    old.torrent_info_hash,
    old.torrent_input_kind,
    old.torrent_magnet_uri,
    old.torrent_metadata_path,
    old.torrent_file_index,
    old.torrent_file_path,
    old.torrent_file_size
  ) then
    new.source_revision := old.source_revision + 1;
  else
    new.source_revision := old.source_revision;
  end if;
  return new;
end;
$$;

revoke all on function private.bump_media_source_revision()
  from public, anon, authenticated;

create trigger media_items_bump_source_revision
before update on public.media_items
for each row execute function private.bump_media_source_revision();

drop function public.add_media_item(uuid, text, text, public.media_source_type, text);
drop function public.edit_media_item(uuid, uuid, text, text, public.media_source_type, text);
drop function public.remove_media_item(uuid, uuid);
drop function public.reorder_media_items(uuid, uuid[]);

create function public.add_media_item(
  p_room_id uuid,
  p_title text,
  p_source_url text default null,
  p_source_type public.media_source_type default 'auto',
  p_youtube_video_id text default null,
  p_media_id uuid default null,
  p_torrent_info_hash text default null,
  p_torrent_input_kind public.torrent_input_kind default null,
  p_torrent_magnet_uri text default null,
  p_torrent_metadata_path text default null,
  p_torrent_name text default null,
  p_torrent_file_index integer default null,
  p_torrent_file_path text default null,
  p_torrent_file_name text default null,
  p_torrent_file_size bigint default null
)
returns setof public.media_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_media_id uuid := coalesce(p_media_id, gen_random_uuid());
  v_title text := pg_catalog.btrim(p_title);
  v_source_url text := nullif(pg_catalog.btrim(p_source_url), '');
  v_youtube_video_id text := nullif(pg_catalog.btrim(p_youtube_video_id), '');
  v_info_hash text := pg_catalog.lower(nullif(pg_catalog.btrim(p_torrent_info_hash), ''));
  v_magnet_uri text := nullif(pg_catalog.btrim(p_torrent_magnet_uri), '');
  v_metadata_path text := nullif(pg_catalog.btrim(p_torrent_metadata_path), '');
  v_torrent_name text := nullif(pg_catalog.btrim(p_torrent_name), '');
  v_file_path text := nullif(pg_catalog.btrim(p_torrent_file_path), '');
  v_file_name text := nullif(pg_catalog.btrim(p_torrent_file_name), '');
  v_queue_count integer;
  v_queue_position integer;
begin
  v_room := private.lock_owned_room(p_room_id);
  if v_title is null or pg_catalog.char_length(v_title) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'Media title must contain between 1 and 200 characters';
  end if;
  if p_source_type is null then
    raise exception using errcode = '22023', message = 'Media source type is required';
  end if;
  if p_source_type = 'youtube' then
    if v_source_url is not null or v_youtube_video_id is null or v_youtube_video_id !~ '^[A-Za-z0-9_-]{11}$' then
      raise exception using errcode = '22023', message = 'YouTube media requires one valid Video ID and no source URL';
    end if;
  elsif p_source_type = 'torrent' then
    if v_source_url is not null or v_youtube_video_id is not null or v_info_hash !~ '^[a-f0-9]{40}$'
       or p_torrent_input_kind is null or p_torrent_file_index is null or p_torrent_file_index < 0
       or v_file_path is null or pg_catalog.char_length(v_file_path) > 1024
       or v_file_path ~ '(^|/)\.\.(/|$)' or v_file_name is null
       or pg_catalog.char_length(v_file_name) > 255 or p_torrent_file_size is null or p_torrent_file_size < 0 then
      raise exception using errcode = '22023', message = 'Torrent media requires a valid torrent identity and selected file';
    end if;
    if p_torrent_input_kind = 'magnet' and (
      v_magnet_uri is null or v_magnet_uri not like 'magnet:?%' or pg_catalog.char_length(v_magnet_uri) > 16384 or v_metadata_path is not null
    ) then
      raise exception using errcode = '22023', message = 'Magnet media requires one valid Magnet URI';
    end if;
    if p_torrent_input_kind = 'torrent_file' and (
      v_magnet_uri is not null or v_metadata_path <> 'rooms/' || p_room_id::text || '/media/' || v_media_id::text || '/' || v_info_hash || '.torrent'
    ) then
      raise exception using errcode = '22023', message = 'Torrent file media requires its private metadata path';
    end if;
  else
    if v_youtube_video_id is not null or v_info_hash is not null or p_torrent_input_kind is not null
       or v_magnet_uri is not null or v_metadata_path is not null or p_torrent_file_index is not null
       or v_file_path is not null or v_file_name is not null or p_torrent_file_size is not null
       or v_source_url is null or pg_catalog.char_length(v_source_url) not between 8 and 4096
       or v_source_url !~* '^https?://[^[:space:][:cntrl:]]+$' or v_source_url ~* '^https?://[^/]*@' then
      raise exception using errcode = '22023', message = 'Direct media requires a valid credential-free HTTP or HTTPS URL';
    end if;
  end if;

  select count(*)::integer, coalesce(pg_catalog.max(mi.queue_position) + 1, 0)
    into v_queue_count, v_queue_position
  from public.media_items as mi where mi.room_id = v_room.id;
  if v_queue_count >= 500 then
    raise exception using errcode = '22023', message = 'The room queue cannot contain more than 500 media items';
  end if;

  return query insert into public.media_items (
    id, room_id, title, source_url, source_type, youtube_video_id, queue_position, created_by,
    torrent_info_hash, torrent_input_kind, torrent_magnet_uri, torrent_metadata_path,
    torrent_name, torrent_file_index, torrent_file_path, torrent_file_name, torrent_file_size
  ) values (
    v_media_id, v_room.id, v_title, v_source_url, p_source_type, v_youtube_video_id, v_queue_position, auth.uid(),
    v_info_hash, p_torrent_input_kind, v_magnet_uri, v_metadata_path,
    v_torrent_name, p_torrent_file_index, v_file_path, v_file_name, p_torrent_file_size
  ) returning *;
end;
$$;

create function public.edit_media_item(
  p_room_id uuid,
  p_media_id uuid,
  p_title text,
  p_source_url text default null,
  p_source_type public.media_source_type default 'auto',
  p_youtube_video_id text default null,
  p_torrent_info_hash text default null,
  p_torrent_input_kind public.torrent_input_kind default null,
  p_torrent_magnet_uri text default null,
  p_torrent_metadata_path text default null,
  p_torrent_name text default null,
  p_torrent_file_index integer default null,
  p_torrent_file_path text default null,
  p_torrent_file_name text default null,
  p_torrent_file_size bigint default null
)
returns setof public.media_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := pg_catalog.btrim(p_title);
  v_source_url text := nullif(pg_catalog.btrim(p_source_url), '');
  v_youtube_video_id text := nullif(pg_catalog.btrim(p_youtube_video_id), '');
  v_info_hash text := pg_catalog.lower(nullif(pg_catalog.btrim(p_torrent_info_hash), ''));
  v_magnet_uri text := nullif(pg_catalog.btrim(p_torrent_magnet_uri), '');
  v_metadata_path text := nullif(pg_catalog.btrim(p_torrent_metadata_path), '');
  v_torrent_name text := nullif(pg_catalog.btrim(p_torrent_name), '');
  v_file_path text := nullif(pg_catalog.btrim(p_torrent_file_path), '');
  v_file_name text := nullif(pg_catalog.btrim(p_torrent_file_name), '');
begin
  perform private.lock_owned_room(p_room_id);
  if p_media_id is null or v_title is null or pg_catalog.char_length(v_title) not between 1 and 200 or p_source_type is null then
    raise exception using errcode = '22023', message = 'Media identity, title, and source type are required';
  end if;
  if p_source_type = 'youtube' then
    if v_source_url is not null or v_youtube_video_id is null or v_youtube_video_id !~ '^[A-Za-z0-9_-]{11}$' then
      raise exception using errcode = '22023', message = 'YouTube media requires one valid Video ID and no source URL';
    end if;
  elsif p_source_type = 'torrent' then
    if v_source_url is not null or v_youtube_video_id is not null or v_info_hash !~ '^[a-f0-9]{40}$'
       or p_torrent_input_kind is null or p_torrent_file_index is null or p_torrent_file_index < 0
       or v_file_path is null or pg_catalog.char_length(v_file_path) > 1024
       or v_file_path ~ '(^|/)\.\.(/|$)' or v_file_name is null
       or pg_catalog.char_length(v_file_name) > 255 or p_torrent_file_size is null or p_torrent_file_size < 0 then
      raise exception using errcode = '22023', message = 'Torrent media requires a valid torrent identity and selected file';
    end if;
    if p_torrent_input_kind = 'magnet' and (
      v_magnet_uri is null or v_magnet_uri not like 'magnet:?%' or pg_catalog.char_length(v_magnet_uri) > 16384 or v_metadata_path is not null
    ) then
      raise exception using errcode = '22023', message = 'Magnet media requires one valid Magnet URI';
    end if;
    if p_torrent_input_kind = 'torrent_file' and (
      v_magnet_uri is not null or v_metadata_path <> 'rooms/' || p_room_id::text || '/media/' || p_media_id::text || '/' || v_info_hash || '.torrent'
    ) then
      raise exception using errcode = '22023', message = 'Torrent file media requires its private metadata path';
    end if;
  else
    if v_youtube_video_id is not null or v_info_hash is not null or p_torrent_input_kind is not null
       or v_magnet_uri is not null or v_metadata_path is not null or p_torrent_file_index is not null
       or v_file_path is not null or v_file_name is not null or p_torrent_file_size is not null
       or v_source_url is null or pg_catalog.char_length(v_source_url) not between 8 and 4096
       or v_source_url !~* '^https?://[^[:space:][:cntrl:]]+$' or v_source_url ~* '^https?://[^/]*@' then
      raise exception using errcode = '22023', message = 'Direct media requires a valid credential-free HTTP or HTTPS URL';
    end if;
  end if;

  return query update public.media_items as mi set
    title = v_title,
    source_url = v_source_url,
    source_type = p_source_type,
    youtube_video_id = v_youtube_video_id,
    torrent_info_hash = v_info_hash,
    torrent_input_kind = p_torrent_input_kind,
    torrent_magnet_uri = v_magnet_uri,
    torrent_metadata_path = v_metadata_path,
    torrent_name = v_torrent_name,
    torrent_file_index = p_torrent_file_index,
    torrent_file_path = v_file_path,
    torrent_file_name = v_file_name,
    torrent_file_size = p_torrent_file_size
  where mi.room_id = p_room_id and mi.id = p_media_id
  returning mi.*;
  if not found then
    raise exception using errcode = 'P0002', message = 'Media item was not found in the room';
  end if;
end;
$$;

create function public.remove_media_item(p_room_id uuid, p_media_id uuid)
returns setof public.media_items
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_owned_room(p_room_id);
  if p_media_id is null then raise exception using errcode = '22023', message = 'Media ID is required'; end if;
  if not exists (select 1 from public.media_items as mi where mi.room_id = p_room_id and mi.id = p_media_id) then
    raise exception using errcode = 'P0002', message = 'Media item was not found in the room';
  end if;
  if exists (select 1 from public.room_playback_state as ps where ps.room_id = p_room_id and ps.current_media_id = p_media_id) then
    raise exception using errcode = '55000', message = 'Current media cannot be removed; select another item first';
  end if;
  return query delete from public.media_items as mi
    where mi.room_id = p_room_id and mi.id = p_media_id returning mi.*;
end;
$$;

create function public.reorder_media_items(p_room_id uuid, p_ordered_media_ids uuid[])
returns setof public.media_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_count integer;
  v_provided_count integer;
  v_distinct_count integer;
  v_matched_count integer;
begin
  perform private.lock_owned_room(p_room_id);
  if p_ordered_media_ids is null then raise exception using errcode = '22023', message = 'Ordered media IDs are required'; end if;
  v_provided_count := pg_catalog.cardinality(p_ordered_media_ids);
  if v_provided_count > 500 or pg_catalog.array_position(p_ordered_media_ids, null) is not null then
    raise exception using errcode = '22023', message = 'Ordered media IDs are invalid';
  end if;
  select count(distinct provided.media_id)::integer into v_distinct_count
    from pg_catalog.unnest(p_ordered_media_ids) as provided(media_id);
  if v_distinct_count <> v_provided_count then raise exception using errcode = '22023', message = 'Ordered media IDs cannot contain duplicates'; end if;
  select count(*)::integer into v_expected_count from public.media_items as mi where mi.room_id = p_room_id;
  if v_expected_count <> v_provided_count then raise exception using errcode = '22023', message = 'Reorder must contain every media item in the room exactly once'; end if;
  select count(*)::integer into v_matched_count from public.media_items as mi
    where mi.room_id = p_room_id and mi.id = any(p_ordered_media_ids);
  if v_matched_count <> v_provided_count then raise exception using errcode = '22023', message = 'Ordered media IDs must all belong to the room'; end if;
  perform 1 from public.media_items as mi where mi.room_id = p_room_id order by mi.id for update;
  update public.media_items as mi set queue_position = ordered.ordinality::integer - 1
  from pg_catalog.unnest(p_ordered_media_ids) with ordinality as ordered(media_id, ordinality)
  where mi.room_id = p_room_id and mi.id = ordered.media_id;
  return query select mi.* from public.media_items as mi where mi.room_id = p_room_id order by mi.queue_position, mi.id;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('torrent-metadata', 'torrent-metadata', false, 2097152, array['application/x-bittorrent', 'application/octet-stream']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function private.torrent_metadata_object_path(p_name text)
returns table (room_id uuid, media_id uuid, info_hash text)
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_match text[];
begin
  v_match := pg_catalog.regexp_match(
    p_name,
    '^rooms/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/([a-f0-9]{40})\.torrent$',
    'i'
  );
  if v_match is null then return; end if;
  return query select v_match[1]::uuid, v_match[2]::uuid, pg_catalog.lower(v_match[3]);
end;
$$;

revoke all on function private.torrent_metadata_object_path(text) from public, anon, authenticated;
grant execute on function private.torrent_metadata_object_path(text) to authenticated;

create policy torrent_metadata_member_select on storage.objects
for select to authenticated
using (
  bucket_id = 'torrent-metadata'
  and exists (
    select 1
    from private.torrent_metadata_object_path(storage.objects.name) as object_path
    join public.media_items as media
      on media.room_id = object_path.room_id
     and media.id = object_path.media_id
     and media.torrent_info_hash = object_path.info_hash
     and media.torrent_metadata_path = storage.objects.name
    where object_path.room_id in (select authorized.room_id from private.authorized_room_ids() as authorized)
  )
);

create policy torrent_metadata_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'torrent-metadata'
  and exists (
    select 1 from private.torrent_metadata_object_path(storage.objects.name) as object_path
    join public.rooms as room on room.id = object_path.room_id and room.owner_user_id = (select auth.uid())
  )
);

create policy torrent_metadata_owner_update on storage.objects
for update to authenticated
using (
  bucket_id = 'torrent-metadata'
  and exists (
    select 1 from private.torrent_metadata_object_path(storage.objects.name) as object_path
    join public.rooms as room on room.id = object_path.room_id and room.owner_user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'torrent-metadata'
  and exists (
    select 1 from private.torrent_metadata_object_path(storage.objects.name) as object_path
    join public.rooms as room on room.id = object_path.room_id and room.owner_user_id = (select auth.uid())
  )
);

create policy torrent_metadata_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'torrent-metadata'
  and exists (
    select 1 from private.torrent_metadata_object_path(storage.objects.name) as object_path
    join public.rooms as room on room.id = object_path.room_id and room.owner_user_id = (select auth.uid())
  )
);

create or replace function public.get_room_snapshot(p_room_id uuid, p_chat_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_chat_limit integer := least(greatest(coalesce(p_chat_limit, 50), 1), 100);
  v_snapshot jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required'; end if;
  if p_room_id is null then raise exception using errcode = '22023', message = 'Room ID is required'; end if;
  if not exists (select 1 from public.rooms as r where r.id = p_room_id and r.owner_user_id = v_user_id)
     and not exists (select 1 from public.room_sessions as rs where rs.room_id = p_room_id and rs.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Room membership is required';
  end if;
  select pg_catalog.jsonb_build_object(
    'server_time', pg_catalog.statement_timestamp(),
    'room', pg_catalog.jsonb_build_object('id', r.id, 'name', r.name, 'owner_user_id', r.owner_user_id, 'created_at', r.created_at, 'updated_at', r.updated_at),
    'caller', pg_catalog.jsonb_build_object('user_id', v_user_id, 'is_owner', r.owner_user_id = v_user_id, 'room_session_id', caller_session.id, 'display_name', caller_session.display_name),
    'playback', pg_catalog.jsonb_build_object('room_id', ps.room_id, 'current_media_id', ps.current_media_id, 'status', ps.status, 'anchor_position_sec', ps.anchor_position_sec, 'anchor_server_time', ps.anchor_server_time, 'state_version', ps.state_version, 'updated_at', ps.updated_at),
    'current_media', case when current_media.id is null then null else pg_catalog.jsonb_build_object(
      'id', current_media.id, 'title', current_media.title, 'source_url', current_media.source_url,
      'source_type', current_media.source_type, 'source_revision', current_media.source_revision,
      'youtube_video_id', current_media.youtube_video_id,
      'torrent_info_hash', current_media.torrent_info_hash,
      'torrent_input_kind', current_media.torrent_input_kind,
      'torrent_file_index', current_media.torrent_file_index,
      'torrent_file_path', current_media.torrent_file_path,
      'torrent_file_name', current_media.torrent_file_name,
      'torrent_file_size', current_media.torrent_file_size,
      'queue_position', current_media.queue_position, 'created_at', current_media.created_at, 'updated_at', current_media.updated_at
    ) end,
    'subtitles', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', s.id, 'media_id', s.media_id, 'label', s.label, 'language_code', s.language_code,
      'storage_path', s.storage_path, 'format', s.format, 'created_at', s.created_at
    ) order by s.created_at, s.id) from public.subtitles as s where s.room_id = r.id and s.media_id = ps.current_media_id), '[]'::jsonb),
    'queue', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', q.id, 'title', q.title, 'source_url', q.source_url, 'source_type', q.source_type,
      'source_revision', q.source_revision, 'youtube_video_id', q.youtube_video_id,
      'torrent_info_hash', q.torrent_info_hash, 'torrent_input_kind', q.torrent_input_kind,
      'torrent_file_index', q.torrent_file_index,
      'torrent_file_path', q.torrent_file_path, 'torrent_file_name', q.torrent_file_name,
      'torrent_file_size', q.torrent_file_size,
      'queue_position', q.queue_position, 'created_at', q.created_at, 'updated_at', q.updated_at
    ) order by q.queue_position, q.id) from public.media_items as q where q.room_id = r.id), '[]'::jsonb),
    'recent_chat', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', recent.id, 'user_id', recent.user_id, 'sender_display_name', recent.sender_display_name,
      'body', recent.body, 'created_at', recent.created_at
    ) order by recent.created_at, recent.id) from (
      select cm.id, cm.user_id, cm.sender_display_name, cm.body, cm.created_at
      from public.chat_messages as cm where cm.room_id = r.id order by cm.created_at desc, cm.id desc limit v_chat_limit
    ) as recent), '[]'::jsonb)
  ) into v_snapshot
  from public.rooms as r
  join public.room_playback_state as ps on ps.room_id = r.id
  left join public.media_items as current_media on current_media.room_id = ps.room_id and current_media.id = ps.current_media_id
  left join public.room_sessions as caller_session on caller_session.room_id = r.id and caller_session.user_id = v_user_id
  where r.id = p_room_id;
  if v_snapshot is null then raise exception using errcode = 'P0002', message = 'Room snapshot is unavailable'; end if;
  return v_snapshot;
end;
$$;

revoke all on type public.torrent_input_kind from public, anon, authenticated;
grant usage on type public.torrent_input_kind to authenticated;

revoke all on function public.add_media_item(uuid, text, text, public.media_source_type, text, uuid, text, public.torrent_input_kind, text, text, text, integer, text, text, bigint) from public, anon, authenticated;
revoke all on function public.edit_media_item(uuid, uuid, text, text, public.media_source_type, text, text, public.torrent_input_kind, text, text, text, integer, text, text, bigint) from public, anon, authenticated;
revoke all on function public.remove_media_item(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reorder_media_items(uuid, uuid[]) from public, anon, authenticated;

grant execute on function public.add_media_item(uuid, text, text, public.media_source_type, text, uuid, text, public.torrent_input_kind, text, text, text, integer, text, text, bigint) to authenticated;
grant execute on function public.edit_media_item(uuid, uuid, text, text, public.media_source_type, text, text, public.torrent_input_kind, text, text, text, integer, text, text, bigint) to authenticated;
grant execute on function public.remove_media_item(uuid, uuid) to authenticated;
grant execute on function public.reorder_media_items(uuid, uuid[]) to authenticated;
