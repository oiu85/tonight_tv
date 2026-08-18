"use client";

import parseTorrent from "parse-torrent";

import type {
  TorrentErrorCategory,
  TorrentInspection,
} from "./torrent-contracts";
import {
  classifyTorrentFile,
  inspectionFromMagnetIdentity,
  parseMagnetIdentity,
  parseTorrentFileIdentity,
} from "./torrent-manifest";

export class TorrentClientError extends Error {
  readonly category: TorrentErrorCategory;
  readonly status: number;

  constructor(category: TorrentErrorCategory, message: string, status: number) {
    super(message);
    this.name = "TorrentClientError";
    this.category = category;
    this.status = status;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as { error?: { category?: TorrentErrorCategory; message?: string } } | T | null;
  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload ? payload.error : undefined;
    throw new TorrentClientError(
      error?.category ?? "unknown_torrent_error",
      error?.message ?? "The Torrent request could not be completed.",
      response.status,
    );
  }
  return payload as T;
}

async function inspectMagnet(magnetUri: string, signal?: AbortSignal): Promise<TorrentInspection> {
  const identity = await parseMagnetIdentity(magnetUri);
  if (signal?.aborted) throw new DOMException("Torrent inspection was cancelled.", "AbortError");
  return inspectionFromMagnetIdentity(identity);
}

export async function inspectTorrent(
  _roomId: string,
  input: Readonly<{ kind: "magnet"; magnetUri: string } | { kind: "torrent_file"; file: File }>,
  signal?: AbortSignal,
): Promise<TorrentInspection> {
  if (input.kind === "magnet") return inspectMagnet(input.magnetUri, signal);
  if (!input.file) throw new TorrentClientError("invalid_torrent", "Choose a .torrent file first.", 400);
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const identity = await parseTorrentFileIdentity(bytes);
  const parsed = await parseTorrent(bytes);
  const files = (parsed.files ?? []).map((file, index) => classifyTorrentFile({
    index,
    path: file.path,
    name: file.name,
    sizeBytes: file.length,
  }));
  return Object.freeze({
    infoHash: identity.infoHash,
    torrentName: identity.name,
    status: "ready",
    files: Object.freeze(files),
    totalFiles: files.length,
    truncated: false,
    magnetUri: identity.magnetUri,
  });
}

export async function fetchTorrentSubtitle(
  roomId: string,
  mediaId: string,
  file: Readonly<{ index: number; path: string }>,
): Promise<Readonly<{ name: string; text: string }>> {
  return parseResponse(await fetch(`/api/rooms/${encodeURIComponent(roomId)}/media/${encodeURIComponent(mediaId)}/torrent-subtitle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(file),
  }));
}
