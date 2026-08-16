import type { SupabaseClient } from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "../supabase/browser";
import type { Database } from "../supabase/database.types";

type PublicFunctions = Database["public"]["Functions"];

export type CanonicalPlaybackState = Readonly<
  PublicFunctions["room_play"]["Returns"][number]
>;

export type PlaybackCommandErrorCode =
  | "authentication_required"
  | "permission_denied"
  | "stale_version"
  | "invalid_command"
  | "no_next_media"
  | "invalid_response"
  | "request_failed";

export class PlaybackCommandError extends Error {
  readonly code: PlaybackCommandErrorCode;
  readonly databaseCode?: string;

  constructor(
    code: PlaybackCommandErrorCode,
    message: string,
    options?: ErrorOptions & { databaseCode?: string },
  ) {
    super(message, options);
    this.name = "PlaybackCommandError";
    this.code = code;
    this.databaseCode = options?.databaseCode;
  }
}

export type PlaybackCommandService = Readonly<{
  play: (roomId: string, expectedVersion: number) => Promise<CanonicalPlaybackState>;
  pause: (roomId: string, expectedVersion: number) => Promise<CanonicalPlaybackState>;
  seek: (
    roomId: string,
    expectedVersion: number,
    targetPositionSec: number,
  ) => Promise<CanonicalPlaybackState>;
  restart: (
    roomId: string,
    expectedVersion: number,
  ) => Promise<CanonicalPlaybackState>;
  selectMedia: (
    roomId: string,
    expectedVersion: number,
    mediaId: string,
    autoplay: boolean,
  ) => Promise<CanonicalPlaybackState>;
  markEnded: (
    roomId: string,
    expectedVersion: number,
  ) => Promise<CanonicalPlaybackState>;
  playNext: (
    roomId: string,
    expectedVersion: number,
  ) => Promise<CanonicalPlaybackState>;
}>;

type DatabaseError = Readonly<{
  code?: string;
  message?: string;
}>;

function asPlaybackCommandError(error: DatabaseError): PlaybackCommandError {
  switch (error.code) {
    case "40001":
      return new PlaybackCommandError(
        "stale_version",
        "The room changed before this command was applied.",
        { cause: error, databaseCode: error.code },
      );
    case "42501": {
      const authenticationRequired = error.message === "Authentication is required";
      return new PlaybackCommandError(
        authenticationRequired ? "authentication_required" : "permission_denied",
        authenticationRequired
          ? "Authentication is required for playback commands."
          : "Only the room owner may control shared playback.",
        { cause: error, databaseCode: error.code },
      );
    }
    case "P0002":
      return new PlaybackCommandError(
        "no_next_media",
        "There is no next media item in the room queue.",
        { cause: error, databaseCode: error.code },
      );
    case "22023":
    case "22P02":
    case "23503":
    case "23514":
      return new PlaybackCommandError(
        "invalid_command",
        "The playback command is not valid for the canonical room state.",
        { cause: error, databaseCode: error.code },
      );
    default:
      return new PlaybackCommandError(
        "request_failed",
        "Unable to apply the shared playback command.",
        { cause: error, databaseCode: error.code },
      );
  }
}

function invalidInput(message: string): PlaybackCommandError {
  return new PlaybackCommandError("invalid_command", message);
}

function validateExpectedVersion(expectedVersion: number): void {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw invalidInput("Expected version must be a nonnegative safe integer.");
  }
}

function unwrapState(
  data: readonly CanonicalPlaybackState[] | null,
  error: DatabaseError | null,
): CanonicalPlaybackState {
  if (error) {
    throw asPlaybackCommandError(error);
  }

  if (!data || data.length !== 1) {
    throw new PlaybackCommandError(
      "invalid_response",
      "Supabase returned an invalid canonical playback response.",
    );
  }

  return data[0];
}

export function createPlaybackCommandService(
  client: SupabaseClient<Database>,
): PlaybackCommandService {
  async function play(
    roomId: string,
    expectedVersion: number,
  ): Promise<CanonicalPlaybackState> {
    validateExpectedVersion(expectedVersion);
    const { data, error } = await client.rpc("room_play", {
      p_room_id: roomId,
      p_expected_version: expectedVersion,
    });
    return unwrapState(data, error);
  }

  async function pause(
    roomId: string,
    expectedVersion: number,
  ): Promise<CanonicalPlaybackState> {
    validateExpectedVersion(expectedVersion);
    const { data, error } = await client.rpc("room_pause", {
      p_room_id: roomId,
      p_expected_version: expectedVersion,
    });
    return unwrapState(data, error);
  }

  async function seek(
    roomId: string,
    expectedVersion: number,
    targetPositionSec: number,
  ): Promise<CanonicalPlaybackState> {
    validateExpectedVersion(expectedVersion);
    if (!Number.isFinite(targetPositionSec) || targetPositionSec < 0) {
      throw invalidInput("Seek target must be finite and nonnegative.");
    }

    const { data, error } = await client.rpc("room_seek", {
      p_room_id: roomId,
      p_expected_version: expectedVersion,
      p_target_position_sec: targetPositionSec,
    });
    return unwrapState(data, error);
  }

  async function restart(
    roomId: string,
    expectedVersion: number,
  ): Promise<CanonicalPlaybackState> {
    validateExpectedVersion(expectedVersion);
    const { data, error } = await client.rpc("room_restart", {
      p_room_id: roomId,
      p_expected_version: expectedVersion,
    });
    return unwrapState(data, error);
  }

  async function selectMedia(
    roomId: string,
    expectedVersion: number,
    mediaId: string,
    autoplay: boolean,
  ): Promise<CanonicalPlaybackState> {
    validateExpectedVersion(expectedVersion);
    const { data, error } = await client.rpc("room_select_media", {
      p_room_id: roomId,
      p_expected_version: expectedVersion,
      p_media_id: mediaId,
      p_autoplay: autoplay,
    });
    return unwrapState(data, error);
  }

  async function markEnded(
    roomId: string,
    expectedVersion: number,
  ): Promise<CanonicalPlaybackState> {
    validateExpectedVersion(expectedVersion);
    const { data, error } = await client.rpc("room_mark_ended", {
      p_room_id: roomId,
      p_expected_version: expectedVersion,
    });
    return unwrapState(data, error);
  }

  async function playNext(
    roomId: string,
    expectedVersion: number,
  ): Promise<CanonicalPlaybackState> {
    validateExpectedVersion(expectedVersion);
    const { data, error } = await client.rpc("room_play_next", {
      p_room_id: roomId,
      p_expected_version: expectedVersion,
    });
    return unwrapState(data, error);
  }

  return Object.freeze({
    play,
    pause,
    seek,
    restart,
    selectMedia,
    markEnded,
    playNext,
  });
}

let browserPlaybackCommandService: PlaybackCommandService | undefined;

export function getBrowserPlaybackCommandService(): PlaybackCommandService {
  browserPlaybackCommandService ??= createPlaybackCommandService(
    createBrowserSupabaseClient(),
  );
  return browserPlaybackCommandService;
}
