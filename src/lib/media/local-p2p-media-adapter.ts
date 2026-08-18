"use client";

import type { PlayerCapabilities, PlayerSyncAdapter, SyncMedia } from "../sync/sync-core";
import {
  getBrowserLocalP2pRuntime,
  type LocalP2pRuntime,
} from "../p2p/local-p2p-runtime";
import {
  getBrowserLocalP2pSourceService,
  type LocalP2pSourceService,
} from "../p2p/local-p2p-source-service";
import { LocalP2pError } from "../p2p/local-p2p-contracts";
import {
  classifyPlayRejection,
  MediaRuntimeError,
} from "./media-source";
import type { HtmlMediaAdapterEvents, PlaybackPermission } from "./html-media-adapter";

const HAVE_METADATA = 1;

export type LocalP2pMediaPlayerAdapter = PlayerSyncAdapter & Readonly<{
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

type Options = Readonly<{
  mediaElement: HTMLVideoElement;
  roomId: string;
  isOwner: boolean;
  events?: HtmlMediaAdapterEvents;
  runtime?: LocalP2pRuntime;
  sourceService?: LocalP2pSourceService;
}>;

function mapP2pError(cause: unknown): MediaRuntimeError {
  if (cause instanceof MediaRuntimeError) return cause;
  if (cause instanceof LocalP2pError) {
    const category = cause.code === "p2p_unsupported" || cause.code === "p2p_service_worker_unavailable"
      ? "p2p_unsupported"
      : cause.code === "p2p_invalid_file"
        ? "p2p_file_required"
        : "p2p_stream_failed";
    return new MediaRuntimeError(category, cause.message, { cause });
  }
  return new MediaRuntimeError(
    "p2p_stream_failed",
    "The device stream could not be prepared in this browser.",
    { cause },
  );
}

export function createLocalP2pMediaPlayerAdapter(
  options: Options,
): LocalP2pMediaPlayerAdapter {
  const media = options.mediaElement;
  const events = options.events ?? {};
  const runtime = options.runtime ?? getBrowserLocalP2pRuntime();
  const sourceService = options.sourceService ?? getBrowserLocalP2pSourceService();
  const listeners = new Map<string, EventListener>();
  const readyWaiters = new Set<Readonly<{
    resolve: () => void;
    reject: (error: MediaRuntimeError) => void;
  }>>();

  let mediaId: string | null = null;
  let infoHash: string | null = null;
  let ready = false;
  let destroyed = false;
  let generation = 0;
  let playbackPermission: PlaybackPermission = "unknown";
  let lastError: MediaRuntimeError | null = null;

  function listen(name: string, listener: EventListener): void {
    media.addEventListener(name, listener);
    listeners.set(name, listener);
  }

  function settleReady(): void {
    if (!ready || destroyed) return;
    for (const waiter of readyWaiters) waiter.resolve();
    readyWaiters.clear();
    events.onDurationChange?.(Number.isFinite(media.duration) ? media.duration : null);
    events.onReady?.();
  }

  function report(error: MediaRuntimeError): void {
    lastError = error;
    for (const waiter of readyWaiters) waiter.reject(error);
    readyWaiters.clear();
    events.onError?.(error);
  }

  function rejectReadyWaiters(error: MediaRuntimeError): void {
    for (const waiter of readyWaiters) waiter.reject(error);
    readyWaiters.clear();
  }

  listen("loadedmetadata", () => {
    ready = media.readyState >= HAVE_METADATA;
    settleReady();
  });
  listen("durationchange", () => {
    events.onDurationChange?.(Number.isFinite(media.duration) ? media.duration : null);
  });
  listen("canplay", () => {
    ready = true;
    events.onBufferingChange?.(false);
    settleReady();
  });
  listen("playing", () => events.onBufferingChange?.(false));
  listen("waiting", () => events.onBufferingChange?.(true));
  listen("stalled", () => events.onBufferingChange?.(true));
  listen("progress", () => events.onProgress?.());
  listen("timeupdate", () => events.onProgress?.());
  listen("seeked", () => events.onProgress?.());
  listen("ended", () => void events.onEnded?.());
  listen("error", () => report(new MediaRuntimeError(
    "p2p_stream_failed",
    "The browser could not play the device stream.",
  )));

  async function clearSource(): Promise<void> {
    generation += 1;
    rejectReadyWaiters(new MediaRuntimeError(
      "p2p_stream_failed",
      "The device stream was replaced before it became ready.",
      { fatal: false },
    ));
    ready = false;
    media.pause();
    media.removeAttribute("src");
    media.load();
    const previousHash = infoHash;
    infoHash = null;
    if (previousHash && !runtime.hasLocalSeed(previousHash)) {
      await runtime.leaveLocalStream(previousHash).catch(() => undefined);
    }
  }

  async function loadMedia(next: SyncMedia | null): Promise<void> {
    if (destroyed) {
      throw new MediaRuntimeError("p2p_stream_failed", "The device-stream player was destroyed.");
    }
    await clearSource();
    lastError = null;
    playbackPermission = "unknown";
    mediaId = next?.id ?? null;
    events.onDurationChange?.(null);
    if (!next) return;
    if (next.sourceType !== "local_p2p" || !next.roomId) {
      const error = new MediaRuntimeError("p2p_stream_failed", "The device-stream source is invalid.");
      report(error);
      throw error;
    }

    const loadGeneration = generation;
    try {
      const descriptor = await sourceService.resolveSource(options.roomId, next.id);
      if (options.isOwner && !runtime.hasLocalSeed(descriptor.infoHash)) {
        throw new MediaRuntimeError(
          "p2p_file_required",
          "Choose the original file again to resume hosting this device stream.",
        );
      }
      infoHash = descriptor.infoHash;
      void runtime.attachToMediaElement(descriptor, media).then(() => {
        if (destroyed || loadGeneration !== generation) return;
        media.load();
        ready = media.readyState >= HAVE_METADATA;
        settleReady();
      }).catch((cause) => {
        if (destroyed || loadGeneration !== generation) return;
        report(mapP2pError(cause));
      });
    } catch (cause) {
      const error = mapP2pError(cause);
      report(error);
      throw error;
    }
  }

  async function play(): Promise<void> {
    try {
      await media.play();
      playbackPermission = "allowed";
    } catch (cause) {
      const error = classifyPlayRejection(cause);
      if (error.category === "autoplay_permission_blocked") {
        playbackPermission = "user_gesture_required";
      }
      report(error);
      throw error;
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    void clearSource();
    for (const [name, listener] of listeners) media.removeEventListener(name, listener);
    listeners.clear();
    readyWaiters.clear();
    mediaId = null;
  }

  const capabilities: PlayerCapabilities = Object.freeze({
    supportsFinePlaybackRateCorrection: true,
    supportsPictureInPicture: true,
    supportsNativeTextTracks: true,
  });

  return Object.freeze({
    getMediaId: () => mediaId,
    loadMedia,
    waitUntilReady: () => {
      if (lastError?.fatal) return Promise.reject(lastError);
      if (ready) return Promise.resolve();
      return new Promise<void>((resolve, reject) => readyWaiters.add(Object.freeze({ resolve, reject })));
    },
    isReady: () => ready,
    isSeekable: (position: number) => ready && Number.isFinite(position) && position >= 0 && (!Number.isFinite(media.duration) || position <= media.duration),
    getSeekableTarget: (position: number) => ready && Number.isFinite(position) && position >= 0 ? Math.min(position, Number.isFinite(media.duration) ? media.duration : position) : null,
    isPaused: () => media.paused,
    getCurrentTime: () => media.currentTime,
    getDuration: () => Number.isFinite(media.duration) ? media.duration : null,
    seek: (position: number) => { media.currentTime = Math.max(0, position); },
    play,
    pause: () => media.pause(),
    getPlaybackRate: () => media.playbackRate,
    setPlaybackRate: (rate: number) => { media.playbackRate = rate; },
    getAvailablePlaybackRates: () => Object.freeze([1]),
    getCapabilities: () => capabilities,
    startWatching: play,
    getPlaybackPermission: () => playbackPermission,
    getLastError: () => lastError,
    hasFatalError: () => lastError?.fatal === true,
    getVolume: () => media.volume,
    setVolume: (volume: number) => { media.volume = Math.min(1, Math.max(0, volume)); },
    isMuted: () => media.muted,
    setMuted: (muted: boolean) => { media.muted = muted; },
    destroy,
  });
}
