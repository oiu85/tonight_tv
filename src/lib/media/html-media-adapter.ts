"use client";

import Hls from "hls.js";

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
const NATIVE_HLS_MIME_TYPES = [
  "application/vnd.apple.mpegurl",
  "application/x-mpegURL",
] as const;

export type PlaybackPermission = "unknown" | "allowed" | "user_gesture_required";

export type HlsRuntime = Readonly<{
  attachMedia: (media: HTMLMediaElement) => void;
  loadSource: (sourceUrl: string) => void;
  on: (event: string, listener: (event: string, data: HlsErrorLike) => void) => void;
  destroy: () => void;
}>;

export type HlsRuntimeFactory = Readonly<{
  isSupported: () => boolean;
  create: () => HlsRuntime;
  errorEvent: string;
}>;

export type HtmlMediaAdapterEvents = Readonly<{
  onReady?: () => void;
  onBufferingChange?: (buffering: boolean) => void;
  onEnded?: () => void | Promise<void>;
  onError?: (error: MediaRuntimeError) => void;
}>;

export type HtmlMediaPlayerAdapter = PlayerSyncAdapter &
  Readonly<{
    startWatching: () => Promise<void>;
    getPlaybackPermission: () => PlaybackPermission;
    getLastError: () => MediaRuntimeError | null;
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
  create: () => new Hls() as unknown as HlsRuntime,
  errorEvent: Hls.Events.ERROR,
});

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
  let destroyed = false;
  let playbackPermission: PlaybackPermission = "unknown";
  let lastError: MediaRuntimeError | null = null;

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

  function rejectReadyWaiters(error: MediaRuntimeError): void {
    for (const waiter of readyWaiters) {
      waiter.reject(error);
    }
    readyWaiters.clear();
  }

  function reportError(error: MediaRuntimeError): void {
    lastError = error;
    if (error.fatal) {
      rejectReadyWaiters(error);
    }
    events.onError?.(error);
  }

  function listen(eventName: string, listener: EventListener): void {
    mediaElement.addEventListener(eventName, listener);
    listeners.set(eventName, listener);
  }

  listen("loadedmetadata", settleReadyWaiters);
  listen("canplay", () => {
    events.onBufferingChange?.(false);
    settleReadyWaiters();
  });
  listen("playing", () => events.onBufferingChange?.(false));
  listen("waiting", () => events.onBufferingChange?.(true));
  listen("stalled", () => events.onBufferingChange?.(true));
  listen("ended", () => {
    void events.onEnded?.();
  });
  listen("error", () => reportError(classifyHtmlMediaError(mediaElement.error)));

  function clearSource(): void {
    hls?.destroy();
    hls = null;
    mediaElement.pause();
    mediaElement.removeAttribute("src");
    mediaElement.load();
    mediaId = null;
    playbackPermission = "unknown";
    lastError = null;
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
    if (!media) {
      return;
    }

    mediaId = media.id;
    const runtimeSource = resolveMediaRuntimeSource(media.sourceUrl, media.sourceType);
    if (runtimeSource === "hls" && !supportsNativeHls(mediaElement)) {
      if (!hlsFactory.isSupported()) {
        const error = unsupportedHlsRuntimeError();
        reportError(error);
        throw error;
      }

      hls = hlsFactory.create();
      hls.on(hlsFactory.errorEvent, (_event, data) => {
        reportError(classifyHlsError(data));
      });
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
    isPaused: () => mediaElement.paused,
    getCurrentTime: () => mediaElement.currentTime,
    getDuration: () =>
      Number.isFinite(mediaElement.duration) && mediaElement.duration >= 0
        ? mediaElement.duration
        : null,
    seek: (positionSec: number) => {
      mediaElement.currentTime = positionSec;
    },
    play,
    pause: () => mediaElement.pause(),
    getPlaybackRate: () => mediaElement.playbackRate,
    setPlaybackRate: (rate: number) => {
      mediaElement.playbackRate = rate;
    },
    startWatching,
    getPlaybackPermission: () => playbackPermission,
    getLastError: () => lastError,
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
  getCanonicalPlayback: () => CanonicalPlaybackState | null;
  playbackCommands: Pick<PlaybackCommandService, "markEnded">;
}>): MediaEndedCoordinator {
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

      // Local ended never selects the next item. Owners may only mark this
      // exact canonical version ended through the authoritative RPC.
      return options.playbackCommands.markEnded(
        options.roomId,
        state.state_version,
      );
    },
  });
}
