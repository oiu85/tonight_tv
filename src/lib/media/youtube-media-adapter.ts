import {
  BUFFERING_GRACE_MS,
  type HtmlMediaAdapterEvents,
  type PlaybackPermission,
} from "./html-media-adapter";
import {
  classifyYouTubeError,
  MediaRuntimeError,
} from "./media-source";
import type { PlayerSyncAdapter, SyncMedia } from "../sync/sync-core";
import { extractYouTubeVideoId } from "./youtube-identity";
import {
  loadYouTubeIframeApi,
  YOUTUBE_PLAYER_STATE,
  type YouTubeIframeApi,
  type YouTubePlayer,
} from "./youtube-iframe-api";

export { extractYouTubeVideoId, isValidYouTubeVideoId } from "./youtube-identity";

type ReadyWaiter = Readonly<{
  resolve: () => void;
  reject: (error: MediaRuntimeError) => void;
}>;

export type YouTubeMediaPlayerAdapter = PlayerSyncAdapter &
  Readonly<{
    startWatching: () => Promise<void>;
    getPlaybackPermission: () => PlaybackPermission;
    getLastError: () => MediaRuntimeError | null;
    getVolume: () => number;
    setVolume: (volume: number) => void;
    isMuted: () => boolean;
    setMuted: (muted: boolean) => void;
    destroy: () => void;
  }>;

export type YouTubeMediaAdapterOptions = Readonly<{
  events?: HtmlMediaAdapterEvents;
  loadApi?: () => Promise<YouTubeIframeApi>;
}>;

export function createYouTubeMediaPlayerAdapter(
  mountElement: HTMLElement,
  options: YouTubeMediaAdapterOptions = {},
): YouTubeMediaPlayerAdapter {
  const events = options.events ?? {};
  const loadApi = options.loadApi ?? loadYouTubeIframeApi;
  const readyWaiters = new Set<ReadyWaiter>();

  let player: YouTubePlayer | null = null;
  let mediaId: string | null = null;
  let youtubeVideoId: string | null = null;
  let playerReady = false;
  let mediaReady = false;
  let destroyed = false;
  let state = YOUTUBE_PLAYER_STATE.UNSTARTED as number;
  let playbackPermission: PlaybackPermission = "unknown";
  let lastError: MediaRuntimeError | null = null;
  let playerPromise: Promise<YouTubePlayer> | null = null;
  let hasPlayed = false;
  let buffering = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  const seekWaiters = new Set<() => void>();
  const layoutRoot = mountElement.parentElement ?? mountElement;
  let resizeObserver: ResizeObserver | null = null;
  let suppressingEndScreen = false;

  function measurePlayerBox(): { width: number; height: number } {
    const rect = layoutRoot.getBoundingClientRect();
    const width = Math.round(rect.width || layoutRoot.clientWidth || 0);
    const height = Math.round(rect.height || layoutRoot.clientHeight || 0);
    if (width < 64 || height < 36) {
      return { width: 1280, height: 720 };
    }
    return { width, height };
  }

  function syncPlayerSize(target: YouTubePlayer | null = player): void {
    if (!target?.setSize) return;
    const { width, height } = measurePlayerBox();
    target.setSize(width, height);
  }

  function observePlayerSize(): void {
    if (resizeObserver || typeof ResizeObserver === "undefined") return;
    resizeObserver = new ResizeObserver(() => {
      syncPlayerSize();
    });
    resizeObserver.observe(layoutRoot);
  }

  function clearStallTimer(): void {
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  }

  function setBuffering(nextBuffering: boolean): void {
    if (buffering === nextBuffering) return;
    buffering = nextBuffering;
    events.onBufferingChange?.(nextBuffering);
  }

  function settleSeekWaiters(): void {
    for (const resolve of seekWaiters) resolve();
    seekWaiters.clear();
  }

  function isReady(): boolean {
    return !destroyed && playerReady && mediaReady && mediaId !== null;
  }

  function settleReadyWaiters(): void {
    if (!isReady()) return;
    for (const waiter of readyWaiters) waiter.resolve();
    readyWaiters.clear();
    events.onReady?.();
  }

  function rejectReadyWaiters(error: MediaRuntimeError): void {
    for (const waiter of readyWaiters) waiter.reject(error);
    readyWaiters.clear();
  }

  function reportError(error: MediaRuntimeError): void {
    lastError = error;
    if (error.fatal) rejectReadyWaiters(error);
    events.onError?.(error);
  }

  function handleStateChange(nextState: number): void {
    if (destroyed) return;
    state = nextState;
    if (
      nextState === YOUTUBE_PLAYER_STATE.CUED ||
      nextState === YOUTUBE_PLAYER_STATE.PLAYING ||
      nextState === YOUTUBE_PLAYER_STATE.PAUSED ||
      nextState === YOUTUBE_PLAYER_STATE.BUFFERING ||
      nextState === YOUTUBE_PLAYER_STATE.ENDED
    ) {
      mediaReady = mediaId !== null;
      settleReadyWaiters();
    }

    if (nextState === YOUTUBE_PLAYER_STATE.PLAYING) {
      hasPlayed = true;
      playbackPermission = "allowed";
      if (lastError?.category === "autoplay_permission_blocked") lastError = null;
      clearStallTimer();
      setBuffering(false);
      settleSeekWaiters();
    } else if (nextState === YOUTUBE_PLAYER_STATE.BUFFERING) {
      clearStallTimer();
      if (hasPlayed) {
        stallTimer = setTimeout(() => {
          stallTimer = null;
          if (state === YOUTUBE_PLAYER_STATE.BUFFERING) {
            setBuffering(true);
          }
        }, BUFFERING_GRACE_MS);
      }
    } else if (
      nextState === YOUTUBE_PLAYER_STATE.PAUSED ||
      nextState === YOUTUBE_PLAYER_STATE.CUED ||
      nextState === YOUTUBE_PLAYER_STATE.ENDED
    ) {
      clearStallTimer();
      setBuffering(false);
      settleSeekWaiters();
    }
    events.onProgress?.();

    if (nextState === YOUTUBE_PLAYER_STATE.ENDED) {
      suppressRelatedVideos();
      void events.onEnded?.();
    }
  }

  function suppressRelatedVideos(): void {
    if (!player || suppressingEndScreen) return;
    const duration = player.getDuration();
    suppressingEndScreen = true;
    player.mute();
    if (Number.isFinite(duration) && duration > 0.5) {
      player.seekTo(Math.max(0, duration - 0.35), true);
    }
    player.pauseVideo();
  }

  function createPlayer(api: YouTubeIframeApi): Promise<YouTubePlayer> {
    return new Promise<YouTubePlayer>((resolve, reject) => {
      let instance: YouTubePlayer;
      try {
        const { width, height } = measurePlayerBox();
        instance = new api.Player(mountElement, {
          width: String(width),
          height: String(height),
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            iv_load_policy: 3,
            origin: window.location.origin,
            widget_referrer: window.location.origin,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: (event) => {
              if (destroyed) {
                event.target.destroy();
                return;
              }
              player = event.target;
              playerReady = true;
              observePlayerSize();
              syncPlayerSize(event.target);
              resolve(event.target);
            },
            onStateChange: (event) => handleStateChange(event.data),
            onPlaybackRateChange: () => undefined,
            onError: (event) => {
              mediaReady = false;
              reportError(classifyYouTubeError(event.data));
            },
            onAutoplayBlocked: () => {
              playbackPermission = "user_gesture_required";
              reportError(
                new MediaRuntimeError(
                  "autoplay_permission_blocked",
                  "The room is playing, but this browser requires a user gesture before YouTube can play.",
                  { fatal: false },
                ),
              );
            },
          },
        });
        player = instance;
      } catch (cause) {
        reject(
          new MediaRuntimeError(
            "youtube_playback_error",
            "The YouTube player could not be created.",
            { cause },
          ),
        );
      }
    });
  }

  async function ensurePlayer(): Promise<YouTubePlayer> {
    if (destroyed) {
      throw new MediaRuntimeError(
        "youtube_playback_error",
        "The YouTube player has already been destroyed.",
      );
    }
    if (playerReady && player) return player;
    playerPromise ??= loadApi()
      .then(createPlayer)
      .catch((cause) => {
        playerPromise = null;
        const error =
          cause instanceof MediaRuntimeError
            ? cause
            : new MediaRuntimeError(
                "youtube_playback_error",
                "The YouTube IFrame API could not be loaded.",
                { cause },
              );
        reportError(error);
        throw error;
      });
    return playerPromise;
  }

  async function loadMedia(media: SyncMedia | null): Promise<void> {
    const replacedError = new MediaRuntimeError(
      "youtube_playback_error",
      "The YouTube video was replaced before it became ready.",
      { fatal: false },
    );
    rejectReadyWaiters(replacedError);
    mediaReady = false;
    lastError = null;
    state = YOUTUBE_PLAYER_STATE.UNSTARTED;
    playbackPermission = "unknown";
    hasPlayed = false;
    suppressingEndScreen = false;
    clearStallTimer();
    setBuffering(false);
    settleSeekWaiters();
    events.onDurationChange?.(null);

    if (!media) {
      mediaId = null;
      youtubeVideoId = null;
      player?.pauseVideo();
      return;
    }
    const nextVideoId =
      extractYouTubeVideoId(media.youtubeVideoId) ??
      extractYouTubeVideoId(media.sourceUrl) ??
      "";
    if (media.sourceType !== "youtube" || !nextVideoId) {
      const error = classifyYouTubeError(2);
      reportError(error);
      throw error;
    }

    mediaId = media.id;
    youtubeVideoId = nextVideoId;
    const activePlayer = await ensurePlayer();
    if (destroyed || mediaId !== media.id || youtubeVideoId !== nextVideoId) return;
    activePlayer.mute();
    activePlayer.pauseVideo();
    activePlayer.cueVideoById({ videoId: nextVideoId, startSeconds: 0 });
    syncPlayerSize(activePlayer);
    // cueVideoById often never emits CUED until play. The iframe is already
    // commandable after onReady, so the room must not wait on that event.
    mediaReady = true;
    settleReadyWaiters();
  }

  function waitUntilReady(): Promise<void> {
    if (lastError?.fatal) return Promise.reject(lastError);
    if (isReady()) return Promise.resolve();
    if (destroyed || mediaId === null) {
      return Promise.reject(
        new MediaRuntimeError(
          "youtube_playback_error",
          "No YouTube video is available to become ready.",
        ),
      );
    }
    return new Promise<void>((resolve, reject) => {
      readyWaiters.add(Object.freeze({ resolve, reject }));
    });
  }

  function getAvailablePlaybackRates(): readonly number[] {
    if (!playerReady || !player) return Object.freeze([1]);
    const rates = player.getAvailablePlaybackRates();
    return Object.freeze(
      rates.filter((rate) => Number.isFinite(rate) && rate > 0),
    );
  }

  async function play(): Promise<void> {
    const activePlayer = await ensurePlayer();
    activePlayer.playVideo();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    resizeObserver?.disconnect();
    resizeObserver = null;
    clearStallTimer();
    setBuffering(false);
    settleSeekWaiters();
    rejectReadyWaiters(
      new MediaRuntimeError(
        "youtube_playback_error",
        "The YouTube player was destroyed before the video became ready.",
        { fatal: false },
      ),
    );
    player?.destroy();
    player = null;
    playerPromise = null;
    playerReady = false;
    mediaReady = false;
    mediaId = null;
    youtubeVideoId = null;
  }

  return Object.freeze({
    getMediaId: () => mediaId,
    loadMedia,
    waitUntilReady,
    isReady,
    isSeekable: (positionSec: number) => {
      if (!isReady() || !Number.isFinite(positionSec) || positionSec < 0) return false;
      const duration = player?.getDuration() ?? 0;
      return duration > 0 && positionSec <= duration + 0.05;
    },
    getSeekableTarget: (positionSec: number) => {
      if (!isReady() || !Number.isFinite(positionSec) || positionSec < 0) return null;
      const duration = player?.getDuration() ?? 0;
      return duration > 0 && positionSec <= duration + 0.05
        ? Math.min(positionSec, duration)
        : null;
    },
    isPaused: () =>
      state !== YOUTUBE_PLAYER_STATE.PLAYING &&
      state !== YOUTUBE_PLAYER_STATE.BUFFERING,
    getCurrentTime: () => {
      const currentPlayer = player as (YouTubePlayer & { getCurrentTime?: unknown }) | null;
      return typeof currentPlayer?.getCurrentTime === "function"
        ? Number(currentPlayer.getCurrentTime()) || 0
        : 0;
    },
    getDuration: () => {
      const duration = player?.getDuration() ?? 0;
      return Number.isFinite(duration) && duration > 0 ? duration : null;
    },
    seek: async (positionSec: number) => {
      if (!player || Math.abs(player.getCurrentTime() - positionSec) < 0.01) return;
      player.mute();
      player.pauseVideo();
      player.seekTo(positionSec, true);
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
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
    pause: () => player?.pauseVideo(),
    getPlaybackRate: () => player?.getPlaybackRate() ?? 1,
    setPlaybackRate: (rate: number) => {
      if (getAvailablePlaybackRates().some((available) => Math.abs(available - rate) < 0.000_001)) {
        player?.setPlaybackRate(rate);
      }
    },
    getAvailablePlaybackRates,
    getCapabilities: () => Object.freeze({
      supportsFinePlaybackRateCorrection: false,
      supportsPictureInPicture: false,
      supportsNativeTextTracks: false,
    }),
    startWatching: play,
    getPlaybackPermission: () => playbackPermission,
    getLastError: () => lastError,
    getVolume: () => (player?.getVolume() ?? 100) / 100,
    setVolume: (volume: number) => player?.setVolume(Math.round(Math.min(1, Math.max(0, volume)) * 100)),
    isMuted: () => player?.isMuted() ?? false,
    setMuted: (muted: boolean) => {
      if (muted) player?.mute();
      else player?.unMute();
    },
    destroy,
  });
}
