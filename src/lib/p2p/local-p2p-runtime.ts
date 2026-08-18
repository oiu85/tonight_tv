"use client";

import type WebTorrent from "webtorrent";
import type { WebTorrentFile, WebTorrentTorrent } from "webtorrent";

import {
  LOCAL_P2P_SERVICE_WORKER_SCOPE,
  LOCAL_P2P_SERVICE_WORKER_URL,
  LOCAL_P2P_TRACKERS,
  LocalP2pError,
  type LocalP2pDescriptor,
  type LocalP2pState,
} from "./local-p2p-contracts";

type WebTorrentConstructor = typeof WebTorrent;
type StateListener = (state: LocalP2pState) => void;
export type LocalP2pRuntimeDependencies = Readonly<{
  loadWebTorrent?: () => Promise<WebTorrentConstructor>;
  registerServiceWorker?: () => Promise<ServiceWorkerRegistration>;
  metricIntervalMs?: number;
}>;
export type LocalP2pRuntime = Readonly<{
  initialize: () => Promise<void>;
  seedLocalFile: (file: File) => Promise<LocalP2pDescriptor>;
  joinLocalStream: (descriptor: LocalP2pDescriptor) => Promise<WebTorrentFile>;
  attachToMediaElement: (descriptor: LocalP2pDescriptor, element: HTMLMediaElement) => Promise<void>;
  leaveLocalStream: (infoHash: string) => Promise<void>;
  hasLocalSeed: (infoHash: string) => boolean;
  getState: () => LocalP2pState;
  subscribe: (listener: StateListener) => () => void;
  destroy: () => Promise<void>;
}>;

const IDLE_STATE: LocalP2pState = Object.freeze({ status: "idle", infoHash: null, peerCount: 0, uploadSpeed: 0, downloadSpeed: 0, progress: 0, error: null });
const LOCAL_P2P_JOIN_TIMEOUT_MS = 30_000;
let serviceWorkerPromise: Promise<ServiceWorkerRegistration> | null = null;

function waitForActivated(registration: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  if (registration.active?.state === "activated") return Promise.resolve(registration);
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) return Promise.reject(new LocalP2pError("p2p_service_worker_unavailable", "The P2P streaming Service Worker could not be activated."));
  return new Promise((resolve, reject) => {
    const onStateChange = () => {
      if (worker.state === "activated") { worker.removeEventListener("statechange", onStateChange); resolve(registration); }
      else if (worker.state === "redundant") { worker.removeEventListener("statechange", onStateChange); reject(new LocalP2pError("p2p_service_worker_unavailable", "The P2P streaming Service Worker became unavailable.")); }
    };
    worker.addEventListener("statechange", onStateChange);
  });
}

export function registerLocalP2pServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) {
    return Promise.reject(new LocalP2pError("p2p_service_worker_unavailable", "This browser cannot provide the secure Service Worker required for P2P streaming."));
  }
  serviceWorkerPromise ??= navigator.serviceWorker.register(LOCAL_P2P_SERVICE_WORKER_URL, { scope: LOCAL_P2P_SERVICE_WORKER_SCOPE }).then(waitForActivated).catch((cause) => {
    serviceWorkerPromise = null;
    throw cause instanceof LocalP2pError ? cause : new LocalP2pError("p2p_service_worker_unavailable", "The P2P streaming Service Worker could not be registered.", { cause });
  });
  return serviceWorkerPromise;
}

function assertBrowserSupport(): void {
  if (typeof window === "undefined" || typeof File === "undefined" || typeof RTCPeerConnection === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) {
    throw new LocalP2pError("p2p_unsupported", "Stream from Device is not supported by this browser.");
  }
}
function validateDescriptor(descriptor: LocalP2pDescriptor): void {
  if (!/^[a-f0-9]{40}$/.test(descriptor.infoHash) || !descriptor.magnetUri.startsWith("magnet:?") || descriptor.magnetUri.length > 16_384 || descriptor.fileName.length < 1 || descriptor.fileName.length > 255 || descriptor.fileSize <= 0) {
    throw new LocalP2pError("p2p_invalid_descriptor", "The local P2P source descriptor is invalid.");
  }
}
function removeTorrent(client: WebTorrent, torrent: WebTorrentTorrent): Promise<void> {
  if (torrent.destroyed) return Promise.resolve();
  return new Promise((resolve, reject) => client.remove(torrent, { destroyStore: true }, (error) => error ? reject(error) : resolve()));
}

export function createLocalP2pRuntime(dependencies: LocalP2pRuntimeDependencies = {}): LocalP2pRuntime {
  const loadWebTorrent = dependencies.loadWebTorrent ?? (async () => (
    await import("webtorrent/dist/webtorrent.min.js")
  ).default);
  const registerServiceWorker = dependencies.registerServiceWorker ?? registerLocalP2pServiceWorker;
  const metricIntervalMs = dependencies.metricIntervalMs ?? 1_000;
  const listeners = new Set<StateListener>();
  const torrents = new Map<string, WebTorrentTorrent>();
  const joinPromises = new Map<string, Promise<WebTorrentFile>>();
  const noPeerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const localSeeds = new Set<string>();
  let state = IDLE_STATE;
  let client: WebTorrent | null = null;
  let initializePromise: Promise<void> | null = null;
  let metricsTimer: ReturnType<typeof setInterval> | null = null;
  let destroyed = false;
  const publish = (next: LocalP2pState) => { state = Object.freeze(next); for (const listener of listeners) listener(state); };
  const publishError = (error: LocalP2pError) => publish({ ...state, status: "error", error });
  function track(torrent: WebTorrentTorrent): void {
    const infoHash = torrent.infoHash.toLowerCase();
    if (torrents.get(infoHash) === torrent) return;
    torrents.set(infoHash, torrent);
    const refresh = () => {
      if (torrent.destroyed || !torrents.has(infoHash)) return;
      publish({ status: torrent.numPeers > 0 ? "ready" : localSeeds.has(infoHash) ? "seeding" : "no_peers", infoHash, peerCount: torrent.numPeers, uploadSpeed: torrent.uploadSpeed, downloadSpeed: torrent.downloadSpeed, progress: torrent.progress, error: null });
    };
    torrent.on("wire", refresh); torrent.on("download", refresh); torrent.on("upload", refresh);
    torrent.once("error", (cause) => publishError(new LocalP2pError("p2p_stream_failed", "The browser P2P stream failed.", { cause })));
  }
  async function initialize(): Promise<void> {
    if (destroyed) throw new LocalP2pError("p2p_stopped", "The P2P runtime has been stopped.");
    if (client) return;
    initializePromise ??= (async () => {
      assertBrowserSupport(); publish({ ...IDLE_STATE, status: "preparing" });
      try {
        const [WebTorrentClass, registration] = await Promise.all([loadWebTorrent(), registerServiceWorker()]);
        if (destroyed) return;
        client = new WebTorrentClass({ tracker: { announce: LOCAL_P2P_TRACKERS }, dht: false, lsd: true, utPex: true });
        client.createServer({ controller: registration });
        metricsTimer = setInterval(() => {
          const torrent = state.infoHash ? torrents.get(state.infoHash) : null;
          if (!torrent || torrent.destroyed) return;
          publish({ ...state, status: torrent.numPeers > 0 ? "ready" : localSeeds.has(torrent.infoHash.toLowerCase()) ? "seeding" : "no_peers", peerCount: torrent.numPeers, uploadSpeed: torrent.uploadSpeed, downloadSpeed: torrent.downloadSpeed, progress: torrent.progress });
        }, metricIntervalMs);
        publish(IDLE_STATE);
      } catch (cause) {
        const error = cause instanceof LocalP2pError ? cause : new LocalP2pError("p2p_initialization_failed", "The browser P2P runtime could not be initialized.", { cause });
        publishError(error); throw error;
      }
    })().finally(() => { initializePromise = null; });
    return initializePromise;
  }
  async function seedLocalFile(file: File): Promise<LocalP2pDescriptor> {
    if (!(file instanceof File) || file.size <= 0) throw new LocalP2pError("p2p_invalid_file", "Choose a non-empty video file from this device.");
    await initialize(); if (!client) throw new LocalP2pError("p2p_initialization_failed", "The P2P runtime is unavailable.");
    publish({ ...IDLE_STATE, status: "hashing" });
    return new Promise((resolve, reject) => {
      try {
        const torrent = client!.seed(file, { announce: LOCAL_P2P_TRACKERS, private: true, dht: false, lsd: true, utPex: true, destroyStoreOnDestroy: true, name: file.name }, (seeded) => {
          const infoHash = seeded.infoHash.toLowerCase();
          localSeeds.add(infoHash);
          track(seeded); publish({ ...IDLE_STATE, status: "seeding", infoHash });
          resolve(Object.freeze({ infoHash: seeded.infoHash.toLowerCase(), magnetUri: seeded.magnetURI, fileName: file.name, fileSize: file.size, mimeType: file.type || null }));
        });
        torrent.once("error", (cause) => { const error = new LocalP2pError("p2p_seed_failed", "The browser could not create the P2P stream.", { cause }); publishError(error); reject(error); });
      } catch (cause) { const error = new LocalP2pError("p2p_seed_failed", "The browser could not create the P2P stream.", { cause }); publishError(error); reject(error); }
    });
  }
  async function joinLocalStream(descriptor: LocalP2pDescriptor): Promise<WebTorrentFile> {
    validateDescriptor(descriptor); await initialize(); if (!client) throw new LocalP2pError("p2p_initialization_failed", "The P2P runtime is unavailable.");
    const existing = torrents.get(descriptor.infoHash); if (existing) { const file = existing.files.find((candidate) => candidate.name === descriptor.fileName) ?? existing.files[0]; if (file) return file; }
    const pending = joinPromises.get(descriptor.infoHash);
    if (pending) return pending;
    publish({ ...IDLE_STATE, status: "connecting", infoHash: descriptor.infoHash });
    const pendingJoin = new Promise<WebTorrentFile>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(joinTimeout);
        callback();
      };
      const joinTimeout = setTimeout(() => {
        const error = new LocalP2pError("p2p_join_failed", "No peer could provide this device stream within 30 seconds. Keep the owner tab open and try again.");
        publishError(error);
        finish(() => reject(error));
      }, LOCAL_P2P_JOIN_TIMEOUT_MS);
      try {
        const torrent = client!.add(descriptor.magnetUri, { announce: LOCAL_P2P_TRACKERS, private: true, dht: false, lsd: true, utPex: true, destroyStoreOnDestroy: true }, (joined) => {
          if (settled) return;
          const file = joined.files.find((candidate) => candidate.name === descriptor.fileName) ?? joined.files[0];
          if (!file || file.length !== descriptor.fileSize) { const error = new LocalP2pError("p2p_invalid_descriptor", "The P2P source did not contain the expected video file."); void removeTorrent(client!, joined).finally(() => finish(() => reject(error))); return; }
          publish({ ...IDLE_STATE, status: joined.numPeers > 0 ? "ready" : "no_peers", infoHash: joined.infoHash.toLowerCase() }); finish(() => resolve(file));
        });
        track(torrent);
        const noPeerTimer = setTimeout(() => {
          if (!torrent.destroyed && torrents.has(descriptor.infoHash) && torrent.numPeers === 0) {
            publish({ ...state, status: "no_peers", infoHash: descriptor.infoHash });
          }
          noPeerTimers.delete(descriptor.infoHash);
        }, 8_000);
        noPeerTimers.set(descriptor.infoHash, noPeerTimer);
        torrent.once("error", (cause) => { const error = new LocalP2pError("p2p_join_failed", "The browser could not join the device stream.", { cause }); publishError(error); finish(() => reject(error)); });
      } catch (cause) { const error = new LocalP2pError("p2p_join_failed", "The browser could not join the device stream.", { cause }); publishError(error); finish(() => reject(error)); }
    }).finally(() => { joinPromises.delete(descriptor.infoHash); });
    joinPromises.set(descriptor.infoHash, pendingJoin);
    return pendingJoin;
  }
  async function attachToMediaElement(descriptor: LocalP2pDescriptor, element: HTMLMediaElement): Promise<void> {
    const file = await joinLocalStream(descriptor);
    try {
      if (file.streamURL) {
        element.src = file.streamURL;
        return;
      }
      file.streamTo(element);
    } catch (cause) {
      const error = new LocalP2pError("p2p_stream_failed", "The P2P video stream could not be attached to the player.", { cause });
      publishError(error);
      throw error;
    }
  }
  async function leaveLocalStream(infoHash: string): Promise<void> { const normalized = infoHash.toLowerCase(); const timer = noPeerTimers.get(normalized); if (timer !== undefined) clearTimeout(timer); noPeerTimers.delete(normalized); joinPromises.delete(normalized); const torrent = torrents.get(normalized); if (!torrent || !client) return; torrents.delete(normalized); localSeeds.delete(normalized); await removeTorrent(client, torrent); publish({ ...IDLE_STATE, status: "stopped" }); }
  async function destroy(): Promise<void> { if (destroyed) return; destroyed = true; if (metricsTimer !== null) clearInterval(metricsTimer); metricsTimer = null; for (const timer of noPeerTimers.values()) clearTimeout(timer); noPeerTimers.clear(); joinPromises.clear(); torrents.clear(); localSeeds.clear(); const activeClient = client; client = null; if (activeClient && !activeClient.destroyed) await new Promise<void>((resolve, reject) => activeClient.destroy((error) => error ? reject(error) : resolve())); publish({ ...IDLE_STATE, status: "stopped" }); listeners.clear(); }
  return Object.freeze({ initialize, seedLocalFile, joinLocalStream, attachToMediaElement, leaveLocalStream, hasLocalSeed: (infoHash: string) => localSeeds.has(infoHash.toLowerCase()), getState: () => state, subscribe: (listener: StateListener) => { listeners.add(listener); listener(state); return () => listeners.delete(listener); }, destroy });
}
let browserRuntime: LocalP2pRuntime | null = null;
export function getBrowserLocalP2pRuntime(): LocalP2pRuntime { if (typeof window === "undefined") throw new LocalP2pError("p2p_unsupported", "The P2P runtime is available only in a browser."); browserRuntime ??= createLocalP2pRuntime(); return browserRuntime; }
export async function destroyBrowserLocalP2pRuntime(): Promise<void> { const runtime = browserRuntime; browserRuntime = null; if (runtime) await runtime.destroy(); }
