create type public.playback_status as enum (
  'idle',
  'paused',
  'playing',
  'ended'
);

create type public.media_source_type as enum (
  'auto',
  'mp4',
  'hls'
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_name_check check (
    name = btrim(name)
    and char_length(name) between 1 and 120
  )
);

create index rooms_owner_user_id_idx
  on public.rooms (owner_user_id);

create table public.room_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_sessions_room_id_user_id_key unique (room_id, user_id),
  constraint room_sessions_display_name_check check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 40
  )
);

create index room_sessions_user_id_room_id_idx
  on public.room_sessions (user_id, room_id);

create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  title text not null,
  source_url text not null,
  source_type public.media_source_type not null default 'auto',
  queue_position integer not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_items_room_id_id_key unique (room_id, id),
  constraint media_items_title_check check (
    title = btrim(title)
    and char_length(title) between 1 and 200
  ),
  constraint media_items_source_url_check check (
    source_url = btrim(source_url)
    and char_length(source_url) between 1 and 4096
  ),
  constraint media_items_queue_position_check check (queue_position >= 0)
);

create index media_items_room_queue_idx
  on public.media_items (room_id, queue_position, id);

create table public.subtitles (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  media_id uuid not null,
  label text not null,
  language_code text,
  storage_path text not null,
  format text not null default 'vtt',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint subtitles_room_media_fkey
    foreign key (room_id, media_id)
    references public.media_items (room_id, id)
    on delete cascade,
  constraint subtitles_label_check check (
    label = btrim(label)
    and char_length(label) between 1 and 100
  ),
  constraint subtitles_language_code_check check (
    language_code is null
    or (
      language_code = btrim(language_code)
      and char_length(language_code) between 1 and 35
    )
  ),
  constraint subtitles_storage_path_check check (
    storage_path =
      'rooms/' || room_id::text ||
      '/media/' || media_id::text ||
      '/' || id::text || '.vtt'
  ),
  constraint subtitles_format_check check (format = 'vtt')
);

create index subtitles_room_media_idx
  on public.subtitles (room_id, media_id);

create table public.room_playback_state (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  current_media_id uuid,
  status public.playback_status not null default 'idle',
  anchor_position_sec double precision not null default 0,
  anchor_server_time timestamptz not null default now(),
  state_version bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint room_playback_state_current_media_fkey
    foreign key (room_id, current_media_id)
    references public.media_items (room_id, id)
    on delete restrict,
  constraint room_playback_state_anchor_position_check check (
    anchor_position_sec >= 0
    and anchor_position_sec < 'Infinity'::double precision
  ),
  constraint room_playback_state_state_version_check check (state_version >= 0),
  constraint room_playback_state_media_status_check check (
    (status = 'idle' and current_media_id is null)
    or (status <> 'idle' and current_media_id is not null)
  )
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  sender_display_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint chat_messages_sender_display_name_check check (
    sender_display_name = btrim(sender_display_name)
    and char_length(sender_display_name) between 1 and 40
  ),
  constraint chat_messages_body_check check (
    body = btrim(body)
    and char_length(body) between 1 and 1000
  )
);

create index chat_messages_room_history_idx
  on public.chat_messages (room_id, created_at desc, id desc);

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create function public.enforce_playback_state_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.state_version <= old.state_version then
    raise exception using
      errcode = '23514',
      message = 'room_playback_state.state_version must increase on update';
  end if;

  return new;
end;
$$;

create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

create trigger room_sessions_set_updated_at
before update on public.room_sessions
for each row execute function public.set_updated_at();

create trigger media_items_set_updated_at
before update on public.media_items
for each row execute function public.set_updated_at();

create trigger room_playback_state_set_updated_at
before update on public.room_playback_state
for each row execute function public.set_updated_at();

create trigger room_playback_state_enforce_version
before update on public.room_playback_state
for each row execute function public.enforce_playback_state_version();

alter table public.rooms enable row level security;
alter table public.room_sessions enable row level security;
alter table public.media_items enable row level security;
alter table public.subtitles enable row level security;
alter table public.room_playback_state enable row level security;
alter table public.chat_messages enable row level security;

revoke all privileges on table public.rooms from public, anon, authenticated;
revoke all privileges on table public.room_sessions from public, anon, authenticated;
revoke all privileges on table public.media_items from public, anon, authenticated;
revoke all privileges on table public.subtitles from public, anon, authenticated;
revoke all privileges on table public.room_playback_state from public, anon, authenticated;
revoke all privileges on table public.chat_messages from public, anon, authenticated;

grant select on table public.rooms to authenticated;
grant select on table public.room_sessions to authenticated;
grant select on table public.media_items to authenticated;
grant select on table public.subtitles to authenticated;
grant select on table public.room_playback_state to authenticated;
grant select on table public.chat_messages to authenticated;

revoke all on type public.playback_status from public, anon, authenticated;
revoke all on type public.media_source_type from public, anon, authenticated;
grant usage on type public.playback_status to authenticated;
grant usage on type public.media_source_type to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.enforce_playback_state_version() from public, anon, authenticated;
