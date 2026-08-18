import type WebTorrent from "webtorrent";
import type { WebTorrentFile, WebTorrentTorrent } from "webtorrent";

import type { LocalP2pDescriptor } from "../domain/types";
import { prepareVideoElement } from "./browser-guard";

export function pickTorrentFile(
  torrent: WebTorrentTorrent,
  descriptor: LocalP2pDescriptor,
): WebTorrentFile | null {
  const files = [...(torrent.files ?? [])];
  if (files.length === 0) return null;
  const named = files.find((candidate) => candidate.name === descriptor.fileName);
  if (named) {
    if (
      files.length > 1 &&
      named.length > 0 &&
      descriptor.fileSize > 0 &&
      named.length !== descriptor.fileSize
    ) {
      return null;
    }
    return named;
  }
  return files[0] ?? null;
}

function readStreamURL(file: WebTorrentFile): string | null {
  try {
    const url = file.streamURL;
    return typeof url === "string" && url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

export function attachTorrentFile(file: WebTorrentFile, element: HTMLMediaElement): void {
  file.select?.(1);
  prepareVideoElement(element);
  const streamURL = readStreamURL(file);
  if (streamURL) {
    element.src = streamURL;
    return;
  }
  file.streamTo(element);
}

export function removeTorrent(client: WebTorrent, torrent: WebTorrentTorrent): Promise<void> {
  if (torrent.destroyed) return Promise.resolve();
  return new Promise((resolve, reject) => {
    client.remove(torrent, { destroyStore: true }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
