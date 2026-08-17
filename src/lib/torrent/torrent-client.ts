"use client";

import parseTorrent from "parse-torrent";

import { loadWebtorSdk } from "../media/webtor-media-adapter";
import type {
  TorrentErrorCategory,
  TorrentInspection,
} from "./torrent-contracts";
import { classifyTorrentFile, parseMagnetIdentity, parseTorrentFileIdentity } from "./torrent-manifest";

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

type WebtorFile = Readonly<{ index?: unknown; id?: unknown; path?: unknown; name?: unknown; length?: unknown; size?: unknown }>;

function normalizeWebtorFiles(value: unknown) {
  const files = Array.isArray(value) ? value : [];
  return files.map((raw, fallbackIndex) => {
    const file = raw as WebtorFile;
    const path = String(file.path ?? file.name ?? "");
    return classifyTorrentFile({
      index: Number.isInteger(Number(file.index ?? file.id)) ? Number(file.index ?? file.id) : fallbackIndex,
      path,
      name: typeof file.name === "string" ? file.name : null,
      sizeBytes: Math.max(0, Number(file.length ?? file.size ?? 0)),
    });
  });
}

async function inspectMagnet(magnetUri: string, signal?: AbortSignal): Promise<TorrentInspection> {
  const identity = await parseMagnetIdentity(magnetUri);
  const mount = document.createElement("div");
  mount.hidden = true;
  document.body.appendChild(mount);
  const sdk = await loadWebtorSdk();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(() => reject(new TorrentClientError("torrent_metadata_timeout", "Torrent metadata is taking longer than expected.", 504))), 90_000);
    const abort = () => finish(() => reject(new DOMException("Torrent inspection was cancelled.", "AbortError")));
    const finish = (settle: () => void) => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      mount.replaceChildren();
      mount.remove();
      settle();
    };
    signal?.addEventListener("abort", abort, { once: true });
    sdk.push({
      el: mount,
      magnet: magnetUri,
      baseUrl: "https://webtor.io",
      header: false,
      controls: false,
      features: { subtitles: false, volume: false },
      on: (event) => {
        if (event.name === sdk.TORRENT_ERROR) {
          finish(() => reject(new TorrentClientError("torrent_metadata_unavailable", "Webtor could not fetch this Torrent metadata.", 502)));
        }
        if (event.name === sdk.TORRENT_FETCHED) {
          const data = event.data as { files?: unknown; name?: unknown } | undefined;
          const files = normalizeWebtorFiles(data?.files);
          finish(() => resolve(Object.freeze({
            infoHash: identity.infoHash,
            torrentName: typeof data?.name === "string" ? data.name : identity.name,
            status: "ready" as const,
            files: Object.freeze(files),
            totalFiles: files.length,
            truncated: false,
          })));
        }
      },
    });
  });
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
  return Object.freeze({ infoHash: identity.infoHash, torrentName: identity.name, status: "ready", files: Object.freeze(files), totalFiles: files.length, truncated: false });
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
