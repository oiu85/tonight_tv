import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "../../../supabase/server";
import type { Database } from "../../../supabase/database.types";
import { TorrentGatewayError } from "../../domain/contracts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TorrentRouteContext = Readonly<{
  supabase: SupabaseClient<Database>;
  user: User;
  isOwner: boolean;
}>;

export type AuthorizedTorrentMedia = Readonly<{
  context: TorrentRouteContext;
  media: Database["public"]["Tables"]["media_items"]["Row"];
}>;

function validateUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new TorrentGatewayError("invalid_torrent", `${label} is invalid.`, { status: 400 });
  }
}

async function authenticatedContext(roomId: string): Promise<TorrentRouteContext> {
  validateUuid(roomId, "Room ID");
  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new TorrentGatewayError("gateway_auth_failed", "Authentication is required.", { status: 401 });
  }
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, owner_user_id")
    .eq("id", roomId)
    .maybeSingle();
  if (roomError || !room) {
    throw new TorrentGatewayError("gateway_auth_failed", "Room membership is required.", { status: 403 });
  }
  return Object.freeze({
    supabase,
    user: userData.user,
    isOwner: room.owner_user_id === userData.user.id,
  });
}

export async function requireTorrentOwner(roomId: string): Promise<TorrentRouteContext> {
  const context = await authenticatedContext(roomId);
  if (!context.isOwner) {
    throw new TorrentGatewayError("gateway_auth_failed", "Only the room owner may manage Torrent sources.", { status: 403 });
  }
  return context;
}

export async function requireAuthorizedTorrentMedia(
  roomId: string,
  mediaId: string,
): Promise<AuthorizedTorrentMedia> {
  validateUuid(mediaId, "Media ID");
  const context = await authenticatedContext(roomId);
  const [{ data: media, error: mediaError }, { data: playback, error: playbackError }] = await Promise.all([
    context.supabase.from("media_items").select("*").eq("room_id", roomId).eq("id", mediaId).maybeSingle(),
    context.supabase.from("room_playback_state").select("current_media_id").eq("room_id", roomId).maybeSingle(),
  ]);
  if (mediaError || !media || media.source_type !== "torrent") {
    throw new TorrentGatewayError("selected_file_missing", "Torrent media was not found in this room.", { status: 404 });
  }
  if (playbackError || !playback) {
    throw new TorrentGatewayError("gateway_auth_failed", "Room playback state is unavailable.", { status: 403 });
  }
  if (!context.isOwner && playback.current_media_id !== mediaId) {
    throw new TorrentGatewayError("gateway_auth_failed", "Viewers may resolve only the room's current media.", { status: 403 });
  }
  return Object.freeze({ context, media: Object.freeze(media) });
}
