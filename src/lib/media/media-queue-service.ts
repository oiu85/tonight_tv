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
import { parseTorrentFileIdentity } from "../torrent/torrent-manifest";
import type { LocalP2pDescriptor } from "../p2p/local-p2p-contracts";
import { extractYouTubeVideoId } from "./youtube-identity";

export type MediaSourceType = Database["public"]["Enums"]["media_source_type"];
export type MediaItem = Readonly<Database["public"]["Tables"]["media_items"]["Row"]>;

export type MediaItemInput =
  | Readonly<{
      title: string;
      sourceUrl: string;
      sourceType: Exclude<MediaSourceType, "youtube" | "torrent" | "local_p2p">;
      youtubeVideoId?: never;
      torrent?: never;
      localP2p?: never;
    }>
  | Readonly<{
      title: string;
      sourceUrl?: null;
      sourceType: "youtube";
      youtubeVideoId: string;
      torrent?: never;
      localP2p?: never;
    }>
  | Readonly<{
      title: string;
      sourceUrl?: null;
      sourceType: "torrent";
      youtubeVideoId?: never;
      torrent: Readonly<{
        infoHash: string;
        inputKind: "magnet" | "torrent_file";
        magnetUri?: string | null;
        metadataFile?: File | null;
        torrentName?: string | null;
        fileIndex: number;
        filePath: string;
        fileName: string;
        fileSize: number;
      }>;
      localP2p?: never;
    }>
  | Readonly<{
      title: string;
      sourceUrl?: null;
      sourceType: "local_p2p";
      youtubeVideoId?: never;
      torrent?: never;
      localP2p: LocalP2pDescriptor;
    }>;

type NormalizedTorrentInput = Readonly<{
  infoHash: string;
  inputKind: "magnet" | "torrent_file";
  magnetUri: string | null;
  metadataFile: File | null;
  torrentName: string | null;
  fileIndex: number;
  filePath: string;
  fileName: string;
  fileSize: number;
}>;

type NormalizedMediaItemInput = Readonly<{
  title: string;
  sourceUrl: string | null;
  sourceType: MediaSourceType;
  youtubeVideoId: string | null;
  torrent: NormalizedTorrentInput | null;
  localP2p: LocalP2pDescriptor | null;
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
  | "metadata_upload_failed"
  | "metadata_cleanup_failed"
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
const SOURCE_TYPES = new Set<MediaSourceType>([
  "auto",
  "mp4",
  "hls",
  "youtube",
  "torrent",
  "local_p2p",
]);
const TORRENT_METADATA_BUCKET = "torrent-metadata";
const TORRENT_METADATA_MAX_BYTES = 2 * 1024 * 1024;

function invalidInput(message: string): MediaQueueError {
  return new MediaQueueError("invalid_input", message);
}

function validateId(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw invalidInput(`${label} must be a valid UUID.`);
  }
}

function normalizeInput(input: MediaItemInput): NormalizedMediaItemInput {
  const title = input.title.trim();
  if (title.length === 0 || title.length > 200) {
    throw invalidInput("Media title must be between 1 and 200 characters.");
  }
  if (!SOURCE_TYPES.has(input.sourceType)) {
    throw invalidInput(
      "Media source type must be auto, mp4, hls, youtube, torrent, or local_p2p.",
    );
  }

  if (input.sourceType === "youtube") {
    const youtubeVideoId = extractYouTubeVideoId(input.youtubeVideoId);
    if (!youtubeVideoId) {
      throw invalidInput(
        "Enter a valid YouTube Video ID or watch URL.",
      );
    }
    return Object.freeze({
      title,
      sourceUrl: null,
      sourceType: "youtube",
      youtubeVideoId,
      torrent: null,
      localP2p: null,
    });
  }

  if (input.sourceType === "torrent") {
    const torrent = input.torrent;
    const infoHash = torrent.infoHash.trim().toLowerCase();
    const filePath = torrent.filePath.trim();
    const fileName = torrent.fileName.trim();
    if (!/^[a-f0-9]{40}$/.test(infoHash)) {
      throw invalidInput("Torrent info hash is invalid.");
    }
    if (
      !Number.isInteger(torrent.fileIndex) ||
      torrent.fileIndex < 0 ||
      !Number.isFinite(torrent.fileSize) ||
      torrent.fileSize < 0 ||
      filePath.length < 1 ||
      filePath.length > 1_024 ||
      /(^|\/)\.\.(\/|$)/.test(filePath) ||
      fileName.length < 1 ||
      fileName.length > 255
    ) {
      throw invalidInput("Select a valid playable Torrent file.");
    }

    if (torrent.inputKind === "magnet") {
      const magnetUri = torrent.magnetUri?.trim() || null;
      if (
        magnetUri !== null &&
        (!magnetUri.startsWith("magnet:?") || magnetUri.length > 16_384)
      ) {
        throw invalidInput("Magnet URI is invalid.");
      }
      return Object.freeze({
        title,
        sourceUrl: null,
        sourceType: "torrent",
        youtubeVideoId: null,
        torrent: Object.freeze({
          infoHash,
          inputKind: "magnet",
          magnetUri,
          metadataFile: null,
          torrentName: torrent.torrentName?.trim() || null,
          fileIndex: torrent.fileIndex,
          filePath,
          fileName,
          fileSize: torrent.fileSize,
        }),
        localP2p: null,
      });
    }

    const metadataFile = torrent.metadataFile;
    if (
      metadataFile !== null &&
      (!(metadataFile instanceof File) ||
        metadataFile.size === 0 ||
        metadataFile.size > TORRENT_METADATA_MAX_BYTES)
    ) {
      throw invalidInput(
        "Choose a valid .torrent metadata file no larger than 2 MiB.",
      );
    }
    return Object.freeze({
      title,
      sourceUrl: null,
      sourceType: "torrent",
      youtubeVideoId: null,
      torrent: Object.freeze({
        infoHash,
        inputKind: "torrent_file",
        magnetUri: null,
        metadataFile,
        torrentName: torrent.torrentName?.trim() || null,
        fileIndex: torrent.fileIndex,
        filePath,
        fileName,
        fileSize: torrent.fileSize,
      }),
      localP2p: null,
    });
  }

  if (input.sourceType === "local_p2p") {
    const descriptor = input.localP2p;
    const infoHash = descriptor.infoHash.trim().toLowerCase();
    const magnetUri = descriptor.magnetUri.trim();
    const fileName = descriptor.fileName.trim();
    if (!/^[a-f0-9]{40}$/.test(infoHash) || !magnetUri.startsWith("magnet:?") || magnetUri.length > 16_384 || !magnetUri.toLowerCase().includes(`xt=urn:btih:${infoHash}`) || fileName.length < 1 || fileName.length > 255 || /[\\/]/.test(fileName) || !Number.isFinite(descriptor.fileSize) || descriptor.fileSize <= 0) {
      throw invalidInput("Local P2P media requires a valid browser-generated descriptor.");
    }
    return Object.freeze({ title, sourceUrl: null, sourceType: "local_p2p", youtubeVideoId: null, torrent: null, localP2p: Object.freeze({ infoHash, magnetUri, fileName, fileSize: descriptor.fileSize, mimeType: descriptor.mimeType?.trim() || null }) });
  }

  const sourceUrl = input.sourceUrl.trim();
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

  const youtubeFromUrl = extractYouTubeVideoId(sourceUrl);
  if (youtubeFromUrl && input.sourceType === "auto") {
    return Object.freeze({
      title,
      sourceUrl: null,
      sourceType: "youtube",
      youtubeVideoId: youtubeFromUrl,
      torrent: null,
      localP2p: null,
    });
  }

  return Object.freeze({
    title,
    sourceUrl,
    sourceType: input.sourceType,
    youtubeVideoId: null,
    torrent: null,
    localP2p: null,
  });
}

function mediaRpcArgs(
  roomId: string,
  mediaId: string,
  normalized: NormalizedMediaItemInput,
  metadataPath: string | null,
) {
  const base = {
    p_room_id: roomId,
    p_title: normalized.title,
    p_source_type: normalized.sourceType,
  };
  if (normalized.localP2p) {
    return { p_room_id: roomId, p_media_id: mediaId, p_title: normalized.title, p_info_hash: normalized.localP2p.infoHash, p_magnet_uri: normalized.localP2p.magnetUri, p_file_name: normalized.localP2p.fileName, p_file_size: normalized.localP2p.fileSize };
  }
  if (normalized.sourceType === "youtube") {
    return {
      ...base,
      p_source_url: undefined,
      p_youtube_video_id: normalized.youtubeVideoId ?? undefined,
    };
  }
  if (!normalized.torrent) {
    return { ...base, p_source_url: normalized.sourceUrl ?? "" };
  }
  return {
    ...base,
    p_source_url: undefined,
    p_youtube_video_id: undefined,
    p_torrent_info_hash: normalized.torrent.infoHash,
    p_torrent_input_kind: normalized.torrent.inputKind,
    p_torrent_magnet_uri: normalized.torrent.magnetUri ?? undefined,
    p_torrent_metadata_path: metadataPath ?? undefined,
    p_torrent_name: normalized.torrent.torrentName ?? undefined,
    p_torrent_file_index: normalized.torrent.fileIndex,
    p_torrent_file_path: normalized.torrent.filePath,
    p_torrent_file_name: normalized.torrent.fileName,
    p_torrent_file_size: normalized.torrent.fileSize,
  };
}

async function canonicalizeTorrentInput(
  normalized: NormalizedMediaItemInput,
): Promise<NormalizedMediaItemInput> {
  if (normalized.sourceType !== "torrent" || normalized.torrent?.inputKind !== "torrent_file") {
    return normalized;
  }
  const metadataFile = normalized.torrent.metadataFile;
  if (!metadataFile) throw invalidInput("Choose and inspect a .torrent metadata file first.");
  const identity = await parseTorrentFileIdentity(new Uint8Array(await metadataFile.arrayBuffer()));
  if (!identity.magnetUri) throw invalidInput("The .torrent file did not contain enough metadata to build a Magnet URI.");
  return Object.freeze({
    ...normalized,
    torrent: Object.freeze({
      ...normalized.torrent,
      inputKind: "magnet" as const,
      magnetUri: identity.magnetUri,
      metadataFile: null,
    }),
  });
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
  const torrentMetadata = () => client.storage.from(TORRENT_METADATA_BUCKET);

  async function removeTorrentMetadata(path: string): Promise<void> {
    const cleanup = await torrentMetadata().remove([path]);
    if (cleanup.error) {
      throw new MediaQueueError(
        "metadata_cleanup_failed",
        "The media changed, but its old Torrent metadata could not be cleaned up.",
        { cause: cleanup.error },
      );
    }
  }

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
    const normalized = await canonicalizeTorrentInput(normalizeInput(input));
    const mediaId = crypto.randomUUID();
    const metadataPath = null;
    if (normalized.torrent?.inputKind === "magnet" && !normalized.torrent.magnetUri) {
      throw invalidInput("Enter and inspect a Magnet URI first.");
    }
    const args = mediaRpcArgs(roomId, mediaId, normalized, metadataPath);
    const result = normalized.localP2p
      ? await client.rpc("add_local_p2p_media_item", args as { p_room_id: string; p_media_id: string; p_title: string; p_info_hash: string; p_magnet_uri: string; p_file_name: string; p_file_size: number })
      : await client.rpc("add_media_item", normalized.torrent ? { ...args, p_media_id: mediaId } : args);
    const { data, error } = result;
    if (error && metadataPath) {
      const cleanup = await torrentMetadata().remove([metadataPath]);
      if (cleanup.error) {
        throw new MediaQueueError(
          "metadata_cleanup_failed",
          "The media was not added and its uploaded Torrent metadata could not be cleaned up.",
          { cause: error, databaseCode: error.code },
        );
      }
    }
    return unwrapSingle(data, error);
  }

  async function editMedia(
    roomId: string,
    mediaId: string,
    input: MediaItemInput,
  ): Promise<MediaItem> {
    validateId(roomId, "Room ID");
    validateId(mediaId, "Media ID");
    const normalized = await canonicalizeTorrentInput(normalizeInput(input));
    const existingResult = await client
      .from("media_items")
      .select("torrent_info_hash,torrent_input_kind,torrent_magnet_uri,torrent_metadata_path")
      .eq("room_id", roomId)
      .eq("id", mediaId)
      .maybeSingle();
    if (existingResult.error || !existingResult.data) {
      throw mapDatabaseError(existingResult.error ?? { code: "P0002" });
    }
    const existing = existingResult.data;
    const previousPath = existing.torrent_metadata_path;
    const effectiveNormalized = normalized.torrent?.inputKind === "magnet" &&
      !normalized.torrent.magnetUri &&
      existing.torrent_input_kind === "magnet" &&
      existing.torrent_info_hash === normalized.torrent.infoHash
        ? Object.freeze({
            ...normalized,
            torrent: Object.freeze({
              ...normalized.torrent,
              magnetUri: existing.torrent_magnet_uri,
            }),
          })
        : normalized;
    const metadataPath = null;
    const editArgs = {
      ...mediaRpcArgs(roomId, mediaId, effectiveNormalized, metadataPath),
      p_media_id: mediaId,
    };
    const result = effectiveNormalized.localP2p
      ? await client.rpc("edit_local_p2p_media_item", editArgs as { p_room_id: string; p_media_id: string; p_title: string; p_info_hash: string; p_magnet_uri: string; p_file_name: string; p_file_size: number })
      : await client.rpc("edit_media_item", editArgs);
    const { data, error } = result;
    const item = unwrapSingle(data, error);
    if (previousPath && previousPath !== item.torrent_metadata_path) {
      await removeTorrentMetadata(previousPath);
    }
    return item;
  }

  async function removeMedia(roomId: string, mediaId: string): Promise<MediaItem> {
    validateId(roomId, "Room ID");
    validateId(mediaId, "Media ID");
    const { data, error } = await client.rpc("remove_media_item", {
      p_room_id: roomId,
      p_media_id: mediaId,
    });
    const removed = unwrapSingle(data, error);
    if (removed.torrent_metadata_path) {
      await removeTorrentMetadata(removed.torrent_metadata_path);
    }
    return removed;
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
