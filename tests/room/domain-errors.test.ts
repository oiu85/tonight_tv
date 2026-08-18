import { describe, expect, it } from "vitest";

import { AuthServiceError } from "../../src/lib/auth/auth-service";
import { RoomChatError } from "../../src/lib/chat/room-chat-service";
import { MediaQueueError } from "../../src/lib/media/media-queue-service";
import { MediaRuntimeError } from "../../src/lib/media/media-source";
import { PlaybackCommandError } from "../../src/lib/playback/playback-command-service";
import { RoomServiceError } from "../../src/lib/rooms/room-service";
import { SubtitleServiceError } from "../../src/lib/subtitles/subtitle-service";
import {
  isStaleVersionConflict,
  isTransientNetworkLike,
  roomUiErrorFromUnknown,
} from "../../src/lib/room/domain-errors";

describe("room UI error normalization", () => {
  it("translates playback stale-version errors into recoverable version conflicts", () => {
    const error = new PlaybackCommandError(
      "stale_version",
      "The room changed before this command was applied.",
    );
    const result = roomUiErrorFromUnknown(error, "ignored fallback");
    expect(result.kind).toBe("version-conflict");
    expect((result as { recoverable: boolean }).recoverable).toBe(true);
    expect(isStaleVersionConflict(error)).toBe(true);
  });

  it("translates no-next-media into a validation error", () => {
    const error = new PlaybackCommandError(
      "no_next_media",
      "There is no next media item in the room queue.",
    );
    expect(roomUiErrorFromUnknown(error, "x").kind).toBe("validation");
  });

  it("translates room-not-found into a not-found error", () => {
    const error = new RoomServiceError("room_not_found", "missing");
    expect(roomUiErrorFromUnknown(error, "x").kind).toBe("not-found");
  });

  it("maps admin sign-in failures to safe auth copy", () => {
    const error = new AuthServiceError("admin_sign_in_failed", "nope");
    const result = roomUiErrorFromUnknown(error, "x");
    expect(result.kind).toBe("auth");
    expect(result.message).toMatch(/email or password is incorrect/i);
  });

  it("maps current-media deletion rejection to a specific validation message", () => {
    const error = new MediaQueueError("current_media_cannot_be_removed", "x");
    const result = roomUiErrorFromUnknown(error, "x");
    expect(result.kind).toBe("validation");
    expect(result.message).toMatch(/Select another item/i);
  });

  it("maps queue transport failures to an actionable safe message", () => {
    const error = new MediaQueueError("request_failed", "postgres internal details");
    const result = roomUiErrorFromUnknown(error, "fallback");
    expect(result.kind).toBe("realtime");
    expect(result.message).toMatch(/check your connection/i);
    expect(result.message).not.toMatch(/postgres/i);
  });

  it("keeps coordinator failures separate from queue mutation errors", () => {
    const error = new Error("player failed after the queue RPC succeeded");
    error.name = "RoomSyncError";
    const result = roomUiErrorFromUnknown(
      error,
      "Media was added, but the room is still synchronizing playback.",
    );
    expect(result).toEqual({
      kind: "realtime",
      message: "Media was added, but the room is still synchronizing playback.",
    });
  });

  it("maps chat rate-limit to a chat-rate-limit error", () => {
    const error = new RoomChatError("rate_limited", "slow down");
    const result = roomUiErrorFromUnknown(error, "x");
    expect(result.kind).toBe("chat-rate-limit");
    expect(result.message).toMatch(/too quickly/i);
  });

  it("maps subtitle errors to subtitle kind with the original message", () => {
    const error = new SubtitleServiceError("upload_failed", "upload rejected");
    const result = roomUiErrorFromUnknown(error, "x");
    expect(result.kind).toBe("subtitle");
    expect(result.message).toBe("upload rejected");
  });

  it("maps media runtime errors to a media kind with the underlying category", () => {
    const error = new MediaRuntimeError(
      "autoplay_permission_blocked",
      "Permission required",
      { fatal: false },
    );
    const result = roomUiErrorFromUnknown(error, "x");
    expect(result.kind).toBe("media");
    if (result.kind === "media") {
      expect(result.category).toBe("autoplay_permission_blocked");
      expect(result.recoverable).toBe(true);
    }
  });

  it("returns unknown for arbitrary errors and never exposes raw internals", () => {
    const result = roomUiErrorFromUnknown(new Error("postgres: permission denied for column x"), "x");
    expect(result.kind).toBe("unknown");
    expect(result.message).not.toMatch(/postgres/i);
  });

  it("flags network-like failures for toast retry affordance", () => {
    const room = new RoomServiceError("request_failed", "x");
    const chat = new RoomChatError("request_failed", "x");
    const subtitle = new SubtitleServiceError("download_failed", "x");
    expect(isTransientNetworkLike(room)).toBe(true);
    expect(isTransientNetworkLike(chat)).toBe(true);
    expect(isTransientNetworkLike(subtitle)).toBe(true);
    expect(isTransientNetworkLike(new PlaybackCommandError("invalid_command", "x"))).toBe(false);
  });
});
