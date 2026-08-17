alter table public.chat_messages
  drop constraint chat_messages_body_check;

alter table public.chat_messages
  add constraint chat_messages_body_check check (
    body = pg_catalog.regexp_replace(
      body,
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    )
    and pg_catalog.char_length(body) between 1 and 1000
  );

create index chat_messages_room_sender_rate_idx
  on public.chat_messages (room_id, user_id, created_at desc)
  where user_id is not null;

comment on constraint chat_messages_body_check on public.chat_messages is
  'Chat is stored as trimmed plain text with a fixed 1000-character maximum.';

create function public.send_chat_message(
  p_room_id uuid,
  p_body text
)
returns table (
  id uuid,
  room_id uuid,
  user_id uuid,
  sender_display_name text,
  body text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := pg_catalog.regexp_replace(
    p_body,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
  v_sender_display_name text;
  v_message public.chat_messages%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required';
  end if;

  if p_room_id is null then
    raise exception using
      errcode = '22023',
      message = 'Room ID is required';
  end if;

  if v_body is null or pg_catalog.char_length(v_body) < 1 then
    raise exception using
      errcode = '22023',
      message = 'Chat message cannot be empty';
  end if;

  if pg_catalog.char_length(v_body) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Chat message cannot exceed 1000 characters';
  end if;

  select rs.display_name
  into v_sender_display_name
  from public.room_sessions as rs
  where rs.room_id = p_room_id
    and rs.user_id = v_user_id;

  if v_sender_display_name is null then
    select 'Room owner'::text
    into v_sender_display_name
    from public.rooms as r
    where r.id = p_room_id
      and r.owner_user_id = v_user_id;
  end if;

  if v_sender_display_name is null then
    raise exception using
      errcode = '42501',
      message = 'Room membership is required';
  end if;

  -- Serialize this logical sender so concurrent requests cannot race the
  -- rolling limit. The fixed policy is at most 5 messages per 10 seconds.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_room_id::text || ':' || v_user_id::text, 0)
  );

  if (
    select pg_catalog.count(*)
    from public.chat_messages as cm
    where cm.room_id = p_room_id
      and cm.user_id = v_user_id
      and cm.created_at > v_now - interval '10 seconds'
  ) >= 5 then
    raise exception using
      errcode = 'P0001',
      message = 'Chat rate limit exceeded',
      detail = 'CHAT_RATE_LIMIT: maximum 5 messages per 10 seconds per user per room';
  end if;

  insert into public.chat_messages (
    room_id,
    user_id,
    sender_display_name,
    body,
    created_at
  )
  values (
    p_room_id,
    v_user_id,
    v_sender_display_name,
    v_body,
    v_now
  )
  returning * into v_message;

  return query
  select
    v_message.id,
    v_message.room_id,
    v_message.user_id,
    v_message.sender_display_name,
    v_message.body,
    v_message.created_at;
end;
$$;

comment on function public.send_chat_message(uuid, text) is
  'Canonical immutable room-chat send boundary. Enforces membership, a 1000-character maximum, and 5 messages per 10 seconds per user per room.';

revoke all on function public.send_chat_message(uuid, text)
  from public, anon, authenticated;
grant execute on function public.send_chat_message(uuid, text)
  to authenticated;

revoke insert, update, delete on table public.chat_messages
  from public, anon, authenticated;

create function private.broadcast_chat_message_created()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.send_room_event(
    new.room_id,
    'chat_message_created',
    pg_catalog.jsonb_build_object(
      'id', new.id,
      'user_id', new.user_id,
      'sender_display_name', new.sender_display_name,
      'body', new.body,
      'created_at', new.created_at
    )
  );

  return null;
end;
$$;

revoke all on function private.broadcast_chat_message_created()
  from public, anon, authenticated;

create trigger chat_messages_broadcast_created
after insert on public.chat_messages
for each row execute function private.broadcast_chat_message_created();
