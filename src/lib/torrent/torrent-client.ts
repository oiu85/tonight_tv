"use client";

import type {
  ResolvedTorrentPlaybackSource,
  TorrentErrorCategory,
  TorrentInspection,
} from "./torrent-contracts";

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

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Torrent inspection was cancelled.", "AbortError"));
    }, { once: true });
  });
}

async function waitForTorrentManifest(
  roomId: string,
  initial: TorrentInspection,
  signal?: AbortSignal,
): Promise<TorrentInspection> {
  if (initial.status === "ready") return initial;
  const deadline = Date.now() + 90_000;
  let delayMs = 1_250;
  while (Date.now() < deadline) {
    await abortableDelay(delayMs, signal);
    const response = await fetch(
      `/api/torrents/status/${encodeURIComponent(initial.infoHash)}?roomId=${encodeURIComponent(roomId)}`,
      { signal, cache: "no-store" },
    );
    const status = await parseResponse<TorrentInspection | Readonly<{
      status: TorrentInspection["status"];
      errorCategory: TorrentErrorCategory | null;
    }>>(response);
    if ("files" in status && status.status === "ready") return status;
    if (!("files" in status) && status.status === "error") {
      throw new TorrentClientError(
        status.errorCategory ?? "torrent_metadata_unavailable",
        "Torrent metadata could not be retrieved from the swarm.",
        504,
      );
    }
    delayMs = Math.min(Math.round(delayMs * 1.5), 5_000);
  }
  throw new TorrentClientError(
    "torrent_metadata_timeout",
    "Torrent metadata is taking longer than expected. Try again when peers are available.",
    504,
  );
}

export async function inspectTorrent(
  roomId: string,
  input: Readonly<{ kind: "magnet"; magnetUri: string } | { kind: "torrent_file"; file: File }>,
  signal?: AbortSignal,
): Promise<TorrentInspection> {
  const request = input.kind === "magnet"
    ? fetch("/api/torrents/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, magnetUri: input.magnetUri }),
        signal,
      })
    : (() => {
        const form = new FormData();
        form.set("roomId", roomId);
        form.set("torrent", input.file);
        return fetch("/api/torrents/inspect", { method: "POST", body: form, signal });
      })();
  return waitForTorrentManifest(
    roomId,
    await parseResponse<TorrentInspection>(await request),
    signal,
  );
}

export async function resolveTorrentPlaybackSource(
  roomId: string,
  mediaId: string,
  signal?: AbortSignal,
): Promise<ResolvedTorrentPlaybackSource> {
  const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/media/${encodeURIComponent(mediaId)}/playback-source`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
  });
  return parseResponse<ResolvedTorrentPlaybackSource>(response);
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
