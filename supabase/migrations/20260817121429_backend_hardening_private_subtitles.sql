create index chat_messages_user_id_idx
  on public.chat_messages (user_id)
  where user_id is not null;

create index media_items_created_by_idx
  on public.media_items (created_by);

create index room_playback_state_current_media_idx
  on public.room_playback_state (room_id, current_media_id)
  where current_media_id is not null;

create index subtitles_created_by_idx
  on public.subtitles (created_by);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'subtitles',
  'subtitles',
  false,
  1048576,
  array['text/vtt', 'text/plain']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function private.subtitle_object_path(p_name text)
returns table (
  room_id uuid,
  media_id uuid,
  subtitle_id uuid
)
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
    '^rooms/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.vtt$',
    'i'
  );

  if v_match is null then
    return;
  end if;

  return query
  select v_match[1]::uuid, v_match[2]::uuid, v_match[3]::uuid;
end;
$$;

revoke all on function private.subtitle_object_path(text)
  from public, anon, authenticated;
grant execute on function private.subtitle_object_path(text)
  to authenticated;

create policy subtitle_objects_member_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'subtitles'
  and exists (
    select 1
    from private.subtitle_object_path(storage.objects.name) as object_path
    join public.subtitles as subtitle
      on subtitle.room_id = object_path.room_id
     and subtitle.media_id = object_path.media_id
     and subtitle.id = object_path.subtitle_id
     and subtitle.storage_path = storage.objects.name
    where object_path.room_id in (
      select authorized.room_id
      from private.authorized_room_ids() as authorized
    )
  )
);

create policy subtitle_objects_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'subtitles'
  and exists (
    select 1
    from private.subtitle_object_path(storage.objects.name) as object_path
    join public.rooms as room
      on room.id = object_path.room_id
     and room.owner_user_id = (select auth.uid())
    join public.media_items as media
      on media.room_id = object_path.room_id
     and media.id = object_path.media_id
  )
);

create policy subtitle_objects_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'subtitles'
  and exists (
    select 1
    from private.subtitle_object_path(storage.objects.name) as object_path
    join public.rooms as room
      on room.id = object_path.room_id
     and room.owner_user_id = (select auth.uid())
    join public.media_items as media
      on media.room_id = object_path.room_id
     and media.id = object_path.media_id
  )
)
with check (
  bucket_id = 'subtitles'
  and exists (
    select 1
    from private.subtitle_object_path(storage.objects.name) as object_path
    join public.rooms as room
      on room.id = object_path.room_id
     and room.owner_user_id = (select auth.uid())
    join public.media_items as media
      on media.room_id = object_path.room_id
     and media.id = object_path.media_id
  )
);

create policy subtitle_objects_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'subtitles'
  and exists (
    select 1
    from private.subtitle_object_path(storage.objects.name) as object_path
    join public.rooms as room
      on room.id = object_path.room_id
     and room.owner_user_id = (select auth.uid())
    join public.media_items as media
      on media.room_id = object_path.room_id
     and media.id = object_path.media_id
  )
);

create function public.create_subtitle_metadata(
  p_room_id uuid,
  p_media_id uuid,
  p_subtitle_id uuid,
  p_label text,
  p_language_code text default null
)
returns table (
  id uuid,
  room_id uuid,
  media_id uuid,
  label text,
  language_code text,
  storage_path text,
  format text,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_label text := pg_catalog.btrim(p_label);
  v_language_code text := nullif(pg_catalog.btrim(p_language_code), '');
  v_storage_path text;
begin
  perform private.lock_owned_room(p_room_id);

  if p_media_id is null or p_subtitle_id is null then
    raise exception using
      errcode = '22023',
      message = 'Media ID and subtitle ID are required';
  end if;

  if v_label is null or pg_catalog.char_length(v_label) not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'Subtitle label must contain between 1 and 100 characters';
  end if;

  if v_language_code is not null
     and pg_catalog.char_length(v_language_code) > 35 then
    raise exception using
      errcode = '22023',
      message = 'Subtitle language code cannot exceed 35 characters';
  end if;

  if not exists (
    select 1
    from public.media_items as media
    where media.room_id = p_room_id
      and media.id = p_media_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Subtitle media does not belong to the room';
  end if;

  v_storage_path := 'rooms/' || p_room_id::text
    || '/media/' || p_media_id::text
    || '/' || p_subtitle_id::text || '.vtt';

  return query
  insert into public.subtitles as subtitle (
    id,
    room_id,
    media_id,
    label,
    language_code,
    storage_path,
    format,
    created_by
  )
  values (
    p_subtitle_id,
    p_room_id,
    p_media_id,
    v_label,
    v_language_code,
    v_storage_path,
    'vtt',
    auth.uid()
  )
  returning
    subtitle.id,
    subtitle.room_id,
    subtitle.media_id,
    subtitle.label,
    subtitle.language_code,
    subtitle.storage_path,
    subtitle.format,
    subtitle.created_by,
    subtitle.created_at;
end;
$$;

create function public.delete_subtitle_metadata(
  p_room_id uuid,
  p_subtitle_id uuid
)
returns table (
  id uuid,
  room_id uuid,
  media_id uuid,
  label text,
  language_code text,
  storage_path text,
  format text,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.lock_owned_room(p_room_id);

  if p_subtitle_id is null then
    raise exception using
      errcode = '22023',
      message = 'Subtitle ID is required';
  end if;

  return query
  delete from public.subtitles as subtitle
  where subtitle.room_id = p_room_id
    and subtitle.id = p_subtitle_id
  returning
    subtitle.id,
    subtitle.room_id,
    subtitle.media_id,
    subtitle.label,
    subtitle.language_code,
    subtitle.storage_path,
    subtitle.format,
    subtitle.created_by,
    subtitle.created_at;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Subtitle was not found in the room';
  end if;
end;
$$;

revoke all on function public.create_subtitle_metadata(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.delete_subtitle_metadata(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.create_subtitle_metadata(uuid, uuid, uuid, text, text)
  to authenticated;
grant execute on function public.delete_subtitle_metadata(uuid, uuid)
  to authenticated;
