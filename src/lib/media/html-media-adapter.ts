"use client";

import Hls, { type HlsConfig } from "hls.js";

import type {
  CanonicalPlaybackState,
  PlaybackCommandService,
} from "../playback/playback-command-service";
import type { PlayerSyncAdapter, SyncMedia } from "../sync/sync-core";
import {
  classifyHlsError,
  classifyHtmlMediaError,
  classifyPlayRejection,
  MediaRuntimeError,
  resolveMediaRuntimeSource,
  unsupportedHlsRuntimeError,
  type HlsErrorLike,
} from "./media-source";

const HAVE_METADATA = 1;
const HAVE_FUTURE_DATA = 3;
export const BUFFERING_GRACE_MS = 500;
const RECOVERY_BUFFER_AHEAD_SEC = 0.25;
const NATIVE_HLS_MIME_TYPES = [
  "application/vnd.apple.mpegurl",
  "application/x-mpegURL",
] as const;

export type PlaybackPermission = "unknown" | "allowed" | "user_gesture_required";

export type HlsRuntime = Readonly<{
  attachMedia: (media: HTMLMediaElement) => void;
  loadSource: (sourceUrl: string) => void;
  on: (event: string, listener: (event: string, data: unknown) => void) => void;
  off?: (event: string, listener: (event: string, data: unknown) => void) => void;
  recoverMediaError?: () => void;
  config?: { lowLatencyMode: boolean };
  destroy: () => void;
}>;

export type HlsRuntimeFactory = Readonly<{
  isSupported: () => boolean;
  create: (config: Partial<HlsConfig>) => HlsRuntime;
  errorEvent: string;
  levelLoadedEvent?: string;
}>;

export type HtmlMediaAdapterEvents = Readonly<{
  onReady?: () => void;
  onProgress?: () => void;
  onDurationChange?: (durationSec: number | null) => void;
  onBufferingChange?: (buffering: boolean) => void;
  onEnded?: () => void | Promise<void>;
  onError?: (error: MediaRuntimeError) => void;
}>;

export type HtmlMediaPlayerAdapter = PlayerSyncAdapter &
  Readonly<{
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

export type HtmlMediaAdapterOptions = Readonly<{
  events?: HtmlMediaAdapterEvents;
  hlsFactory?: HlsRuntimeFactory;
}>;

type ReadyWaiter = Readonly<{
  resolve: () => void;
  reject: (error: MediaRuntimeError) => void;
}>;

const defaultHlsFactory: HlsRuntimeFactory = Object.freeze({
  isSupported: () => Hls.isSupported(),
  create: (config) => new Hls(config) as unknown as HlsRuntime,
  errorEvent: Hls.Events.ERROR,
  levelLoadedEvent: Hls.Events.LEVEL_LOADED,
});

/**
 * hls.js 1.7 startup/buffer policy. ABR remains automatic: the lowest level is
 * sampled first to establish bandwidth, then hls.js is free to move up or down.
 */
export const HLS_RUNTIME_CONFIG = Object.freeze({
  startLevel: -1,
  testBandwidth: true,
  capLevelToPlayerSize: true,
  maxBufferLength: 45,
  maxMaxBufferLength: 90,
  maxBufferSize: 60_000_000,
  backBufferLength: 30,
  lowLatencyMode: false,
}) satisfies Readonly<Partial<HlsConfig>>;

function supportsNativeHls(mediaElement: HTMLMediaElement): boolean {
  return NATIVE_HLS_MIME_TYPES.some(
    (mimeType) => mediaElement.canPlayType(mimeType) !== "",
  );
}

export function createHtmlMediaPlayerAdapter(
  mediaElement: HTMLMediaElement,
  options: HtmlMediaAdapterOptions = {},
): HtmlMediaPlayerAdapter {
  const events = options.events ?? {};
  const hlsFactory = options.hlsFactory ?? defaultHlsFactory;
  const listeners = new Map<string, EventListener>();
  const readyWaiters = new Set<ReadyWaiter>();

  let mediaId: string | null = null;
  let hls: HlsRuntime | null = null;
  let sourceGeneration = 0;
  let destroyed = false;
  let playbackPermission: PlaybackPermission = "unknown";
  let lastError: MediaRuntimeError | null = null;
  let durationSec: number | null = null;
  let hlsIsLive = false;
  let mediaRecoveryAttempted = false;
  let hasPlayed = false;
  let buffering = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let lastObservedTimeSec = 0;
  const seekWaiters = new Set<() => void>();

  function isReady(): boolean {
    return !destroyed && mediaId !== null && mediaElement.readyState >= HAVE_METADATA;
  }

  function settleReadyWaiters(): void {
    if (!isReady()) {
      return;
    }
    for (const waiter of readyWaiters) {
      waiter.resolve();
    }
    readyWaiters.clear();
    events.onReady?.();
  }

  function setDuration(nextDurationSec: number | null, allowUnknown = false): void {
    const finiteDuration =
      nextDurationSec !== null &&
      Number.isFinite(nextDurationSec) &&
      nextDurationSec >= 0
        ? nextDurationSec
        : null;
    if (finiteDuration === null && !allowUnknown && durationSec !== null) {
      return;
    }
    if (durationSec === finiteDuration) {
      return;
    }
    durationSec = finiteDuration;
    events.onDurationChange?.(durationSec);
  }

  function updateDurationFromMediaElement(): void {
    setDuration(mediaElement.duration);
  }

  function rejectReadyWaiters(error: MediaRuntimeError): void {
    for (const waiter of readyWaiters) {
      waiter.reject(error);
    }
    readyWaiters.clear();
  }

  function reportError(error: MediaRuntimeError): void {
    if (
      lastError?.fatal &&
      error.fatal &&
      lastError.category === error.category
    ) {
      return;
    }
    lastError = error;
    if (error.fatal) {
      clearStallTimer();
      setBuffering(false);
      rejectReadyWaiters(error);
    }
    events.onError?.(error);
  }

  function listen(eventName: string, listener: EventListener): void {
    mediaElement.addEventListener(eventName, listener);
    listeners.set(eventName, listener);
  }

  function getBufferedAheadSec(): number {
    const buffered = mediaElement.buffered;
    if (!buffered) {
      return 0;
    }
    const currentTime = mediaElement.currentTime;
    for (let index = 0; index < buffered.length; index += 1) {
      if (
        currentTime >= buffered.start(index) - 0.05 &&
        currentTime <= buffered.end(index) + 0.05
      ) {
        return Math.max(0, buffered.end(index) - currentTime);
      }
    }
    return 0;
  }

  function clearStallTimer(): void {
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  }

  function setBuffering(nextBuffering: boolean): void {
    if (buffering === nextBuffering) {
      return;
    }
    buffering = nextBuffering;
    events.onBufferingChange?.(nextBuffering);
  }

  function hasRecoveryEvidence(): boolean {
    return (
      mediaElement.readyState >= HAVE_FUTURE_DATA ||
      getBufferedAheadSec() >= RECOVERY_BUFFER_AHEAD_SEC
    );
  }

  function clearBufferingWithEvidence(): void {
    clearStallTimer();
    if (hasRecoveryEvidence() || !hasPlayed || mediaElement.paused || mediaElement.seeking) {
      setBuffering(false);
    }
  }

  function scheduleStallCheck(): void {
    clearStallTimer();
    if (
      !hasPlayed ||
      mediaElement.paused ||
      mediaElement.seeking ||
      mediaElement.ended ||
      lastError?.fatal
    ) {
      return;
    }
    stallTimer = setTimeout(() => {
      stallTimer = null;
      if (
        hasPlayed &&
        !mediaElement.paused &&
        !mediaElement.seeking &&
        !mediaElement.ended &&
        !hasRecoveryEvidence() &&
        !lastError?.fatal
      ) {
        setBuffering(true);
      }
    }, BUFFERING_GRACE_MS);
  }

  function settleSeekWaiters(): void {
    for (const resolve of seekWaiters) {
      resolve();
    }
    seekWaiters.clear();
  }

  function noteProgress(): void {
    updateDurationFromMediaElement();
    const currentTime = mediaElement.currentTime;
    if (
      Number.isFinite(currentTime) &&
      currentTime > lastObservedTimeSec + 0.02
    ) {
      hasPlayed = true;
      lastObservedTimeSec = currentTime;
      clearStallTimer();
      setBuffering(false);
    } else if (hasRecoveryEvidence()) {
      clearBufferingWithEvidence();
    }
    events.onProgress?.();
  }

  listen("loadstart", () => {
    clearStallTimer();
    setBuffering(false);
  });
  listen("loadedmetadata", () => {
    updateDurationFromMediaElement();
    settleReadyWaiters();
    events.onProgress?.();
  });
  listen("durationchange", updateDurationFromMediaElement);
  listen("loadeddata", clearBufferingWithEvidence);
  listen("canplay", () => {
    clearBufferingWithEvidence();
    settleReadyWaiters();
    events.onProgress?.();
  });
  listen("canplaythrough", clearBufferingWithEvidence);
  listen("playing", () => {
    hasPlayed = true;
    clearStallTimer();
    setBuffering(false);
  });
  listen("play", clearBufferingWithEvidence);
  listen("pause", () => {
    clearStallTimer();
    setBuffering(false);
  });
  listen("waiting", scheduleStallCheck);
  listen("stalled", scheduleStallCheck);
  listen("seeking", () => {
    clearStallTimer();
    setBuffering(false);
  });
  listen("seeked", () => {
    settleSeekWaiters();
    clearBufferingWithEvidence();
    events.onProgress?.();
  });
  listen("progress", noteProgress);
  listen("timeupdate", noteProgress);
  listen("ended", () => {
    clearStallTimer();
    setBuffering(false);
    void events.onEnded?.();
  });
  listen("error", () => reportError(classifyHtmlMediaError(mediaElement.error)));
  listen("emptied", () => {
    clearStallTimer();
    setBuffering(false);
    settleSeekWaiters();
  });
  listen("abort", () => {
    clearStallTimer();
    setBuffering(false);
    settleSeekWaiters();
  });
  listen("suspend", clearBufferingWithEvidence);

  function clearSource(): void {
    sourceGeneration += 1;
    clearStallTimer();
    setBuffering(false);
    settleSeekWaiters();
    hls?.destroy();
    hls = null;
    mediaElement.pause();
    mediaElement.removeAttribute("src");
    mediaElement.load();
    mediaId = null;
    playbackPermission = "unknown";
    lastError = null;
    durationSec = null;
    hlsIsLive = false;
    mediaRecoveryAttempted = false;
    hasPlayed = false;
    lastObservedTimeSec = 0;
  }

  async function loadMedia(media: SyncMedia | null): Promise<void> {
    if (destroyed) {
      throw new MediaRuntimeError(
        "unknown_media_error",
        "The media adapter has already been destroyed.",
      );
    }

    const replacedError = new MediaRuntimeError(
      "unknown_media_error",
      "Media was replaced before it became ready.",
      { fatal: false },
    );
    rejectReadyWaiters(replacedError);
    clearSource();
    events.onDurationChange?.(null);
    if (!media) {
      return;
    }

    mediaId = media.id;
    const generation = sourceGeneration;
    const runtimeSource = resolveMediaRuntimeSource(media.sourceUrl, media.sourceType);
    if (runtimeSource === "youtube" || media.sourceUrl === null) {
      const error = new MediaRuntimeError(
        "unknown_media_error",
        "The HTML media adapter requires a direct MP4 or HLS URL.",
      );
      reportError(error);
      throw error;
    }
    if (runtimeSource === "hls" && !supportsNativeHls(mediaElement)) {
      if (!hlsFactory.isSupported()) {
        const error = unsupportedHlsRuntimeError();
        reportError(error);
        throw error;
      }

      hls = hlsFactory.create(HLS_RUNTIME_CONFIG);
      hls.on(hlsFactory.errorEvent, (_event, data) => {
        if (destroyed || generation !== sourceGeneration) {
          return;
        }
        const hlsError = classifyHlsError(data as HlsErrorLike);
        if (!hlsError.fatal) {
          return;
        }
        if (
          hlsError.category === "hls_media_error" &&
          !mediaRecoveryAttempted &&
          hls?.recoverMediaError
        ) {
          mediaRecoveryAttempted = true;
          try {
            hls.recoverMediaError();
            return;
          } catch {
            // Fall through to the existing terminal media-error UI.
          }
        }
        reportError(hlsError);
      });
      if (hlsFactory.levelLoadedEvent) {
        hls.on(hlsFactory.levelLoadedEvent, (_event, data) => {
          if (destroyed || generation !== sourceGeneration) {
            return;
          }
          const details =
            typeof data === "object" && data !== null && "details" in data
              ? (data as {
                  details?: { live?: boolean; totalduration?: number };
                }).details
              : undefined;
          if (!details) {
            return;
          }
          hlsIsLive = details.live === true;
          if (hls?.config) {
            hls.config.lowLatencyMode = hlsIsLive;
          }
          updateDurationFromMediaElement();
          if (
            !hlsIsLive &&
            durationSec === null &&
            Number.isFinite(details.totalduration) &&
            (details.totalduration ?? 0) > 0
          ) {
            setDuration(details.totalduration ?? null);
          }
          events.onProgress?.();
        });
      }
      hls.attachMedia(mediaElement);
      hls.loadSource(media.sourceUrl);
    } else {
      mediaElement.src = media.sourceUrl;
      mediaElement.load();
    }

    settleReadyWaiters();
  }

  function waitUntilReady(): Promise<void> {
    if (lastError?.fatal) {
      return Promise.reject(lastError);
    }
    if (isReady()) {
      return Promise.resolve();
    }
    if (destroyed || mediaId === null) {
      return Promise.reject(
        new MediaRuntimeError(
          "unknown_media_error",
          "No active media is available to become ready.",
        ),
      );
    }

    return new Promise<void>((resolve, reject) => {
      readyWaiters.add(Object.freeze({ resolve, reject }));
    });
  }

  function isSeekable(positionSec: number): boolean {
    if (!isReady() || !Number.isFinite(positionSec) || positionSec < 0) {
      return false;
    }
    for (let index = 0; index < mediaElement.seekable.length; index += 1) {
      if (
        positionSec >= Math.max(0, mediaElement.seekable.start(index) - 0.05) &&
        positionSec <= mediaElement.seekable.end(index) + 0.05
      ) {
        return true;
      }
    }
    return false;
  }

  function getSeekableTarget(positionSec: number): number | null {
    if (!isReady() || !Number.isFinite(positionSec) || positionSec < 0) {
      return null;
    }
    if (isSeekable(positionSec)) {
      return positionSec;
    }
    if (!hlsIsLive || mediaElement.seekable.length === 0) {
      return null;
    }
    const firstStart = Math.max(0, mediaElement.seekable.start(0));
    const lastEnd = mediaElement.seekable.end(mediaElement.seekable.length - 1);
    if (!Number.isFinite(firstStart) || !Number.isFinite(lastEnd) || lastEnd <= firstStart) {
      return null;
    }
    return Math.min(Math.max(positionSec, firstStart), Math.max(firstStart, lastEnd - 0.05));
  }

  async function seek(positionSec: number): Promise<void> {
    if (!Number.isFinite(positionSec) || Math.abs(mediaElement.currentTime - positionSec) < 0.01) {
      return;
    }
    clearStallTimer();
    setBuffering(false);
    mediaElement.currentTime = positionSec;
    if (!mediaElement.seeking) {
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
  }

  async function play(): Promise<void> {
    try {
      await mediaElement.play();
      playbackPermission = "allowed";
      if (lastError?.category === "autoplay_permission_blocked") {
        lastError = null;
      }
    } catch (cause) {
      const error = classifyPlayRejection(cause);
      if (error.category === "autoplay_permission_blocked") {
        playbackPermission = "user_gesture_required";
      }
      reportError(error);
      throw error;
    }
  }

  async function startWatching(): Promise<void> {
    await play();
  }

  function destroy(): void {
    if (destroyed) {
      return;
    }
    const error = new MediaRuntimeError(
      "unknown_media_error",
      "The media adapter was destroyed before media became ready.",
      { fatal: false },
    );
    rejectReadyWaiters(error);
    clearSource();
    for (const [eventName, listener] of listeners) {
      mediaElement.removeEventListener(eventName, listener);
    }
    listeners.clear();
    destroyed = true;
  }

  return Object.freeze({
    getMediaId: () => mediaId,
    loadMedia,
    waitUntilReady,
    isReady,
    isSeekable,
    getSeekableTarget,
    isPaused: () => mediaElement.paused,
    getCurrentTime: () => mediaElement.currentTime,
    getDuration: () => durationSec,
    seek,
    play,
    pause: () => mediaElement.pause(),
    getPlaybackRate: () => mediaElement.playbackRate,
    setPlaybackRate: (rate: number) => {
      mediaElement.playbackRate = rate;
    },
    getAvailablePlaybackRates: () => Object.freeze([1]),
    getCapabilities: () => Object.freeze({
      supportsFinePlaybackRateCorrection: true,
      supportsPictureInPicture: true,
      supportsNativeTextTracks: true,
    }),
    startWatching,
    getPlaybackPermission: () => playbackPermission,
    getLastError: () => lastError,
    hasFatalError: () => lastError?.fatal === true,
    getVolume: () => mediaElement.volume,
    setVolume: (volume: number) => {
      mediaElement.volume = Math.min(1, Math.max(0, volume));
    },
    isMuted: () => mediaElement.muted,
    setMuted: (muted: boolean) => {
      mediaElement.muted = muted;
    },
    destroy,
  });
}

export type MediaEndedCoordinator = Readonly<{
  handleEnded: () => Promise<CanonicalPlaybackState | null>;
}>;

export function createMediaEndedCoordinator(options: Readonly<{
  isOwner: boolean;
  roomId: string;
  player: Pick<PlayerSyncAdapter, "getMediaId">;
  getCanonicalPlayback: () => Readonly<{
    status: CanonicalPlaybackState["status"];
    current_media_id: string | null;
    state_version: number;
  }> | null;
  playbackCommands: Pick<PlaybackCommandService, "markEnded">;
}>): MediaEndedCoordinator {
  let inFlight: Promise<CanonicalPlaybackState | null> | null = null;
  let lastAttemptedKey: string | null = null;

  return Object.freeze({
    async handleEnded() {
      const state = options.getCanonicalPlayback();
      if (
        !options.isOwner ||
        !state ||
        state.status !== "playing" ||
        state.current_media_id === null ||
        state.current_media_id !== options.player.getMediaId()
      ) {
        return null;
      }

      const attemptKey = `${state.current_media_id}:${state.state_version}`;
      if (lastAttemptedKey === attemptKey) {
        return inFlight;
      }
      lastAttemptedKey = attemptKey;

      // Local ended never selects the next item. Owners may only mark this
      // exact canonical version ended through the authoritative RPC.
      inFlight = options.playbackCommands
        .markEnded(options.roomId, state.state_version)
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
  });
}
