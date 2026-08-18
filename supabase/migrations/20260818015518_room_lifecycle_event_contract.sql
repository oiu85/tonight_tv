-- Keep the private room event transport allow-list aligned with the room
-- lifecycle trigger. Lifecycle events carry control-plane notifications only.
create or replace function private.send_room_event(
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
    'room_changed',
    'room_removed',
    'room_deactivated',
    'room_reactivated'
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
