"use client";

import type { PlayerCapabilities, PlayerSyncAdapter, SyncMedia } from "../sync/sync-core";
import {
  createHtmlMediaPlayerAdapter,
  type HtmlMediaAdapterEvents,
  type HtmlMediaPlayerAdapter,
  type PlaybackPermission,
} from "./html-media-adapter";
import { MediaRuntimeError } from "./media-source";
import type { YouTubeMediaPlayerAdapter } from "./youtube-media-adapter";
import type { WebtorMediaPlayerAdapter } from "../torrent/infrastructure/webtor/media-player-adapter";
import type { LocalP2pMediaPlayerAdapter } from "./local-p2p-media-adapter";

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
  webtorMount: HTMLElement,
  events: HtmlMediaAdapterEvents = {},
  localP2pOptions?: Readonly<{ roomId: string; isOwner: boolean }>,
): RoomMediaPlayerAdapter {
  let currentMedia: SyncMedia | null = null;
  let activeTimelineOffsetSec = 0;
  let resolvedDurationSec: number | null = null;
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
  let webtor: WebtorMediaPlayerAdapter | null = null;
  let localP2p: LocalP2pMediaPlayerAdapter | null = null;
  let active: HtmlMediaPlayerAdapter | YouTubeMediaPlayerAdapter | WebtorMediaPlayerAdapter | LocalP2pMediaPlayerAdapter = html;
  let volume = videoElement.volume;
  let muted = videoElement.muted;
  let destroyed = false;

  async function createYouTube(): Promise<YouTubeMediaPlayerAdapter> {
    const { createYouTubeMediaPlayerAdapter } = await import("./youtube-media-adapter");
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

  async function createWebtor(): Promise<WebtorMediaPlayerAdapter> {
    const { createWebtorMediaPlayerAdapter } = await import("../torrent/infrastructure/webtor/media-player-adapter");
    webtorMount.replaceChildren();
    const adapter = createWebtorMediaPlayerAdapter({ mount: webtorMount, events });
    adapter.setVolume(volume);
    adapter.setMuted(muted);
    return adapter;
  }

  function destroyWebtor(): void {
    webtor?.destroy();
    webtor = null;
    webtorMount.replaceChildren();
  }

  async function createLocalP2p(): Promise<LocalP2pMediaPlayerAdapter> {
    if (!localP2pOptions) {
      throw new MediaRuntimeError("p2p_stream_failed", "The room is missing its device-stream context.");
    }
    const { createLocalP2pMediaPlayerAdapter } = await import("./local-p2p-media-adapter");
    const adapter = createLocalP2pMediaPlayerAdapter({
      mediaElement: videoElement,
      roomId: localP2pOptions.roomId,
      isOwner: localP2pOptions.isOwner,
      events,
    });
    adapter.setVolume(volume);
    adapter.setMuted(muted);
    return adapter;
  }

  function destroyLocalP2p(): void {
    localP2p?.destroy();
    localP2p = null;
  }

  async function loadMedia(media: SyncMedia | null): Promise<void> {
    if (destroyed) {
      throw new MediaRuntimeError(
        "unknown_media_error",
        "The room media adapter has already been destroyed.",
      );
    }

    currentMedia = media;
    activeTimelineOffsetSec = 0;
    resolvedDurationSec = null;

    if (media?.sourceType === "youtube") {
      destroyLocalP2p();
      await html.loadMedia(null);
      destroyWebtor();
      youtube ??= await createYouTube();
      active = youtube;
      await youtube.loadMedia(media);
      return;
    }

    if (media?.sourceType === "torrent") {
      destroyLocalP2p();
      destroyYouTube();
      webtor ??= await createWebtor();
      active = webtor;
      await html.loadMedia(null);
      await webtor.loadMedia(media);
      return;
    }

    if (media?.sourceType === "local_p2p") {
      destroyYouTube();
      destroyWebtor();
      await html.loadMedia(null);
      localP2p ??= await createLocalP2p();
      active = localP2p;
      await localP2p.loadMedia(media);
      return;
    }

    destroyLocalP2p();
    destroyWebtor();
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
    webtor?.setVolume(volume);
    localP2p?.setVolume(volume);
  }

  function setMuted(nextMuted: boolean): void {
    muted = nextMuted;
    html.setMuted(muted);
    youtube?.setMuted(muted);
    webtor?.setMuted(muted);
    localP2p?.setMuted(muted);
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    destroyYouTube();
    destroyWebtor();
    destroyLocalP2p();
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
