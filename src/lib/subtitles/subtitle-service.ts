"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "../supabase/browser";
import type { Database } from "../supabase/database.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SRT_TIMESTAMP_PATTERN =
  /^(\d{2,}):(\d{2}):(\d{2}),(\d{3})\s+-->\s+(\d{2,}):(\d{2}):(\d{2}),(\d{3})(.*)$/;
const VTT_TIMESTAMP_PATTERN =
  /^(\d{2,}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2,}):(\d{2}):(\d{2})\.(\d{3})(.*)$/;

export const SUBTITLE_BUCKET = "subtitles";
export const SUBTITLE_MAX_BYTES = 1024 * 1024;

export type SubtitleMetadata = Readonly<
  Database["public"]["Tables"]["subtitles"]["Row"]
>;

export type SubtitleServiceErrorCode =
  | "invalid_input"
  | "permission_denied"
  | "upload_failed"
  | "download_failed"
  | "metadata_failed"
  | "delete_failed"
  | "cleanup_failed"
  | "restore_failed"
  | "invalid_response";

export class SubtitleServiceError extends Error {
  readonly code: SubtitleServiceErrorCode;
  readonly databaseCode?: string;

  constructor(
    code: SubtitleServiceErrorCode,
    message: string,
    options?: ErrorOptions & { databaseCode?: string },
  ) {
    super(message, options);
    this.name = "SubtitleServiceError";
    this.code = code;
    this.databaseCode = options?.databaseCode;
  }
}

export type UploadSubtitleInput = Readonly<{
  roomId: string;
  mediaId: string;
  label: string;
  languageCode?: string | null;
  fileName: string;
  text: string;
}>;

export type SubtitleService = Readonly<{
  uploadSubtitle: (input: UploadSubtitleInput) => Promise<SubtitleMetadata>;
  deleteSubtitle: (subtitle: SubtitleMetadata) => Promise<void>;
  downloadSubtitle: (subtitle: SubtitleMetadata) => Promise<Blob>;
}>;

type DatabaseError = Readonly<{
  code?: string;
  message?: string;
}>;

function normalizeNewlines(value: string): string {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function validateTimestampParts(parts: readonly string[]): void {
  const minutes = Number(parts[1]);
  const seconds = Number(parts[2]);
  if (minutes > 59 || seconds > 59) {
    throw new SubtitleServiceError(
      "invalid_input",
      "Subtitle timestamps must use valid minute and second values.",
    );
  }
}

function convertSrtTimeline(line: string): string {
  const match = SRT_TIMESTAMP_PATTERN.exec(line.trim());
  if (!match) {
    throw new SubtitleServiceError(
      "invalid_input",
      "The SRT subtitle contains an invalid cue timestamp.",
    );
  }

  validateTimestampParts(match.slice(1, 4));
  validateTimestampParts(match.slice(5, 8));
  return `${match[1]}:${match[2]}:${match[3]}.${match[4]} --> ${match[5]}:${match[6]}:${match[7]}.${match[8]}${match[9]}`;
}

export function convertSrtToVtt(input: string): string {
  const normalized = normalizeNewlines(input).trim();
  if (!normalized) {
    throw new SubtitleServiceError("invalid_input", "The subtitle file is empty.");
  }

  const cues: string[] = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.split("\n");
    if (/^\d+$/.test(lines[0]?.trim() ?? "")) {
      lines.shift();
    }

    const timeline = lines.shift();
    if (!timeline || lines.length === 0) {
      throw new SubtitleServiceError(
        "invalid_input",
        "Every SRT cue must contain a timestamp and cue text.",
      );
    }

    cues.push(`${convertSrtTimeline(timeline)}\n${lines.join("\n")}`);
  }

  if (cues.length === 0) {
    throw new SubtitleServiceError(
      "invalid_input",
      "The SRT subtitle does not contain any cues.",
    );
  }

  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

function normalizeVtt(input: string): string {
  const normalized = normalizeNewlines(input).trim();
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "WEBVTT") {
    throw new SubtitleServiceError(
      "invalid_input",
      "WebVTT subtitles must begin with a WEBVTT header.",
    );
  }

  const timeline = lines.find((line) => line.includes("-->"));
  const match = timeline ? VTT_TIMESTAMP_PATTERN.exec(timeline.trim()) : null;
  if (!match) {
    throw new SubtitleServiceError(
      "invalid_input",
      "The WebVTT subtitle does not contain a valid cue timestamp.",
    );
  }
  validateTimestampParts(match.slice(1, 4));
  validateTimestampParts(match.slice(5, 8));

  return `${normalized}\n`;
}

export function normalizeSubtitleText(fileName: string, input: string): string {
  const extension = fileName.trim().toLowerCase().split(".").pop();
  if (extension === "srt") {
    return convertSrtToVtt(input);
  }
  if (extension === "vtt") {
    return normalizeVtt(input);
  }
  throw new SubtitleServiceError(
    "invalid_input",
    "Subtitle files must use the .srt or .vtt extension.",
  );
}

export function subtitleStoragePath(
  roomId: string,
  mediaId: string,
  subtitleId: string,
): string {
  if (![roomId, mediaId, subtitleId].every((value) => UUID_PATTERN.test(value))) {
    throw new SubtitleServiceError(
      "invalid_input",
      "Room, media, and subtitle IDs must be valid UUIDs.",
    );
  }
  return `rooms/${roomId}/media/${mediaId}/${subtitleId}.vtt`;
}

function textLength(value: string): number {
  return Array.from(value).length;
}

function normalizeUploadInput(input: UploadSubtitleInput): Readonly<{
  label: string;
  languageCode: string | null;
  vtt: string;
}> {
  if (!UUID_PATTERN.test(input.roomId) || !UUID_PATTERN.test(input.mediaId)) {
    throw new SubtitleServiceError(
      "invalid_input",
      "Room and media IDs must be valid UUIDs.",
    );
  }

  const label = input.label.trim();
  const languageCode = input.languageCode?.trim() || null;
  if (textLength(label) < 1 || textLength(label) > 100) {
    throw new SubtitleServiceError(
      "invalid_input",
      "Subtitle label must contain between 1 and 100 characters.",
    );
  }
  if (languageCode && textLength(languageCode) > 35) {
    throw new SubtitleServiceError(
      "invalid_input",
      "Subtitle language code cannot exceed 35 characters.",
    );
  }

  const vtt = normalizeSubtitleText(input.fileName, input.text);
  if (new TextEncoder().encode(vtt).byteLength > SUBTITLE_MAX_BYTES) {
    throw new SubtitleServiceError(
      "invalid_input",
      "Subtitle files cannot exceed 1 MiB after conversion.",
    );
  }
  return Object.freeze({ label, languageCode, vtt });
}

function mapDatabaseError(error: DatabaseError): SubtitleServiceError {
  const code = error.code === "42501" ? "permission_denied" : "metadata_failed";
  return new SubtitleServiceError(
    code,
    code === "permission_denied"
      ? "Room ownership is required for this subtitle operation."
      : "Unable to persist subtitle metadata.",
    { cause: error, databaseCode: error.code },
  );
}

function isSubtitleMetadata(value: unknown): value is SubtitleMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.room_id === "string" &&
    typeof row.media_id === "string" &&
    typeof row.label === "string" &&
    (row.language_code === null || typeof row.language_code === "string") &&
    typeof row.storage_path === "string" &&
    row.format === "vtt" &&
    typeof row.created_by === "string" &&
    typeof row.created_at === "string"
  );
}

export function createSubtitleService(
  client: SupabaseClient<Database>,
): SubtitleService {
  const bucket = client.storage.from(SUBTITLE_BUCKET);

  async function downloadSubtitle(subtitle: SubtitleMetadata): Promise<Blob> {
    const { data, error } = await bucket.download(subtitle.storage_path);
    if (error || !(data instanceof Blob)) {
      throw new SubtitleServiceError(
        "download_failed",
        "Unable to download the private subtitle file.",
        { cause: error ?? undefined },
      );
    }
    return data;
  }

  async function uploadSubtitle(
    input: UploadSubtitleInput,
  ): Promise<SubtitleMetadata> {
    const normalized = normalizeUploadInput(input);
    const subtitleId = crypto.randomUUID();
    const storagePath = subtitleStoragePath(input.roomId, input.mediaId, subtitleId);
    const blob = new Blob([normalized.vtt], { type: "text/vtt;charset=utf-8" });
    const upload = await bucket.upload(storagePath, blob, {
      contentType: "text/vtt",
      upsert: false,
    });
    if (upload.error) {
      throw new SubtitleServiceError(
        "upload_failed",
        "Unable to upload the private subtitle file.",
        { cause: upload.error },
      );
    }

    const metadata = await client.rpc("create_subtitle_metadata", {
      p_room_id: input.roomId,
      p_media_id: input.mediaId,
      p_subtitle_id: subtitleId,
      p_label: normalized.label,
      p_language_code: normalized.languageCode ?? undefined,
    });
    if (metadata.error) {
      const cleanup = await bucket.remove([storagePath]);
      if (cleanup.error) {
        throw new SubtitleServiceError(
          "cleanup_failed",
          "Subtitle metadata failed and the uploaded object could not be cleaned up.",
          { cause: metadata.error, databaseCode: metadata.error.code },
        );
      }
      throw mapDatabaseError(metadata.error);
    }

    if (!metadata.data || metadata.data.length !== 1) {
      throw new SubtitleServiceError(
        "invalid_response",
        "Supabase returned an invalid subtitle metadata response.",
      );
    }

    const subtitle = metadata.data[0];
    if (
      !isSubtitleMetadata(subtitle) ||
      subtitle.id !== subtitleId ||
      subtitle.storage_path !== storagePath
    ) {
      throw new SubtitleServiceError(
        "invalid_response",
        "Supabase returned inconsistent subtitle metadata.",
      );
    }
    return Object.freeze(subtitle);
  }

  async function deleteSubtitle(subtitle: SubtitleMetadata): Promise<void> {
    const backup = await downloadSubtitle(subtitle);
    const objectDelete = await bucket.remove([subtitle.storage_path]);
    if (objectDelete.error) {
      throw new SubtitleServiceError(
        "delete_failed",
        "Unable to delete the private subtitle object.",
        { cause: objectDelete.error },
      );
    }

    const metadataDelete = await client.rpc("delete_subtitle_metadata", {
      p_room_id: subtitle.room_id,
      p_subtitle_id: subtitle.id,
    });
    if (metadataDelete.error) {
      const restore = await bucket.upload(subtitle.storage_path, backup, {
        contentType: "text/vtt",
        upsert: false,
      });
      if (restore.error) {
        throw new SubtitleServiceError(
          "restore_failed",
          "Subtitle metadata deletion failed and the removed object could not be restored.",
          { cause: metadataDelete.error, databaseCode: metadataDelete.error.code },
        );
      }
      throw mapDatabaseError(metadataDelete.error);
    }

    if (!metadataDelete.data || metadataDelete.data.length !== 1) {
      throw new SubtitleServiceError(
        "invalid_response",
        "Supabase returned an invalid subtitle deletion response.",
      );
    }
  }

  return Object.freeze({ uploadSubtitle, deleteSubtitle, downloadSubtitle });
}

export type HtmlSubtitleRuntime = Readonly<{
  select: (subtitle: SubtitleMetadata) => Promise<void>;
  disable: () => void;
  getSelectedSubtitleId: () => string | null;
  destroy: () => void;
}>;

export function createHtmlSubtitleRuntime(
  mediaElement: HTMLMediaElement,
  service: Pick<SubtitleService, "downloadSubtitle">,
  objectUrl: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL,
): HtmlSubtitleRuntime {
  let activeTrack: HTMLTrackElement | null = null;
  let activeObjectUrl: string | null = null;
  let selectedSubtitleId: string | null = null;

  function disable(): void {
    activeTrack?.remove();
    activeTrack = null;
    if (activeObjectUrl) {
      objectUrl.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
    selectedSubtitleId = null;
  }

  async function select(subtitle: SubtitleMetadata): Promise<void> {
    const blob = await service.downloadSubtitle(subtitle);
    const nextObjectUrl = objectUrl.createObjectURL(blob);
    const nextTrack = document.createElement("track");
    nextTrack.kind = "subtitles";
    nextTrack.label = subtitle.label;
    nextTrack.srclang = subtitle.language_code ?? "und";
    nextTrack.src = nextObjectUrl;
    nextTrack.default = true;

    disable();
    mediaElement.append(nextTrack);
    nextTrack.track.mode = "showing";
    activeTrack = nextTrack;
    activeObjectUrl = nextObjectUrl;
    selectedSubtitleId = subtitle.id;
  }

  return Object.freeze({
    select,
    disable,
    getSelectedSubtitleId: () => selectedSubtitleId,
    destroy: disable,
  });
}

let browserSubtitleService: SubtitleService | undefined;

export function getBrowserSubtitleService(): SubtitleService {
  browserSubtitleService ??= createSubtitleService(createBrowserSupabaseClient());
  return browserSubtitleService;
}
