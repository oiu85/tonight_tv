"use client";

import type { PlayerCapabilities, PlayerSyncAdapter, SyncMedia } from "../sync/sync-core";
import {
  resolveTorrentPlaybackSource,
  TorrentClientError,
} from "../torrent/torrent-client";
import {
  createHtmlMediaPlayerAdapter,
  type HtmlMediaAdapterEvents,
  type HtmlMediaPlayerAdapter,
  type PlaybackPermission,
} from "./html-media-adapter";
import { MediaRuntimeError } from "./media-source";
import {
  createYouTubeMediaPlayerAdapter,
  type YouTubeMediaPlayerAdapter,
} from "./youtube-media-adapter";

export type RoomMediaPlayerAdapter = PlayerSyncAdapter &
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

export function createRoomMediaPlayerAdapter(
  videoElement: HTMLVideoElement,
  youtubeMount: HTMLElement,
  events: HtmlMediaAdapterEvents = {},
): RoomMediaPlayerAdapter {
  let currentMedia: SyncMedia | null = null;
  let activeTimelineOffsetSec = 0;
  let resolvedDurationSec: number | null = null;
  let loadGeneration = 0;
  let loadAbort: AbortController | null = null;
  let recoveringTorrent = false;

  const html = createHtmlMediaPlayerAdapter(videoElement, {
    events: {
      ...events,
      onReady: () => {
        recoveringTorrent = false;
        events.onReady?.();
      },
      onDurationChange: (durationSec) => {
        events.onDurationChange?.(
          durationSec === null
            ? resolvedDurationSec
            : durationSec + activeTimelineOffsetSec,
        );
      },
      onError: (error) => {
        const recoverable =
          currentMedia?.sourceType === "torrent" &&
          error.fatal &&
          (error.category === "expired_url_suspected" ||
            error.category === "network_source_unreachable" ||
            error.category === "hls_manifest_error");
        if (recoverable && !recoveringTorrent && currentMedia) {
          recoveringTorrent = true;
          void loadMedia(currentMedia).catch((cause) => {
            recoveringTorrent = false;
            events.onError?.(
              cause instanceof MediaRuntimeError
                ? cause
                : new MediaRuntimeError(
                    "stream_expired",
                    "The Torrent stream could not be refreshed.",
                    { cause },
                  ),
            );
          });
          return;
        }
        events.onError?.(error);
      },
    },
  });
  let youtube: YouTubeMediaPlayerAdapter | null = null;
  let active: HtmlMediaPlayerAdapter | YouTubeMediaPlayerAdapter = html;
  let volume = videoElement.volume;
  let muted = videoElement.muted;
  let destroyed = false;

  function createYouTube(): YouTubeMediaPlayerAdapter {
    const playerMount = document.createElement("div");
    playerMount.className = "tt-youtube-player";
    youtubeMount.replaceChildren(playerMount);
    const adapter = createYouTubeMediaPlayerAdapter(playerMount, { events });
    adapter.setVolume(volume);
    adapter.setMuted(muted);
    return adapter;
  }

  function destroyYouTube(): void {
    youtube?.destroy();
    youtube = null;
    youtubeMount.replaceChildren();
  }

  async function loadMedia(media: SyncMedia | null): Promise<void> {
    if (destroyed) {
      throw new MediaRuntimeError(
        "unknown_media_error",
        "The room media adapter has already been destroyed.",
      );
    }

    const generation = ++loadGeneration;
    loadAbort?.abort();
    loadAbort = null;
    currentMedia = media;
    activeTimelineOffsetSec = 0;
    resolvedDurationSec = null;

    if (media?.sourceType === "youtube") {
      await html.loadMedia(null);
      youtube ??= createYouTube();
      active = youtube;
      await youtube.loadMedia(media);
      return;
    }

    if (media?.sourceType === "torrent") {
      if (!media.roomId) {
        throw new MediaRuntimeError(
          "invalid_torrent",
          "The room identity required to resolve this Torrent is missing.",
        );
      }
      if (youtube) destroyYouTube();
      active = html;
      await html.loadMedia(null);
      const abort = new AbortController();
      loadAbort = abort;
      try {
        const resolved = await resolveTorrentPlaybackSource(
          media.roomId,
          media.id,
          abort.signal,
        );
        if (destroyed || generation !== loadGeneration || currentMedia !== media) {
          return;
        }
        activeTimelineOffsetSec = resolved.timelineOffsetSec;
        resolvedDurationSec = resolved.durationSec ?? resolved.probe?.durationSec ?? null;
        await html.loadMedia({
          ...media,
          sourceUrl: resolved.url,
          sourceType: resolved.kind === "hls" ? "hls" : "mp4",
        });
        return;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        const error = cause instanceof TorrentClientError
          ? new MediaRuntimeError(cause.category, cause.message, { cause })
          : cause instanceof MediaRuntimeError
            ? cause
            : new MediaRuntimeError(
                "gateway_unavailable",
                "The Torrent Gateway could not prepare this media.",
                { cause },
              );
        events.onError?.(error);
        throw error;
      } finally {
        if (loadAbort === abort) loadAbort = null;
      }
    }

    if (youtube) {
      destroyYouTube();
    }
    active = html;
    await html.loadMedia(media);
  }

  function setVolume(nextVolume: number): void {
    volume = Math.min(1, Math.max(0, nextVolume));
    html.setVolume(volume);
    youtube?.setVolume(volume);
  }

  function setMuted(nextMuted: boolean): void {
    muted = nextMuted;
    html.setMuted(muted);
    youtube?.setMuted(muted);
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    loadGeneration += 1;
    loadAbort?.abort();
    loadAbort = null;
    destroyYouTube();
    html.destroy();
  }

  return Object.freeze({
    getMediaId: () => active.getMediaId(),
    loadMedia,
    waitUntilReady: () => active.waitUntilReady(),
    isReady: () => active.isReady(),
    isSeekable: (positionSec: number) =>
      active.isSeekable(Math.max(0, positionSec - activeTimelineOffsetSec)),
    getSeekableTarget: (positionSec: number) => {
      const localPosition = Math.max(0, positionSec - activeTimelineOffsetSec);
      const localTarget = active.getSeekableTarget
        ? active.getSeekableTarget(localPosition)
        : active.isSeekable(localPosition)
          ? localPosition
          : null;
      return localTarget === null ? null : localTarget + activeTimelineOffsetSec;
    },
    isPaused: () => active.isPaused(),
    getCurrentTime: () => active.getCurrentTime() + activeTimelineOffsetSec,
    getDuration: () => {
      const runtimeDurationSec = active.getDuration();
      return runtimeDurationSec === null
        ? resolvedDurationSec
        : runtimeDurationSec + activeTimelineOffsetSec;
    },
    seek: (positionSec: number) =>
      active.seek(Math.max(0, positionSec - activeTimelineOffsetSec)),
    play: () => active.play(),
    pause: () => active.pause(),
    getPlaybackRate: () => active.getPlaybackRate(),
    setPlaybackRate: (rate: number) => active.setPlaybackRate(rate),
    getAvailablePlaybackRates: () => active.getAvailablePlaybackRates(),
    getCapabilities: (): PlayerCapabilities => active.getCapabilities(),
    startWatching: () => active.startWatching(),
    getPlaybackPermission: () => active.getPlaybackPermission(),
    getLastError: () => active.getLastError(),
    hasFatalError: () => active.getLastError()?.fatal === true,
    getVolume: () => volume,
    setVolume,
    isMuted: () => muted,
    setMuted,
    destroy,
  });
}
