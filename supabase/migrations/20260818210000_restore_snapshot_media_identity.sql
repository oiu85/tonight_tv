-- Restore the complete media identity on room snapshots. The lifecycle snapshot
-- rewrite dropped YouTube, Torrent, and P2P fields, so players received a
-- source type with no playable identity and every provider failed to start.

create or replace function public.get_room_snapshot(
  p_room_id uuid,
  p_chat_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_chat_limit integer := least(
    greatest(coalesce(p_chat_limit, 50), 1),
    100
  );
  v_snapshot jsonb;
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

  if not exists (
    select 1
    from public.rooms as r
    where r.id = p_room_id
      and r.owner_user_id = v_user_id
  ) and not exists (
    select 1
    from public.room_sessions as rs
    where rs.room_id = p_room_id
      and rs.user_id = v_user_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Room membership is required';
  end if;

  select pg_catalog.jsonb_build_object(
    'server_time', pg_catalog.statement_timestamp(),
    'room', pg_catalog.jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'owner_user_id', r.owner_user_id,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'status', r.status,
      'deactivated_at', r.deactivated_at
    ),
    'caller', pg_catalog.jsonb_build_object(
      'user_id', v_user_id,
      'is_owner', r.owner_user_id = v_user_id,
      'room_session_id', caller_session.id,
      'display_name', caller_session.display_name
    ),
    'playback', pg_catalog.jsonb_build_object(
      'room_id', ps.room_id,
      'current_media_id', ps.current_media_id,
      'status', ps.status,
      'anchor_position_sec', ps.anchor_position_sec,
      'anchor_server_time', ps.anchor_server_time,
      'state_version', ps.state_version,
      'updated_at', ps.updated_at
    ),
    'current_media', case
      when current_media.id is null then null
      else pg_catalog.jsonb_build_object(
        'id', current_media.id,
        'title', current_media.title,
        'source_url', current_media.source_url,
        'source_type', current_media.source_type,
        'source_revision', current_media.source_revision,
        'youtube_video_id', current_media.youtube_video_id,
        'torrent_info_hash', current_media.torrent_info_hash,
        'torrent_input_kind', current_media.torrent_input_kind,
        'torrent_magnet_uri', current_media.torrent_magnet_uri,
        'torrent_file_index', current_media.torrent_file_index,
        'torrent_file_path', current_media.torrent_file_path,
        'torrent_file_name', current_media.torrent_file_name,
        'torrent_file_size', current_media.torrent_file_size,
        'queue_position', current_media.queue_position,
        'created_at', current_media.created_at,
        'updated_at', current_media.updated_at
      )
    end,
    'subtitles', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', s.id,
          'media_id', s.media_id,
          'label', s.label,
          'language_code', s.language_code,
          'storage_path', s.storage_path,
          'format', s.format,
          'created_at', s.created_at
        )
        order by s.created_at, s.id
      )
      from public.subtitles as s
      where s.room_id = r.id
        and s.media_id = ps.current_media_id
    ), '[]'::jsonb),
    'queue', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', queue_item.id,
          'title', queue_item.title,
          'source_url', queue_item.source_url,
          'source_type', queue_item.source_type,
          'source_revision', queue_item.source_revision,
          'youtube_video_id', queue_item.youtube_video_id,
          'torrent_info_hash', queue_item.torrent_info_hash,
          'torrent_input_kind', queue_item.torrent_input_kind,
          'torrent_magnet_uri', queue_item.torrent_magnet_uri,
          'torrent_file_index', queue_item.torrent_file_index,
          'torrent_file_path', queue_item.torrent_file_path,
          'torrent_file_name', queue_item.torrent_file_name,
          'torrent_file_size', queue_item.torrent_file_size,
          'queue_position', queue_item.queue_position,
          'created_at', queue_item.created_at,
          'updated_at', queue_item.updated_at
        )
        order by queue_item.queue_position, queue_item.id
      )
      from public.media_items as queue_item
      where queue_item.room_id = r.id
    ), '[]'::jsonb),
    'recent_chat', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', recent.id,
          'user_id', recent.user_id,
          'sender_display_name', recent.sender_display_name,
          'body', recent.body,
          'created_at', recent.created_at
        )
        order by recent.created_at, recent.id
      )
      from (
        select
          cm.id,
          cm.user_id,
          cm.sender_display_name,
          cm.body,
          cm.created_at
        from public.chat_messages as cm
        where cm.room_id = r.id
        order by cm.created_at desc, cm.id desc
        limit v_chat_limit
      ) as recent
    ), '[]'::jsonb)
  )
  into v_snapshot
  from public.rooms as r
  join public.room_playback_state as ps on ps.room_id = r.id
  left join public.media_items as current_media
    on current_media.room_id = ps.room_id
   and current_media.id = ps.current_media_id
  left join public.room_sessions as caller_session
    on caller_session.room_id = r.id
   and caller_session.user_id = v_user_id
  where r.id = p_room_id;

  if v_snapshot is null then
    raise exception using
      errcode = 'P0002',
      message = 'Room snapshot is unavailable';
  end if;

  return v_snapshot;
end;
$$;

revoke all on function public.get_room_snapshot(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_room_snapshot(uuid, integer)
  to authenticated;
