"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createPlaybackCommandService,
  PlaybackCommandError,
  type CanonicalPlaybackState,
  type PlaybackCommandService,
} from "../playback/playback-command-service";
import { createBrowserSupabaseClient } from "../supabase/browser";
import type { Database } from "../supabase/database.types";

export type MediaSourceType = Database["public"]["Enums"]["media_source_type"];
export type MediaItem = Readonly<Database["public"]["Tables"]["media_items"]["Row"]>;

export type MediaItemInput = Readonly<{
  title: string;
  sourceUrl: string;
  sourceType: MediaSourceType;
}>;

export type MediaQueueErrorCode =
  | "authentication_required"
  | "permission_denied"
  | "invalid_input"
  | "media_not_found"
  | "current_media_cannot_be_removed"
  | "invalid_queue_order"
  | "stale_version"
  | "no_next_media"
  | "invalid_response"
  | "request_failed";

export class MediaQueueError extends Error {
  readonly code: MediaQueueErrorCode;
  readonly databaseCode?: string;

  constructor(
    code: MediaQueueErrorCode,
    message: string,
    options?: ErrorOptions & { databaseCode?: string },
  ) {
    super(message, options);
    this.name = "MediaQueueError";
    this.code = code;
    this.databaseCode = options?.databaseCode;
  }
}

export type MediaQueueService = Readonly<{
  listQueue: (roomId: string) => Promise<readonly MediaItem[]>;
  addMedia: (roomId: string, input: MediaItemInput) => Promise<MediaItem>;
  editMedia: (
    roomId: string,
    mediaId: string,
    input: MediaItemInput,
  ) => Promise<MediaItem>;
  removeMedia: (roomId: string, mediaId: string) => Promise<MediaItem>;
  reorderMedia: (
    roomId: string,
    orderedMediaIds: readonly string[],
  ) => Promise<readonly MediaItem[]>;
  playNext: (
    roomId: string,
    expectedVersion: number,
  ) => Promise<CanonicalPlaybackState>;
}>;

type DatabaseError = Readonly<{ code?: string; message?: string }>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_TYPES = new Set<MediaSourceType>(["auto", "mp4", "hls"]);

function invalidInput(message: string): MediaQueueError {
  return new MediaQueueError("invalid_input", message);
}

function validateId(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw invalidInput(`${label} must be a valid UUID.`);
  }
}

function normalizeInput(input: MediaItemInput): MediaItemInput {
  const title = input.title.trim();
  const sourceUrl = input.sourceUrl.trim();
  if (title.length === 0 || title.length > 200) {
    throw invalidInput("Media title must be between 1 and 200 characters.");
  }
  if (sourceUrl.length < 8 || sourceUrl.length > 4_096 || /[\s\u0000-\u001f]/u.test(sourceUrl)) {
    throw invalidInput("Media source must be a valid HTTP or HTTPS URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw invalidInput("Media source must be a valid HTTP or HTTPS URL.");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw invalidInput("Media source must be a credential-free HTTP or HTTPS URL.");
  }
  if (!SOURCE_TYPES.has(input.sourceType)) {
    throw invalidInput("Media source type must be auto, mp4, or hls.");
  }

  return Object.freeze({ title, sourceUrl, sourceType: input.sourceType });
}

function mapDatabaseError(error: DatabaseError): MediaQueueError {
  switch (error.code) {
    case "42501": {
      const unauthenticated = error.message === "Authentication is required";
      return new MediaQueueError(
        unauthenticated ? "authentication_required" : "permission_denied",
        unauthenticated
          ? "Authentication is required for queue operations."
          : "Only the room owner may change the queue.",
        { cause: error, databaseCode: error.code },
      );
    }
    case "55000":
      return new MediaQueueError(
        "current_media_cannot_be_removed",
        "Select another media item before removing the current item.",
        { cause: error, databaseCode: error.code },
      );
    case "P0002":
      return new MediaQueueError("media_not_found", "The media item was not found.", {
        cause: error,
        databaseCode: error.code,
      });
    case "22023":
    case "22P02":
    case "23503":
    case "23514":
      return new MediaQueueError(
        "invalid_queue_order",
        "The media request or queue order is invalid.",
        { cause: error, databaseCode: error.code },
      );
    default:
      return new MediaQueueError("request_failed", "Unable to update the media queue.", {
        cause: error,
        databaseCode: error.code,
      });
  }
}

function mapPlaybackError(error: PlaybackCommandError): MediaQueueError {
  const mappedCode: MediaQueueErrorCode =
    error.code === "stale_version"
      ? "stale_version"
      : error.code === "no_next_media"
        ? "no_next_media"
        : error.code === "authentication_required"
          ? "authentication_required"
          : error.code === "permission_denied"
            ? "permission_denied"
            : error.code === "invalid_response"
              ? "invalid_response"
              : error.code === "invalid_command"
                ? "invalid_input"
                : "request_failed";

  return new MediaQueueError(mappedCode, error.message, {
    cause: error,
    databaseCode: error.databaseCode,
  });
}

function unwrapSingle(
  data: readonly MediaItem[] | null,
  error: DatabaseError | null,
): MediaItem {
  if (error) {
    throw mapDatabaseError(error);
  }
  if (!data || data.length !== 1) {
    throw new MediaQueueError(
      "invalid_response",
      "Supabase returned an invalid media response.",
    );
  }
  return Object.freeze(data[0]);
}

export function createMediaQueueService(
  client: SupabaseClient<Database>,
  playbackCommands: Pick<PlaybackCommandService, "playNext"> =
    createPlaybackCommandService(client),
): MediaQueueService {
  async function listQueue(roomId: string): Promise<readonly MediaItem[]> {
    validateId(roomId, "Room ID");
    const { data, error } = await client
      .from("media_items")
      .select("*")
      .eq("room_id", roomId)
      .order("queue_position", { ascending: true })
      .order("id", { ascending: true });
    if (error) {
      throw mapDatabaseError(error);
    }
    return Object.freeze((data ?? []).map((item) => Object.freeze(item)));
  }

  async function addMedia(roomId: string, input: MediaItemInput): Promise<MediaItem> {
    validateId(roomId, "Room ID");
    const normalized = normalizeInput(input);
    const { data, error } = await client.rpc("add_media_item", {
      p_room_id: roomId,
      p_title: normalized.title,
      p_source_url: normalized.sourceUrl,
      p_source_type: normalized.sourceType,
    });
    return unwrapSingle(data, error);
  }

  async function editMedia(
    roomId: string,
    mediaId: string,
    input: MediaItemInput,
  ): Promise<MediaItem> {
    validateId(roomId, "Room ID");
    validateId(mediaId, "Media ID");
    const normalized = normalizeInput(input);
    const { data, error } = await client.rpc("edit_media_item", {
      p_room_id: roomId,
      p_media_id: mediaId,
      p_title: normalized.title,
      p_source_url: normalized.sourceUrl,
      p_source_type: normalized.sourceType,
    });
    return unwrapSingle(data, error);
  }

  async function removeMedia(roomId: string, mediaId: string): Promise<MediaItem> {
    validateId(roomId, "Room ID");
    validateId(mediaId, "Media ID");
    const { data, error } = await client.rpc("remove_media_item", {
      p_room_id: roomId,
      p_media_id: mediaId,
    });
    return unwrapSingle(data, error);
  }

  async function reorderMedia(
    roomId: string,
    orderedMediaIds: readonly string[],
  ): Promise<readonly MediaItem[]> {
    validateId(roomId, "Room ID");
    if (orderedMediaIds.length > 500) {
      throw invalidInput("A room queue may contain at most 500 media items.");
    }
    for (const mediaId of orderedMediaIds) {
      validateId(mediaId, "Media ID");
    }
    if (new Set(orderedMediaIds).size !== orderedMediaIds.length) {
      throw invalidInput("Queue order cannot contain duplicate media IDs.");
    }

    const { data, error } = await client.rpc("reorder_media_items", {
      p_room_id: roomId,
      p_ordered_media_ids: [...orderedMediaIds],
    });
    if (error) {
      throw mapDatabaseError(error);
    }
    if (!data || data.length !== orderedMediaIds.length) {
      throw new MediaQueueError(
        "invalid_response",
        "Supabase returned an invalid reordered queue.",
      );
    }
    return Object.freeze(data.map((item) => Object.freeze(item)));
  }

  async function playNext(
    roomId: string,
    expectedVersion: number,
  ): Promise<CanonicalPlaybackState> {
    validateId(roomId, "Room ID");
    try {
      return await playbackCommands.playNext(roomId, expectedVersion);
    } catch (error) {
      if (error instanceof PlaybackCommandError) {
        throw mapPlaybackError(error);
      }
      throw error;
    }
  }

  return Object.freeze({
    listQueue,
    addMedia,
    editMedia,
    removeMedia,
    reorderMedia,
    playNext,
  });
}

let browserMediaQueueService: MediaQueueService | undefined;

export function getBrowserMediaQueueService(): MediaQueueService {
  browserMediaQueueService ??= createMediaQueueService(createBrowserSupabaseClient());
  return browserMediaQueueService;
}
