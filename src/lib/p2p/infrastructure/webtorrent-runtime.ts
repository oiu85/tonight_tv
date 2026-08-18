"use client";

import type WebTorrent from "webtorrent";
import type { WebTorrentFile, WebTorrentTorrent } from "webtorrent";

import type { LocalP2pRuntime, LocalP2pRuntimeDependencies } from "../application/ports";
import {
  LOCAL_P2P_JOIN_TIMEOUT_MS,
  LOCAL_P2P_TRACKERS,
} from "../domain/constants";
import { LocalP2pError } from "../domain/errors";
import { LOCAL_P2P_RTC_CONFIG } from "../domain/ice";
import { magnetWithTrackers } from "../domain/magnet";
import { IDLE_LOCAL_P2P_STATE, type LocalP2pDescriptor, type LocalP2pState } from "../domain/types";
import { createBlobPlaybackRegistry } from "./blob-playback";
import { assertBrowserP2pSupport, validateLocalP2pDescriptor } from "./browser-guard";
import { registerLocalP2pServiceWorker } from "./service-worker";
import { createSignalMesh } from "./signal-mesh";
import { attachTorrentFile, pickTorrentFile, removeTorrent } from "./torrent-file";

export type { LocalP2pRuntime, LocalP2pRuntimeDependencies } from "../application/ports";
export { registerLocalP2pServiceWorker } from "./service-worker";

type StateListener = (state: LocalP2pState) => void;

const TORRENT_OPTIONS = Object.freeze({
  announce: LOCAL_P2P_TRACKERS,
  private: false,
  dht: false,
  lsd: true,
  utPex: true,
  destroyStoreOnDestroy: true,
});

export function createLocalP2pRuntime(dependencies: LocalP2pRuntimeDependencies = {}): LocalP2pRuntime {
  const loadWebTorrent = dependencies.loadWebTorrent ?? (async () => (
    await import("webtorrent/dist/webtorrent.min.js")
  ).default);
  const registerServiceWorker = dependencies.registerServiceWorker ?? registerLocalP2pServiceWorker;
  const loadSimplePeer = dependencies.loadSimplePeer ?? (async () => (
    await import("@thaunknown/simple-peer/lite.js")
  ).default);
  const metricIntervalMs = dependencies.metricIntervalMs ?? 1_000;
  const listeners = new Set<StateListener>();
  const torrents = new Map<string, WebTorrentTorrent>();
  const joinPromises = new Map<string, Promise<WebTorrentFile>>();
  const seedFiles = new Map<string, File>();
  const blobs = createBlobPlaybackRegistry();
  const mesh = createSignalMesh({ loadSimplePeer, rtcConfig: LOCAL_P2P_RTC_CONFIG });
  let state: LocalP2pState = IDLE_LOCAL_P2P_STATE;
  let client: WebTorrent | null = null;
  let initializePromise: Promise<void> | null = null;
  let metricsTimer: ReturnType<typeof setInterval> | null = null;
  let destroyed = false;

  const publish = (next: LocalP2pState) => {
    state = Object.freeze(next);
    for (const listener of listeners) listener(state);
  };
  const publishError = (error: LocalP2pError) => publish({ ...state, status: "error", error });
  const hostingFor = (infoHash: string | null) => Boolean(infoHash && seedFiles.has(infoHash));

  function track(torrent: WebTorrentTorrent, role: "seed" | "leech"): void {
    const infoHash = torrent.infoHash.toLowerCase();
    if (torrents.get(infoHash) === torrent) return;
    torrents.set(infoHash, torrent);
    mesh.bind(infoHash, torrent, role);
    let lastPeerCount = torrent.numPeers;
    let lastStatus = torrent.numPeers > 0 ? "ready" : role === "seed" ? "seeding" : "no_peers";
    let trailingTimer: ReturnType<typeof setTimeout> | null = null;
    const publishMetrics = () => {
      if (torrent.destroyed || !torrents.has(infoHash)) return;
      const nextStatus = torrent.numPeers > 0 ? "ready" : seedFiles.has(infoHash) ? "seeding" : "no_peers";
      lastPeerCount = torrent.numPeers;
      lastStatus = nextStatus;
      publish({
        status: nextStatus,
        infoHash,
        peerCount: torrent.numPeers,
        uploadSpeed: torrent.uploadSpeed,
        downloadSpeed: torrent.downloadSpeed,
        progress: torrent.progress,
        hosting: hostingFor(infoHash),
        error: null,
      });
    };
    const refresh = (immediate = false) => {
      if (torrent.destroyed || !torrents.has(infoHash)) return;
      const nextStatus = torrent.numPeers > 0 ? "ready" : seedFiles.has(infoHash) ? "seeding" : "no_peers";
      const statusChanged = nextStatus !== lastStatus || torrent.numPeers !== lastPeerCount;
      if (immediate || statusChanged) {
        if (trailingTimer !== null) {
          clearTimeout(trailingTimer);
          trailingTimer = null;
        }
        publishMetrics();
        return;
      }
      if (trailingTimer !== null) return;
      trailingTimer = setTimeout(() => {
        trailingTimer = null;
        publishMetrics();
      }, 500);
    };
    torrent.on("wire", () => refresh(true));
    torrent.on("download", () => refresh(false));
    torrent.on("upload", () => refresh(false));
    torrent.once("error", (cause) => publishError(new LocalP2pError("p2p_stream_failed", "The browser P2P stream failed.", { cause })));
  }

  async function initialize(): Promise<void> {
    if (destroyed) throw new LocalP2pError("p2p_stopped", "The P2P runtime has been stopped.");
    if (client) return;
    initializePromise ??= (async () => {
      assertBrowserP2pSupport();
      publish({ ...IDLE_LOCAL_P2P_STATE, status: "preparing" });
      try {
        const [WebTorrentClass, registration] = await Promise.all([loadWebTorrent(), registerServiceWorker()]);
        if (destroyed) return;
        client = new WebTorrentClass({
          tracker: { announce: [...LOCAL_P2P_TRACKERS], rtcConfig: LOCAL_P2P_RTC_CONFIG },
          dht: false,
          lsd: true,
          utPex: true,
        });
        client.createServer({ controller: registration });
        metricsTimer = setInterval(() => {
          const torrent = state.infoHash ? torrents.get(state.infoHash) : null;
          if (!torrent || torrent.destroyed) return;
          publish({
            ...state,
            status: torrent.numPeers > 0 ? "ready" : seedFiles.has(torrent.infoHash.toLowerCase()) ? "seeding" : "no_peers",
            peerCount: torrent.numPeers,
            uploadSpeed: torrent.uploadSpeed,
            downloadSpeed: torrent.downloadSpeed,
            progress: torrent.progress,
            hosting: hostingFor(torrent.infoHash.toLowerCase()),
          });
        }, metricIntervalMs);
        publish(IDLE_LOCAL_P2P_STATE);
      } catch (cause) {
        const error = cause instanceof LocalP2pError
          ? cause
          : new LocalP2pError("p2p_initialization_failed", "The browser P2P runtime could not be initialized.", { cause });
        publishError(error);
        throw error;
      }
    })().finally(() => {
      initializePromise = null;
    });
    return initializePromise;
  }

  async function seedLocalFile(file: File): Promise<LocalP2pDescriptor> {
    if (!(file instanceof File) || file.size <= 0) {
      throw new LocalP2pError("p2p_invalid_file", "Choose a non-empty video file from this device.");
    }
    await initialize();
    if (!client) throw new LocalP2pError("p2p_initialization_failed", "The P2P runtime is unavailable.");
    publish({ ...IDLE_LOCAL_P2P_STATE, status: "hashing" });
    return new Promise((resolve, reject) => {
      try {
        const torrent = client!.seed(file, { ...TORRENT_OPTIONS, name: file.name }, (seeded) => {
          const infoHash = seeded.infoHash.toLowerCase();
          seedFiles.set(infoHash, file);
          track(seeded, "seed");
          publish({ ...IDLE_LOCAL_P2P_STATE, status: "seeding", infoHash, hosting: true });
          resolve(Object.freeze({
            infoHash,
            magnetUri: magnetWithTrackers(seeded.magnetURI),
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || null,
          }));
        });
        torrent.once("error", (cause) => {
          const error = new LocalP2pError("p2p_seed_failed", "The browser could not create the P2P stream.", { cause });
          publishError(error);
          reject(error);
        });
      } catch (cause) {
        const error = new LocalP2pError("p2p_seed_failed", "The browser could not create the P2P stream.", { cause });
        publishError(error);
        reject(error);
      }
    });
  }

  async function joinLocalStream(descriptor: LocalP2pDescriptor): Promise<WebTorrentFile> {
    validateLocalP2pDescriptor(descriptor);
    await initialize();
    if (!client) throw new LocalP2pError("p2p_initialization_failed", "The P2P runtime is unavailable.");
    const existing = torrents.get(descriptor.infoHash);
    if (existing) {
      const file = pickTorrentFile(existing, descriptor);
      if (file) return file;
    }
    const pending = joinPromises.get(descriptor.infoHash);
    if (pending) return pending;
    publish({ ...IDLE_LOCAL_P2P_STATE, status: "connecting", infoHash: descriptor.infoHash, hosting: false });
    const pendingJoin = new Promise<WebTorrentFile>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(joinTimeout);
        callback();
      };
      const fail = (error: LocalP2pError) => {
        publishError(error);
        const torrent = torrents.get(descriptor.infoHash);
        if (torrent && client && !seedFiles.has(descriptor.infoHash)) {
          torrents.delete(descriptor.infoHash);
          mesh.unbind(descriptor.infoHash);
          void removeTorrent(client, torrent).catch(() => undefined);
        }
        finish(() => reject(error));
      };
      const joinTimeout = setTimeout(() => {
        fail(new LocalP2pError(
          "p2p_join_failed",
          "No peer could provide this device stream within 45 seconds. Keep the original hosting tab open and try again.",
        ));
      }, LOCAL_P2P_JOIN_TIMEOUT_MS);
      try {
        const torrent = client!.add(magnetWithTrackers(descriptor.magnetUri), TORRENT_OPTIONS, (joined) => {
          if (settled) return;
          const file = pickTorrentFile(joined, descriptor);
          if (!file) {
            fail(new LocalP2pError("p2p_invalid_descriptor", "The P2P source did not contain the expected video file."));
            return;
          }
          file.select?.(1);
          publish({
            ...IDLE_LOCAL_P2P_STATE,
            status: joined.numPeers > 0 ? "ready" : "no_peers",
            infoHash: joined.infoHash.toLowerCase(),
            peerCount: joined.numPeers,
            hosting: false,
          });
          finish(() => resolve(file));
        });
        track(torrent, "leech");
        torrent.once("error", (cause) => {
          fail(new LocalP2pError("p2p_join_failed", "The browser could not join the device stream.", { cause }));
        });
      } catch (cause) {
        fail(new LocalP2pError("p2p_join_failed", "The browser could not join the device stream.", { cause }));
      }
    }).finally(() => {
      joinPromises.delete(descriptor.infoHash);
    });
    joinPromises.set(descriptor.infoHash, pendingJoin);
    return pendingJoin;
  }

  async function attachToMediaElement(descriptor: LocalP2pDescriptor, element: HTMLMediaElement): Promise<void> {
    const localFile = seedFiles.get(descriptor.infoHash);
    if (localFile) {
      blobs.attach(localFile, element);
      return;
    }
    blobs.detach(element);
    const file = await joinLocalStream(descriptor);
    try {
      attachTorrentFile(file, element);
    } catch (cause) {
      const error = new LocalP2pError(
        "p2p_stream_failed",
        "The P2P video stream could not be attached to the player.",
        { cause },
      );
      publishError(error);
      throw error;
    }
  }

  async function leaveLocalStream(infoHash: string): Promise<void> {
    const normalized = infoHash.toLowerCase();
    joinPromises.delete(normalized);
    mesh.unbind(normalized);
    seedFiles.delete(normalized);
    blobs.detachAll();
    const torrent = torrents.get(normalized);
    if (!torrent || !client) {
      publish({ ...IDLE_LOCAL_P2P_STATE, status: "stopped" });
      return;
    }
    torrents.delete(normalized);
    await removeTorrent(client, torrent);
    publish({ ...IDLE_LOCAL_P2P_STATE, status: "stopped" });
  }

  async function destroy(): Promise<void> {
    if (destroyed) return;
    destroyed = true;
    if (metricsTimer !== null) clearInterval(metricsTimer);
    metricsTimer = null;
    mesh.destroy();
    blobs.detachAll();
    joinPromises.clear();
    torrents.clear();
    seedFiles.clear();
    const activeClient = client;
    client = null;
    if (activeClient && !activeClient.destroyed) {
      await new Promise<void>((resolve, reject) => {
        activeClient.destroy((error) => error ? reject(error) : resolve());
      });
    }
    publish({ ...IDLE_LOCAL_P2P_STATE, status: "stopped" });
    listeners.clear();
  }

  return Object.freeze({
    initialize,
    seedLocalFile,
    joinLocalStream,
    attachToMediaElement,
    leaveLocalStream,
    hasLocalSeed: (infoHash: string) => seedFiles.has(infoHash.toLowerCase()),
    setSignalTransport: (transport) => mesh.setTransport(transport),
    getState: () => state,
    subscribe: (listener: StateListener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    destroy,
  });
}

let browserRuntime: LocalP2pRuntime | null = null;

export function getBrowserLocalP2pRuntime(): LocalP2pRuntime {
  if (typeof window === "undefined") {
    throw new LocalP2pError("p2p_unsupported", "The P2P runtime is available only in a browser.");
  }
  browserRuntime ??= createLocalP2pRuntime();
  return browserRuntime;
}

export async function destroyBrowserLocalP2pRuntime(): Promise<void> {
  const runtime = browserRuntime;
  browserRuntime = null;
  if (runtime) await runtime.destroy();
}
