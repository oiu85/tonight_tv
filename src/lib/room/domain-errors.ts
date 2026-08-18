import { AuthServiceError } from "../auth/auth-service";
import { MediaQueueError } from "../media/media-queue-service";
import type { MediaRuntimeError } from "../media/media-source";
import { PlaybackCommandError } from "../playback/playback-command-service";
import { RoomServiceError } from "../rooms/room-service";
import { SubtitleServiceError } from "../subtitles/subtitle-service";
import { RoomChatError } from "../chat/room-chat-service";

/**
 * Single narrow typed error vocabulary used by the room UI to decide
 * which user-safe copy to render, which UI actions to disable, and which
 * fallback to attempt. Raw backend errors must never reach the JSX.
 */
export type RoomUiError =
  | { kind: "auth"; message: string }
  | { kind: "not-found"; message: string }
  | { kind: "membership"; message: string }
  | { kind: "version-conflict"; message: string; recoverable: true }
  | { kind: "realtime"; message: string }
  | {
      kind: "media";
      category: MediaRuntimeError["category"];
      message: string;
      recoverable: boolean;
    }
  | { kind: "subtitle"; message: string }
  | { kind: "chat-rate-limit"; message: string }
  | { kind: "validation"; field?: string; message: string }
  | { kind: "unknown"; message: string };

export function roomUiErrorFromUnknown(
  error: unknown,
  fallback: string,
): RoomUiError {
  if (error instanceof PlaybackCommandError) {
    if (error.code === "stale_version") {
      return {
        kind: "version-conflict",
        recoverable: true,
        message:
          "Room state changed in another tab. Synced to the latest state.",
      };
    }
    if (error.code === "no_next_media") {
      return { kind: "validation", message: "There is nothing else in the queue." };
    }
    if (error.code === "authentication_required") {
      return { kind: "auth", message: "Sign in to control shared playback." };
    }
    if (error.code === "permission_denied") {
      return {
        kind: "membership",
        message: "Only the room owner may control shared playback.",
      };
    }
    return { kind: "unknown", message: fallback };
  }

  if (error instanceof RoomServiceError) {
    if (error.code === "room_not_found") {
      return {
        kind: "not-found",
        message: "This room link is invalid or no longer available.",
      };
    }
    if (error.code === "invalid_input") {
      return { kind: "validation", message: "Check the room information and try again." };
    }
    if (error.code === "authentication_required") {
      return { kind: "auth", message: "Sign in to continue." };
    }
    if (error.code === "permission_denied") {
      return {
        kind: "membership",
        message: "You are not a member of this private room.",
      };
    }
    return { kind: "unknown", message: fallback };
  }

  if (error instanceof AuthServiceError) {
    if (error.code === "admin_sign_in_failed") {
      return { kind: "auth", message: "The email or password is incorrect." };
    }
    return { kind: "auth", message: fallback };
  }

  if (error instanceof MediaQueueError) {
    if (error.code === "current_media_cannot_be_removed") {
      return {
        kind: "validation",
        message:
          "This item is currently playing. Select another item before deleting it.",
      };
    }
    if (error.code === "permission_denied") {
      return {
        kind: "membership",
        message: "Only the room owner may change the queue.",
      };
    }
    if (error.code === "invalid_input" || error.code === "invalid_queue_order") {
      return { kind: "validation", message: error.message };
    }
    if (error.code === "media_not_found") {
      return { kind: "validation", message: "This media item is no longer in the queue." };
    }
    if (error.code === "metadata_upload_failed") {
      return { kind: "unknown", message: "Torrent metadata could not be uploaded. Try the Magnet URI instead." };
    }
    if (error.code === "metadata_cleanup_failed") {
      return { kind: "unknown", message: "The queue changed, but old Torrent metadata could not be cleaned up." };
    }
    if (error.code === "request_failed") {
      return { kind: "realtime", message: "The queue request could not reach the server. Check your connection and try again." };
    }
    if (error.code === "invalid_response") {
      return { kind: "realtime", message: "The server returned an incomplete queue response. Refresh the room before retrying." };
    }
    return { kind: "unknown", message: fallback };
  }

  if (error instanceof SubtitleServiceError) {
    return { kind: "subtitle", message: error.message };
  }

  if (error instanceof RoomChatError) {
    if (error.code === "rate_limited") {
      return {
        kind: "chat-rate-limit",
        message: "You're sending messages too quickly. Try again shortly.",
      };
    }
    if (error.code === "invalid_input") {
      return {
        kind: "validation",
        field: "message",
        message: error.message,
      };
    }
    if (error.code === "authentication_required" || error.code === "permission_denied") {
      return {
        kind: "membership",
        message: "You no longer have access to send chat in this room.",
      };
    }
    return { kind: "unknown", message: fallback };
  }

  if (error instanceof Error && error.name === "MediaRuntimeError") {
    return {
      kind: "media",
      category: (error as MediaRuntimeError).category,
      recoverable: !(error as MediaRuntimeError).fatal,
      message: error.message,
    };
  }

  if (error instanceof Error && error.name === "RoomSyncError") {
    return { kind: "realtime", message: fallback };
  }

  return { kind: "unknown", message: fallback };
}

export function isStaleVersionConflict(error: unknown): boolean {
  return error instanceof PlaybackCommandError && error.code === "stale_version";
}

export function isTransientNetworkLike(error: unknown): boolean {
  if (error instanceof RoomServiceError) return error.code === "request_failed";
  if (error instanceof MediaQueueError) return error.code === "request_failed";
  if (error instanceof SubtitleServiceError) {
    return (
      error.code === "upload_failed" ||
      error.code === "download_failed" ||
      error.code === "metadata_failed"
    );
  }
  if (error instanceof RoomChatError) return error.code === "request_failed";
  return false;
}
