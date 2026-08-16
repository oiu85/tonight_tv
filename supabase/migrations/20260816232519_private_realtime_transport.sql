create function private.realtime_room_id(p_topic text)
returns uuid
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_topic ~* '^room:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then pg_catalog.substr(p_topic, 6)::uuid
    else null
  end;
$$;

revoke all on function private.realtime_room_id(text)
  from public, anon, authenticated;
grant execute on function private.realtime_room_id(text)
  to authenticated;

create policy realtime_room_member_receive
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.realtime_room_id((select realtime.topic())) in (
    select authorized.room_id
    from private.authorized_room_ids() as authorized
  )
);

create policy realtime_room_member_presence_send
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and private.realtime_room_id((select realtime.topic())) in (
    select authorized.room_id
    from private.authorized_room_ids() as authorized
  )
);

create function private.send_room_event(
  p_room_id uuid,
  p_event text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  if p_room_id is null then
    raise exception using
      errcode = '22023',
      message = 'Room ID is required for a room event';
  end if;

  if p_event not in (
    'playback_state_changed',
    'queue_changed',
    'subtitle_metadata_changed',
    'chat_message_created',
    'room_changed'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Unsupported room event';
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || pg_catalog.jsonb_build_object('room_id', p_room_id);

  perform realtime.send(
    v_payload,
    p_event,
    'room:' || p_room_id::text,
    true
  );
end;
$$;

revoke all on function private.send_room_event(uuid, text, jsonb)
  from public, anon, authenticated;

create function private.broadcast_playback_state_changed()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.send_room_event(
    new.room_id,
    'playback_state_changed',
    pg_catalog.jsonb_build_object(
      'current_media_id', new.current_media_id,
      'status', new.status,
      'anchor_position_sec', new.anchor_position_sec,
      'anchor_server_time', new.anchor_server_time,
      'state_version', new.state_version,
      'updated_at', new.updated_at
    )
  );

  return null;
end;
$$;

create function private.broadcast_queue_changed()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.media_items%rowtype;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;

  perform private.send_room_event(
    v_row.room_id,
    'queue_changed',
    pg_catalog.jsonb_build_object(
      'media_id', v_row.id,
      'operation', pg_catalog.lower(tg_op)
    )
  );

  return null;
end;
$$;

create function private.broadcast_subtitle_metadata_changed()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.subtitles%rowtype;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;

  perform private.send_room_event(
    v_row.room_id,
    'subtitle_metadata_changed',
    pg_catalog.jsonb_build_object(
      'subtitle_id', v_row.id,
      'media_id', v_row.media_id,
      'operation', pg_catalog.lower(tg_op)
    )
  );

  return null;
end;
$$;

revoke all on function private.broadcast_playback_state_changed()
  from public, anon, authenticated;
revoke all on function private.broadcast_queue_changed()
  from public, anon, authenticated;
revoke all on function private.broadcast_subtitle_metadata_changed()
  from public, anon, authenticated;

create trigger room_playback_state_broadcast_change
after update on public.room_playback_state
for each row execute function private.broadcast_playback_state_changed();

create trigger media_items_broadcast_queue_change
after insert or update or delete on public.media_items
for each row execute function private.broadcast_queue_changed();

create trigger subtitles_broadcast_metadata_change
after insert or update or delete on public.subtitles
for each row execute function private.broadcast_subtitle_metadata_changed();
