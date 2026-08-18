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
import { LocalP2pError, type LocalP2pDescriptor } from "../p2p/local-p2p-contracts";
import {
  classifyPlayRejection,
  MediaRuntimeError,
} from "./media-source";
import type { HtmlMediaAdapterEvents, PlaybackPermission } from "./html-media-adapter";

const HAVE_METADATA = 1;
const TRANSIENT_ATTACH_LIMIT = 4;

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

function mapP2pError(cause: unknown, fatal = true): MediaRuntimeError {
  if (cause instanceof MediaRuntimeError) return cause;
  if (cause instanceof LocalP2pError) {
    const category = cause.code === "p2p_unsupported" || cause.code === "p2p_service_worker_unavailable"
      ? "p2p_unsupported"
      : cause.code === "p2p_invalid_file"
        ? "p2p_file_required"
        : cause.code === "p2p_join_failed"
          ? "p2p_host_unavailable"
          : "p2p_stream_failed";
    return new MediaRuntimeError(category, cause.message, { cause, fatal });
  }
  return new MediaRuntimeError(
    "p2p_stream_failed",
    "The device stream could not be prepared in this browser.",
    { cause, fatal },
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
  const seekWaiters = new Set<() => void>();

  let mediaId: string | null = null;
  let infoHash: string | null = null;
  let descriptor: LocalP2pDescriptor | null = null;
  let ready = false;
  let destroyed = false;
  let generation = 0;
  let playbackPermission: PlaybackPermission = "unknown";
  let lastError: MediaRuntimeError | null = null;
  let attachAttempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function listen(name: string, listener: EventListener): void {
    media.addEventListener(name, listener);
    listeners.set(name, listener);
  }

  function settleReady(): void {
    if (!ready || destroyed) return;
    lastError = null;
    for (const waiter of readyWaiters) waiter.resolve();
    readyWaiters.clear();
    events.onDurationChange?.(Number.isFinite(media.duration) ? media.duration : null);
    events.onReady?.();
  }

  function report(error: MediaRuntimeError): void {
    lastError = error;
    if (error.fatal) {
      for (const waiter of readyWaiters) waiter.reject(error);
      readyWaiters.clear();
    }
    events.onError?.(error);
  }

  function rejectReadyWaiters(error: MediaRuntimeError): void {
    for (const waiter of readyWaiters) waiter.reject(error);
    readyWaiters.clear();
  }

  function settleSeekWaiters(): void {
    for (const resolve of seekWaiters) resolve();
    seekWaiters.clear();
  }

  function clearRetryTimer(): void {
    if (retryTimer === null) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  function isStillDownloading(): boolean {
    const state = runtime.getState();
    if (!state || state.hosting) return false;
    return state.status === "connecting" || state.status === "no_peers" || state.status === "buffering" || state.progress < 0.05;
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
  listen("seeked", () => {
    settleSeekWaiters();
    events.onProgress?.();
  });
  listen("ended", () => void events.onEnded?.());
  listen("error", () => {
    if (destroyed || !descriptor) return;
    if (isStillDownloading() && attachAttempts < TRANSIENT_ATTACH_LIMIT) {
      attachAttempts += 1;
      events.onBufferingChange?.(true);
      report(new MediaRuntimeError(
        "p2p_stream_failed",
        "The device stream is still opening. Waiting for more data from the host.",
        { fatal: false },
      ));
      clearRetryTimer();
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (destroyed || !descriptor) return;
        void runtime.attachToMediaElement(descriptor, media).catch((cause) => {
          report(mapP2pError(cause, false));
        });
      }, 1_200 * attachAttempts);
      return;
    }
    report(new MediaRuntimeError(
      "p2p_stream_failed",
      "The browser could not play the device stream.",
    ));
  });

  async function clearSource(): Promise<void> {
    generation += 1;
    clearRetryTimer();
    attachAttempts = 0;
    rejectReadyWaiters(new MediaRuntimeError(
      "p2p_stream_failed",
      "The device stream was replaced before it became ready.",
      { fatal: false },
    ));
    ready = false;
    settleSeekWaiters();
    const previousHash = infoHash;
    infoHash = null;
    descriptor = null;
    media.pause();
    media.removeAttribute("src");
    media.load();
    if (previousHash && !runtime.hasLocalSeed(previousHash)) {
      await runtime.leaveLocalStream(previousHash).catch(() => undefined);
    }
  }

  async function loadMedia(next: SyncMedia | null): Promise<void> {
    if (destroyed) {
      throw new MediaRuntimeError("p2p_stream_failed", "The device-stream player was destroyed.");
    }
    if (next?.id === mediaId && descriptor) {
      lastError = null;
      await runtime.attachToMediaElement(descriptor, media);
      ready = media.readyState >= HAVE_METADATA;
      settleReady();
      return;
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
      const resolved = await sourceService.resolveSource(options.roomId, next.id);
      if (destroyed || loadGeneration !== generation) return;
      descriptor = resolved;
      infoHash = resolved.infoHash;
      await runtime.attachToMediaElement(resolved, media);
      if (destroyed || loadGeneration !== generation) return;
      ready = media.readyState >= HAVE_METADATA;
      settleReady();
    } catch (cause) {
      if (destroyed || loadGeneration !== generation) return;
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
    clearRetryTimer();
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
    seek: async (position: number) => {
      if (!Number.isFinite(position) || Math.abs(media.currentTime - position) < 0.01) {
        return;
      }
      media.pause();
      media.currentTime = Math.max(0, position);
      if (!media.seeking) {
        return;
      }
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutId);
          seekWaiters.delete(finish);
          resolve();
        };
        const timeoutId = setTimeout(finish, 8_000);
        seekWaiters.add(finish);
      });
    },
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
