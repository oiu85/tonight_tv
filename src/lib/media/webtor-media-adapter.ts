"use client";

import type { PlayerCapabilities, PlayerSyncAdapter, SyncMedia } from "../sync/sync-core";
import { MediaRuntimeError } from "./media-source";
import type { HtmlMediaAdapterEvents, PlaybackPermission } from "./html-media-adapter";
import type { WebtorEvent, WebtorGenerator, WebtorPlayer } from "@webtor/embed-sdk-js";

let sdkPromise: Promise<WebtorGenerator> | null = null;
export async function loadWebtorSdk(): Promise<WebtorGenerator> {
  sdkPromise ??= new Promise((resolve, reject) => {
    const browserWindow = window as Window & { webtor?: WebtorGenerator };
    if (browserWindow.webtor) { resolve(browserWindow.webtor); return; }
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://cdn.jsdelivr.net/npm/@webtor/embed-sdk-js@0.2.19/dist/index.min.js";
    script.onload = () => browserWindow.webtor
      ? resolve(browserWindow.webtor)
      : reject(new Error("Webtor SDK loaded without its public generator."));
    script.onerror = () => reject(new Error("The public Webtor SDK could not be loaded."));
    document.head.appendChild(script);
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
  const value = (media as SyncMedia & { torrentMagnetUri?: string | null }).torrentMagnetUri;
  if (value?.startsWith("magnet:?")) return value;
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

  function report(error: MediaRuntimeError): void {
    lastError = error;
    events.onError?.(error);
    readyReject?.(error);
    readyResolve = null;
    readyReject = null;
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
      readyResolve?.();
      readyResolve = null;
      readyReject = null;
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
    generation += 1;
    const localGeneration = generation;
    ready = false;
    player = null;
    mediaId = media?.id ?? null;
    currentTime = 0;
    duration = null;
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
    if (ready) return Promise.resolve();
    return new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
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
  function destroy(): void { if (destroyed) return; destroyed = true; generation += 1; player = null; options.mount.replaceChildren(); readyResolve = null; readyReject = null; }

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
