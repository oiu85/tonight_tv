// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createYouTubeMediaPlayerAdapter } from "../../src/lib/media/youtube-media-adapter";
import {
  YOUTUBE_PLAYER_STATE,
  type YouTubeIframeApi,
  type YouTubePlayer,
  type YouTubePlayerOptions,
} from "../../src/lib/media/youtube-iframe-api";
import type { SyncMedia } from "../../src/lib/sync/sync-core";

const media: SyncMedia = {
  id: "22222222-2222-4222-8222-222222222222",
  roomId: "11111111-1111-4111-8111-111111111111",
  title: "YouTube fixture",
  sourceUrl: null,
  sourceType: "youtube",
  youtubeVideoId: "dQw4w9WgXcQ",
};

function createYouTubeFixture() {
  let options: YouTubePlayerOptions | null = null;
  let currentTime = 0;
  let playbackRate = 1;
  let volume = 100;
  let muted = false;

  const player: YouTubePlayer = {
    cueVideoById: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    seekTo: vi.fn((seconds) => { currentTime = seconds; }),
    getCurrentTime: vi.fn(() => currentTime),
    getDuration: vi.fn(() => 180),
    getPlayerState: vi.fn(() => YOUTUBE_PLAYER_STATE.CUED),
    getPlaybackRate: vi.fn(() => playbackRate),
    setPlaybackRate: vi.fn((rate) => { playbackRate = rate; }),
    getAvailablePlaybackRates: vi.fn(() => [0.5, 1, 1.5, 2]),
    getVolume: vi.fn(() => volume),
    setVolume: vi.fn((next) => { volume = next; }),
    isMuted: vi.fn(() => muted),
    mute: vi.fn(() => { muted = true; }),
    unMute: vi.fn(() => { muted = false; }),
    setSize: vi.fn(),
    destroy: vi.fn(),
  };

  class PlayerConstructor {
    constructor(_element: HTMLElement, nextOptions: YouTubePlayerOptions) {
      options = nextOptions;
      queueMicrotask(() => nextOptions.events.onReady({ target: player, data: 0 }));
      return player;
    }
  }

  const api = { Player: PlayerConstructor } as unknown as YouTubeIframeApi;
  return {
    api,
    player,
    getOptions: () => options,
  };
}

describe("YouTube media adapter", () => {
  it("loads, becomes ready, and exposes the shared playback controls", async () => {
    const fixture = createYouTubeFixture();
    const onReady = vi.fn();
    const adapter = createYouTubeMediaPlayerAdapter(document.createElement("div"), {
      loadApi: vi.fn(async () => fixture.api),
      events: { onReady },
    });

    await adapter.loadMedia(media);
    const options = fixture.getOptions();
    expect(options).not.toBeNull();
    expect(fixture.player.mute).toHaveBeenCalled();
    expect(fixture.player.pauseVideo).toHaveBeenCalled();
    expect(fixture.player.cueVideoById).toHaveBeenCalledWith({
      videoId: media.youtubeVideoId,
      startSeconds: 0,
    });
    expect(options?.playerVars.rel).toBe(0);
    expect(options?.playerVars.controls).toBe(0);
    expect(options?.playerVars.iv_load_policy).toBe(3);
    expect(options?.width).toBe("1280");
    expect(options?.height).toBe("720");
    expect(fixture.player.setSize).toHaveBeenCalled();

    await expect(adapter.waitUntilReady()).resolves.toBeUndefined();
    expect(adapter.isReady()).toBe(true);
    expect(onReady).toHaveBeenCalledOnce();

    await adapter.play();
    adapter.pause();
    const seek = adapter.seek(45);
    options?.events.onStateChange({ target: fixture.player, data: YOUTUBE_PLAYER_STATE.PAUSED });
    await seek;
    adapter.setPlaybackRate(1.5);
    adapter.setVolume(0.35);
    adapter.setMuted(true);

    expect(fixture.player.playVideo).toHaveBeenCalledOnce();
    expect(fixture.player.pauseVideo).toHaveBeenCalled();
    expect(fixture.player.seekTo).toHaveBeenCalledWith(45, true);
    expect(adapter.getCurrentTime()).toBe(45);
    expect(adapter.getDuration()).toBe(180);
    expect(adapter.getPlaybackRate()).toBe(1.5);
    expect(adapter.getVolume()).toBe(0.35);
    expect(adapter.isMuted()).toBe(true);

    adapter.destroy();
    expect(fixture.player.destroy).toHaveBeenCalledOnce();
  });

  it("rejects invalid YouTube media before constructing a player", async () => {
    const loadApi = vi.fn();
    const adapter = createYouTubeMediaPlayerAdapter(document.createElement("div"), { loadApi });

    await expect(adapter.loadMedia({ ...media, youtubeVideoId: "bad" })).rejects.toMatchObject({
      category: "youtube_invalid_video_id",
    });
    expect(loadApi).not.toHaveBeenCalled();
  });

  it("extracts a YouTube video ID from the watch URL when the snapshot omits it", async () => {
    const fixture = createYouTubeFixture();
    const adapter = createYouTubeMediaPlayerAdapter(document.createElement("div"), {
      loadApi: vi.fn(async () => fixture.api),
    });

    await adapter.loadMedia({
      ...media,
      youtubeVideoId: null,
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(fixture.player.cueVideoById).toHaveBeenCalledWith({
      videoId: "dQw4w9WgXcQ",
      startSeconds: 0,
    });
    adapter.destroy();
  });

  it("seeks off the last frame when a video ends so related videos are not shown", async () => {
    const fixture = createYouTubeFixture();
    const onEnded = vi.fn();
    const adapter = createYouTubeMediaPlayerAdapter(document.createElement("div"), {
      loadApi: vi.fn(async () => fixture.api),
      events: { onEnded },
    });

    await adapter.loadMedia(media);
    const options = fixture.getOptions();
    vi.mocked(fixture.player.seekTo).mockClear();
    vi.mocked(fixture.player.pauseVideo).mockClear();
    options?.events.onStateChange({
      target: fixture.player,
      data: YOUTUBE_PLAYER_STATE.ENDED,
    });

    expect(onEnded).toHaveBeenCalledOnce();
    expect(fixture.player.seekTo).toHaveBeenCalledWith(179.65, true);
    expect(fixture.player.pauseVideo).toHaveBeenCalled();
    adapter.destroy();
  });
});
