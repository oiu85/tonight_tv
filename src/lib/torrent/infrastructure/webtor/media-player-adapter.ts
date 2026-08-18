"use client";

import type { PlayerCapabilities, PlayerSyncAdapter, SyncMedia } from "../../../sync/sync-core";
import { extractInfoHashFromTorrentInput, isWebtorAutoselectPath } from "../../domain";
import { MediaRuntimeError } from "../../../media/media-source";
import type { HtmlMediaAdapterEvents, PlaybackPermission } from "../../../media/html-media-adapter";
import type { WebtorEvent, WebtorGenerator, WebtorPlayer } from "@webtor/embed-sdk-js";

let sdkPromise: Promise<WebtorGenerator> | null = null;
const WEBTOR_SDK_TIMEOUT_MS = 15_000;
const WEBTOR_READY_TIMEOUT_MS = 60_000;
const WEBTOR_PUBLIC_BASE_URL = "https://webtor.io";
const WEBTOR_SDK_SRC = "https://cdn.jsdelivr.net/npm/@webtor/embed-sdk-js@0.2.19/dist/index.min.js";

function asWebtorGenerator(value: unknown): WebtorGenerator | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  if (typeof (value as WebtorGenerator).push !== "function") return null;
  return value as WebtorGenerator;
}

export async function loadWebtorSdk(): Promise<WebtorGenerator> {
  sdkPromise ??= new Promise<WebtorGenerator>((resolve, reject) => {
    const existing = asWebtorGenerator((window as Window & { webtor?: unknown }).webtor);
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement("script");
    // The public SDK auto-converts every <video> on script load. Tonight TV
    // owns an empty HTML video element beside the Webtor mount, so leave such
    // elements detached until the SDK has finished its one-time scan. This
    // prevents the SDK from calling push() without a magnet or torrent URL.
    const detachedVideos = Array.from(document.querySelectorAll("video"))
      .filter((video) => {
        const source = video.getAttribute("src")?.trim() ?? "";
        const torrent = video.getAttribute("data-torrent")?.trim() ?? "";
        return !source && !torrent && video.parentElement;
      })
      .map((video) => Object.freeze({ video, parent: video.parentElement!, next: video.nextSibling }));
    for (const entry of detachedVideos) entry.parent.removeChild(entry.video);
    const restoreVideos = () => {
      for (const entry of detachedVideos) {
        if (!entry.video.isConnected) entry.parent.insertBefore(entry.video, entry.next);
      }
    };
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = setTimeout(() => finish(() => {
      restoreVideos();
      script.remove();
      reject(new Error("The public Webtor SDK did not load within 15 seconds."));
    }), WEBTOR_SDK_TIMEOUT_MS);
    script.async = true;
    script.src = WEBTOR_SDK_SRC;
    script.onload = () => finish(() => {
      restoreVideos();
      const generator = asWebtorGenerator((window as Window & { webtor?: unknown }).webtor);
      if (generator) {
        resolve(generator);
        return;
      }
      reject(new Error("Webtor SDK loaded without its public generator."));
    });
    script.onerror = () => finish(() => {
      restoreVideos();
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
  title: false,
  playpause: false,
  timeline: false,
  currentTime: false,
  duration: false,
  settings: false,
  fullscreen: false,
  chromecast: false,
  embed: false,
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
  const stored = media.torrentMagnetUri?.trim() ?? "";
  if (stored.toLowerCase().startsWith("magnet:?")) return stored;
  const storedHash = extractInfoHashFromTorrentInput(stored);
  if (storedHash) return `magnet:?xt=urn:btih:${storedHash}`;
  const infoHash = media.torrentInfoHash?.trim().toLowerCase() ?? "";
  if (/^[a-f0-9]{40}$/.test(infoHash)) return `magnet:?xt=urn:btih:${infoHash}`;
  const sourceHash = extractInfoHashFromTorrentInput(media.sourceUrl ?? "");
  return sourceHash ? `magnet:?xt=urn:btih:${sourceHash}` : null;
}

function embedPathFor(media: SyncMedia): string | undefined {
  const path = media.torrentFilePath?.trim() ?? "";
  if (!path || isWebtorAutoselectPath(path)) return undefined;
  return path;
}

function webtorEventName(event: WebtorEvent): string {
  return String(event.name ?? "").trim().toLowerCase();
}

export function createWebtorMediaPlayerAdapter(options: Options): WebtorMediaPlayerAdapter {
  const events = options.events ?? {};
  const mountId = options.mount.id || `tt-webtor-${crypto.randomUUID()}`;
  options.mount.id = mountId;
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
    const name = webtorEventName(event);
    if (name === "torrent fetched") {
      events.onProgress?.();
      return;
    }
    if (name === "torrent error") {
      report(new MediaRuntimeError("network_source_unreachable", "Webtor could not fetch this Torrent.", { fatal: true, cause: event.data }));
      return;
    }
    if (name === "inited") {
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
    if (name === "current time") {
      const next = numberData(event);
      if (next !== null) currentTime = next;
      events.onProgress?.();
      return;
    }
    if (name === "duration") {
      duration = numberData(event);
      events.onDurationChange?.(duration);
      return;
    }
    if (name === "player status") {
      const status = String(event.data ?? "").toLowerCase();
      events.onBufferingChange?.(status.includes("buffer"));
      if (status.includes("playing")) { paused = false; events.onProgress?.(); }
      if (status.includes("pause") || status.includes("ended")) paused = true;
      return;
    }
    if (name === "open") events.onProgress?.();
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
      // The SDK JSON-clones its config before sending it into the iframe;
      // passing the HTMLElement (`el`) creates a circular structure. Its
      // documented `id` form avoids that and is required for initialization.
      id: mountId,
      magnet,
      path: embedPathFor(media),
      mode: "video",
      // Let Webtor initialize its player normally. Its own timeline and
      // transport controls remain disabled through FEATURES; Tonight TV owns
      // the visible playback chrome.
      controls: true,
      width: "100%",
      height: "100%",
      baseUrl: WEBTOR_PUBLIC_BASE_URL,
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
          "Webtor could not prepare this torrent stream in time. Try Start watching again.",
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
