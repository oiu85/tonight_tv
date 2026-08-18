"use client";

import type { PlayerCapabilities, PlayerSyncAdapter, SyncMedia } from "../sync/sync-core";
import { MediaRuntimeError } from "./media-source";
import type { HtmlMediaAdapterEvents, PlaybackPermission } from "./html-media-adapter";
import type { WebtorEvent, WebtorGenerator, WebtorPlayer } from "@webtor/embed-sdk-js";

let sdkPromise: Promise<WebtorGenerator> | null = null;
const WEBTOR_SDK_TIMEOUT_MS = 15_000;
const WEBTOR_READY_TIMEOUT_MS = 30_000;
export async function loadWebtorSdk(): Promise<WebtorGenerator> {
  sdkPromise ??= new Promise<WebtorGenerator>((resolve, reject) => {
    const browserWindow = window as Window & { webtor?: WebtorGenerator };
    if (browserWindow.webtor) { resolve(browserWindow.webtor); return; }
    const script = document.createElement("script");
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = setTimeout(() => finish(() => {
      script.remove();
      reject(new Error("The public Webtor SDK did not load within 15 seconds."));
    }), WEBTOR_SDK_TIMEOUT_MS);
    script.async = true;
    script.src = "https://cdn.jsdelivr.net/npm/@webtor/embed-sdk-js@0.2.19/dist/index.min.js";
    script.onload = () => finish(() => browserWindow.webtor
      ? resolve(browserWindow.webtor)
      : reject(new Error("Webtor SDK loaded without its public generator.")));
    script.onerror = () => finish(() => {
      script.remove();
      reject(new Error("The public Webtor SDK could not be loaded."));
    });
    document.head.appendChild(script);
  }).catch((error) => {
    // A transient CDN or extension failure must not poison all future loads.
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

const FEATURES = Object.freeze({
  header: false,
  continue: false,
  title: false,
  p2pProgress: false,
  playpause: false,
  timeline: false,
  currentTime: false,
  duration: false,
  settings: false,
  fullscreen: false,
  chromecast: false,
  embed: false,
  opensubtitles: false,
  volume: true,
  subtitles: true,
});

export type WebtorMediaPlayerAdapter = PlayerSyncAdapter & Readonly<{
  startWatching: () => Promise<void>;
  getPlaybackPermission: () => PlaybackPermission;
  getLastError: () => MediaRuntimeError | null;
  hasFatalError: () => boolean;
  getVolume: () => number;
  setVolume: (volume: number) => void;
  isMuted: () => boolean;
  setMuted: (muted: boolean) => void;
  destroy: () => void;
}>;

type Options = Readonly<{ mount: HTMLElement; events?: HtmlMediaAdapterEvents }>;

function numberData(event: WebtorEvent): number | null {
  const value = typeof event.data === "object" && event.data !== null && "value" in event.data
    ? (event.data as { value?: unknown }).value
    : event.data;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function magnetFor(media: SyncMedia): string | null {
  if (media.torrentMagnetUri?.startsWith("magnet:?")) return media.torrentMagnetUri;
  return media.torrentInfoHash
    ? `magnet:?xt=urn:btih:${encodeURIComponent(media.torrentInfoHash)}`
    : null;
}

export function createWebtorMediaPlayerAdapter(options: Options): WebtorMediaPlayerAdapter {
  const events = options.events ?? {};
  let player: WebtorPlayer | null = null;
  let mediaId: string | null = null;
  let currentTime = 0;
  let duration: number | null = null;
  let ready = false;
  let destroyed = false;
  let generation = 0;
  let playbackPermission: PlaybackPermission = "unknown";
  let lastError: MediaRuntimeError | null = null;
  let volume = 1;
  let muted = false;
  let paused = true;
  let readyResolve: (() => void) | null = null;
  let readyReject: ((error: MediaRuntimeError) => void) | null = null;
  let readyPromise: Promise<void> | null = null;
  let readyTimer: ReturnType<typeof setTimeout> | null = null;

  function clearReadyTimer(): void {
    if (readyTimer !== null) clearTimeout(readyTimer);
    readyTimer = null;
  }

  function report(error: MediaRuntimeError): void {
    lastError = error;
    events.onError?.(error);
    clearReadyTimer();
    const rejectReady = readyReject;
    readyResolve = null;
    readyReject = null;
    readyPromise = null;
    rejectReady?.(error);
  }

  function handle(event: WebtorEvent, expectedGeneration: number): void {
    if (destroyed || expectedGeneration !== generation) return;
    if (event.name === "torrent fetched") {
      events.onProgress?.();
      return;
    }
    if (event.name === "torrent error") {
      report(new MediaRuntimeError("network_source_unreachable", "Webtor could not fetch this Torrent.", { fatal: true, cause: event.data }));
      return;
    }
    if (event.name === "inited") {
      player = event.player ?? player;
      ready = true;
      playbackPermission = "allowed";
      clearReadyTimer();
      const resolveReady = readyResolve;
      readyResolve = null;
      readyReject = null;
      readyPromise = null;
      resolveReady?.();
      events.onReady?.();
      return;
    }
    if (event.name === "current time") {
      const next = numberData(event);
      if (next !== null) currentTime = next;
      events.onProgress?.();
      return;
    }
    if (event.name === "duration") {
      duration = numberData(event);
      events.onDurationChange?.(duration);
      return;
    }
    if (event.name === "player status") {
      const status = String(event.data ?? "").toLowerCase();
      events.onBufferingChange?.(status.includes("buffer"));
      if (status.includes("playing")) { paused = false; events.onProgress?.(); }
      if (status.includes("pause") || status.includes("ended")) paused = true;
      return;
    }
    if (event.name === "open") events.onProgress?.();
  }

  async function loadMedia(media: SyncMedia | null): Promise<void> {
    if (destroyed) throw new MediaRuntimeError("unknown_media_error", "The Webtor adapter has been destroyed.");
    if (readyReject) {
      const replacedError = new MediaRuntimeError(
        "network_source_unreachable",
        "The Torrent was replaced before Webtor finished preparing it.",
        { fatal: false },
      );
      const rejectReady = readyReject;
      clearReadyTimer();
      readyResolve = null;
      readyReject = null;
      readyPromise = null;
      rejectReady(replacedError);
    }
    generation += 1;
    clearReadyTimer();
    const localGeneration = generation;
    ready = false;
    player = null;
    mediaId = media?.id ?? null;
    lastError = null;
    currentTime = 0;
    duration = null;
    playbackPermission = "unknown";
    paused = true;
    options.mount.replaceChildren();
    if (!media) return;
    const magnet = magnetFor(media);
    if (media.sourceType !== "torrent" || !magnet) {
      throw new MediaRuntimeError("invalid_torrent", "This Torrent has no usable Magnet identity.", { fatal: true });
    }
    const sdk = await loadWebtorSdk();
    if (destroyed || localGeneration !== generation) return;
    sdk.push({
      el: options.mount,
      magnet,
      path: media.torrentFilePath ?? undefined,
      baseUrl: "https://webtor.io",
      features: FEATURES,
      on: (event) => handle(event, localGeneration),
    });
  }

  function waitUntilReady(): Promise<void> {
    if (lastError?.fatal) return Promise.reject(lastError);
    if (ready) return Promise.resolve();
    if (readyPromise) return readyPromise;
    readyPromise = new Promise((resolve, reject) => {
      readyResolve = () => {
        clearReadyTimer();
        resolve();
      };
      readyReject = (error) => {
        clearReadyTimer();
        reject(error);
      };
      readyTimer = setTimeout(() => {
        const error = new MediaRuntimeError(
          "network_source_unreachable",
          "Webtor could not prepare this Torrent stream within 30 seconds.",
          { fatal: true },
        );
        report(error);
      }, WEBTOR_READY_TIMEOUT_MS);
    });
    return readyPromise;
  }
  async function play(): Promise<void> {
    if (!player && !ready) await waitUntilReady();
    if (!player) throw new MediaRuntimeError("autoplay_permission_blocked", "Start watching to allow Webtor playback.", { fatal: false });
    try { player.play(); paused = false; } catch (cause) {
      playbackPermission = "user_gesture_required";
      throw new MediaRuntimeError("autoplay_permission_blocked", "Start watching to allow Webtor playback.", { fatal: false, cause });
    }
  }
  function pause(): void { player?.pause(); paused = true; }
  function seek(positionSec: number): void { player?.setPosition(Math.max(0, positionSec)); }
  function startWatching(): Promise<void> { return play(); }
  function destroy(): void { if (destroyed) return; destroyed = true; generation += 1; clearReadyTimer(); player = null; options.mount.replaceChildren(); readyResolve = null; readyReject = null; readyPromise = null; }

  const capabilities: PlayerCapabilities = Object.freeze({ supportsFinePlaybackRateCorrection: false, supportsPictureInPicture: false, supportsNativeTextTracks: false });
  return Object.freeze({
    getMediaId: () => mediaId,
    loadMedia,
    waitUntilReady,
    isReady: () => ready,
    isSeekable: (position: number) => Number.isFinite(position) && position >= 0,
    getSeekableTarget: (position: number) => Math.max(0, position),
    isPaused: () => paused,
    getCurrentTime: () => currentTime,
    getDuration: () => duration,
    seek,
    play,
    pause,
    getPlaybackRate: () => 1,
    setPlaybackRate: () => undefined,
    getAvailablePlaybackRates: () => [1],
    getCapabilities: () => capabilities,
    startWatching,
    getPlaybackPermission: () => playbackPermission,
    getLastError: () => lastError,
    hasFatalError: () => lastError?.fatal === true,
    getVolume: () => volume,
    setVolume: (next: number) => { volume = Math.min(1, Math.max(0, next)); },
    isMuted: () => muted,
    setMuted: (next: boolean) => { muted = next; },
    destroy,
  });
}
