import { describe, expect, it, vi } from "vitest";

import {
  BUFFERING_GRACE_MS,
  createHtmlMediaPlayerAdapter,
  createMediaEndedCoordinator,
  HLS_RUNTIME_CONFIG,
  type HlsRuntime,
  type HlsRuntimeFactory,
} from "../../src/lib/media/html-media-adapter";
import type { CanonicalPlaybackState } from "../../src/lib/playback/playback-command-service";

const roomId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-08-17T12:00:00.000Z";

class FakeTimeRanges implements TimeRanges {
  constructor(private readonly ranges: readonly (readonly [number, number])[]) {}
  get length() {
    return this.ranges.length;
  }
  start(index: number) {
    return this.ranges[index][0];
  }
  end(index: number) {
    return this.ranges[index][1];
  }
}

class FakeMediaElement extends EventTarget {
  src = "";
  currentTime = 0;
  duration = 120;
  playbackRate = 1;
  volume = 1;
  muted = false;
  paused = true;
  readyState = 0;
  seekable: TimeRanges = new FakeTimeRanges([[0, 120]]);
  buffered: TimeRanges = new FakeTimeRanges([]);
  seeking = false;
  ended = false;
  error: MediaError | null = null;
  nativeHls = false;
  readonly load = vi.fn();
  readonly pause = vi.fn(() => {
    this.paused = true;
  });
  readonly play = vi.fn(async () => {
    this.paused = false;
  });

  canPlayType(mimeType: string) {
    return this.nativeHls && mimeType.toLowerCase().includes("mpegurl")
      ? "probably"
      : "";
  }

  removeAttribute(name: string) {
    if (name === "src") {
      this.src = "";
    }
  }
}

function asMediaElement(fake: FakeMediaElement): HTMLMediaElement {
  return fake as unknown as HTMLMediaElement;
}

function media(sourceUrl: string, sourceType: "auto" | "mp4" | "hls" = "auto") {
  return { id: mediaId, title: "Movie", sourceUrl, sourceType, youtubeVideoId: null } as const;
}

function createHlsFake(supported = true) {
  const listeners = new Map<string, (event: string, data: unknown) => void>();
  const runtime = {
    attachMedia: vi.fn(),
    loadSource: vi.fn(),
    on: vi.fn((event: string, listener: (event: string, data: unknown) => void) => {
      listeners.set(event, listener);
    }),
    recoverMediaError: vi.fn(),
    config: { lowLatencyMode: false },
    destroy: vi.fn(),
  } as unknown as HlsRuntime;
  const factory: HlsRuntimeFactory = {
    isSupported: () => supported,
    create: vi.fn(() => runtime),
    errorEvent: "hlsError",
    levelLoadedEvent: "levelLoaded",
  };
  return {
    factory,
    runtime,
    emitError(data: { type?: string; details?: string; fatal?: boolean }) {
      listeners.get("hlsError")?.("hlsError", data);
    },
    emitLevelLoaded(data: { details: { live: boolean; totalduration: number } }) {
      listeners.get("levelLoaded")?.("levelLoaded", data);
    },
  };
}

function canonicalState(): CanonicalPlaybackState {
  return {
    room_id: roomId,
    current_media_id: mediaId,
    status: "playing",
    anchor_position_sec: 12,
    anchor_server_time: timestamp,
    state_version: 7,
    updated_at: timestamp,
  };
}

describe("HTML media player adapter", () => {
  it("loads direct MP4, waits for readiness, seeks, rates, and cleans up", async () => {
    const element = new FakeMediaElement();
    const adapter = createHtmlMediaPlayerAdapter(asMediaElement(element));

    await adapter.loadMedia(media("https://media.example.test/movie.mp4", "mp4"));
    expect(element.src).toBe("https://media.example.test/movie.mp4");
    expect(adapter.isReady()).toBe(false);
    const ready = adapter.waitUntilReady();
    element.readyState = 1;
    element.dispatchEvent(new Event("loadedmetadata"));
    await ready;

    expect(adapter.isSeekable(30)).toBe(true);
    await adapter.seek(30);
    adapter.setPlaybackRate(1.03);
    expect(adapter.getCurrentTime()).toBe(30);
    expect(adapter.getPlaybackRate()).toBe(1.03);

    adapter.destroy();
    expect(element.src).toBe("");
    expect(element.pause).toHaveBeenCalled();
  });

  it("uses native HLS when available without constructing hls.js", async () => {
    const element = new FakeMediaElement();
    element.nativeHls = true;
    const hls = createHlsFake();
    const adapter = createHtmlMediaPlayerAdapter(asMediaElement(element), {
      hlsFactory: hls.factory,
    });

    await adapter.loadMedia(media("https://media.example.test/live.m3u8", "hls"));

    expect(element.src).toBe("https://media.example.test/live.m3u8");
    expect(hls.factory.create).not.toHaveBeenCalled();
  });

  it("uses hls.js when native HLS is absent and destroys it on source change", async () => {
    const element = new FakeMediaElement();
    const hls = createHlsFake();
    const onError = vi.fn();
    const adapter = createHtmlMediaPlayerAdapter(asMediaElement(element), {
      hlsFactory: hls.factory,
      events: { onError },
    });

    await adapter.loadMedia(media("https://media.example.test/live.m3u8", "auto"));
    expect(hls.runtime.attachMedia).toHaveBeenCalledWith(element);
    expect(hls.runtime.loadSource).toHaveBeenCalledWith(
      "https://media.example.test/live.m3u8",
    );
    expect(hls.factory.create).toHaveBeenCalledWith(HLS_RUNTIME_CONFIG);
    expect(hls.factory.create).toHaveBeenCalledTimes(1);

    hls.emitError({ type: "mediaError", details: "fragLoadError", fatal: false });
    expect(onError).not.toHaveBeenCalled();

    await adapter.loadMedia(media("https://media.example.test/replacement.mp4", "mp4"));
    expect(hls.runtime.destroy).toHaveBeenCalledOnce();
    expect(element.src).toBe("https://media.example.test/replacement.mp4");
  });

  it("keeps canonical playing intent when autoplay is blocked and exposes startWatching", async () => {
    const element = new FakeMediaElement();
    element.play.mockRejectedValueOnce(
      new DOMException("User gesture required", "NotAllowedError"),
    );
    const adapter = createHtmlMediaPlayerAdapter(asMediaElement(element));

    await expect(adapter.play()).rejects.toMatchObject({
      category: "autoplay_permission_blocked",
      fatal: false,
    });
    expect(adapter.getPlaybackPermission()).toBe("user_gesture_required");
    expect(element.paused).toBe(true);

    await adapter.startWatching();
    expect(adapter.getPlaybackPermission()).toBe("allowed");
    expect(element.paused).toBe(false);
  });

  it("does not turn startup or a brief waiting event into visible buffering", async () => {
    vi.useFakeTimers();
    const element = new FakeMediaElement();
    const onBufferingChange = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const adapter = createHtmlMediaPlayerAdapter(asMediaElement(element), {
      events: { onBufferingChange },
    });

    await adapter.loadMedia(media("https://media.example.test/watch/opaque", "auto"));
    element.readyState = 2;
    element.dispatchEvent(new Event("waiting"));
    await vi.advanceTimersByTimeAsync(BUFFERING_GRACE_MS + 1);
    expect(onBufferingChange).not.toHaveBeenCalled();

    element.paused = false;
    element.dispatchEvent(new Event("playing"));
    onBufferingChange.mockClear();
    element.dispatchEvent(new Event("waiting"));
    await vi.advanceTimersByTimeAsync(BUFFERING_GRACE_MS - 1);
    element.readyState = 3;
    element.dispatchEvent(new Event("canplay"));

    expect(onBufferingChange).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    adapter.destroy();
    vi.useRealTimers();
  });

  it("reports a sustained mid-playback stall and clears it when time advances", async () => {
    vi.useFakeTimers();
    const element = new FakeMediaElement();
    const onBufferingChange = vi.fn();
    const adapter = createHtmlMediaPlayerAdapter(asMediaElement(element), {
      events: { onBufferingChange },
    });
    await adapter.loadMedia(media("https://media.example.test/movie.mp4", "mp4"));
    element.readyState = 2;
    element.paused = false;
    element.dispatchEvent(new Event("playing"));
    onBufferingChange.mockClear();

    element.dispatchEvent(new Event("waiting"));
    await vi.advanceTimersByTimeAsync(BUFFERING_GRACE_MS);
    expect(onBufferingChange).toHaveBeenLastCalledWith(true);

    element.currentTime = 1;
    element.dispatchEvent(new Event("timeupdate"));
    expect(onBufferingChange).toHaveBeenLastCalledWith(false);

    adapter.destroy();
    vi.useRealTimers();
  });

  it("publishes finite metadata duration, preserves it across transient unknown values, and resets by source", async () => {
    const element = new FakeMediaElement();
    element.duration = Number.NaN;
    const onDurationChange = vi.fn();
    const adapter = createHtmlMediaPlayerAdapter(asMediaElement(element), {
      events: { onDurationChange },
    });
    await adapter.loadMedia(media("https://media.example.test/movie.mp4", "mp4"));
    expect(adapter.getDuration()).toBeNull();

    element.duration = 125.5;
    element.readyState = 1;
    element.dispatchEvent(new Event("loadedmetadata"));
    expect(adapter.getDuration()).toBe(125.5);
    expect(onDurationChange).toHaveBeenLastCalledWith(125.5);

    element.duration = Number.NaN;
    element.dispatchEvent(new Event("durationchange"));
    expect(adapter.getDuration()).toBe(125.5);

    await adapter.loadMedia(media("https://media.example.test/next.mp4", "mp4"));
    expect(adapter.getDuration()).toBeNull();
    expect(onDurationChange).toHaveBeenLastCalledWith(null);
  });

  it("uses a finite VOD playlist duration fallback but never fabricates live duration", async () => {
    const element = new FakeMediaElement();
    element.duration = Number.NaN;
    const hls = createHlsFake();
    const adapter = createHtmlMediaPlayerAdapter(asMediaElement(element), {
      hlsFactory: hls.factory,
    });
    await adapter.loadMedia(media("https://media.example.test/movie.m3u8", "hls"));

    hls.emitLevelLoaded({ details: { live: false, totalduration: 142.25 } });
    expect(adapter.getDuration()).toBe(142.25);
    expect(hls.runtime.config?.lowLatencyMode).toBe(false);

    await adapter.loadMedia(media("https://media.example.test/channel.m3u8", "hls"));
    hls.emitLevelLoaded({ details: { live: true, totalduration: 60 } });
    expect(adapter.getDuration()).toBeNull();
    expect(hls.runtime.config?.lowLatencyMode).toBe(true);
  });

  it("keeps ABR automatic and performs one bounded hls.js media recovery", async () => {
    const element = new FakeMediaElement();
    const hls = createHlsFake();
    const onError = vi.fn();
    const adapter = createHtmlMediaPlayerAdapter(asMediaElement(element), {
      hlsFactory: hls.factory,
      events: { onError },
    });
    await adapter.loadMedia(media("https://media.example.test/movie.m3u8", "hls"));

    expect(HLS_RUNTIME_CONFIG).toMatchObject({
      startLevel: -1,
      testBandwidth: true,
      capLevelToPlayerSize: true,
      maxBufferLength: 45,
      backBufferLength: 30,
    });
    hls.emitError({ type: "mediaError", details: "bufferAppendError", fatal: true });
    expect(hls.runtime.recoverMediaError).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();

    hls.emitError({ type: "mediaError", details: "bufferAppendError", fatal: true });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ category: "hls_media_error", fatal: true }),
    );
  });

  it("fails clearly when neither native HLS nor hls.js support is available", async () => {
    const element = new FakeMediaElement();
    const hls = createHlsFake(false);
    const adapter = createHtmlMediaPlayerAdapter(asMediaElement(element), {
      hlsFactory: hls.factory,
    });

    await expect(
      adapter.loadMedia(media("https://media.example.test/live.m3u8", "hls")),
    ).rejects.toMatchObject({ category: "unsupported_codec_container" });
  });
});

describe("local ended and control boundaries", () => {
  it("never turns viewer local pause or ended into a shared command", async () => {
    const element = new FakeMediaElement();
    const markEnded = vi.fn();
    const pauseShared = vi.fn();
    const adapter = createHtmlMediaPlayerAdapter(asMediaElement(element));
    await adapter.loadMedia(media("https://media.example.test/movie.mp4", "mp4"));
    const coordinator = createMediaEndedCoordinator({
      isOwner: false,
      roomId,
      player: adapter,
      getCanonicalPlayback: canonicalState,
      playbackCommands: { markEnded },
    });

    await adapter.pause();
    await coordinator.handleEnded();

    expect(pauseShared).not.toHaveBeenCalled();
    expect(markEnded).not.toHaveBeenCalled();
  });

  it("lets an owner mark exactly the current canonical version ended without auto-next", async () => {
    const element = new FakeMediaElement();
    const adapter = createHtmlMediaPlayerAdapter(asMediaElement(element));
    await adapter.loadMedia(media("https://media.example.test/movie.mp4", "mp4"));
    const endedState = { ...canonicalState(), status: "ended" as const, state_version: 8 };
    const markEnded = vi.fn(async () => endedState);
    const playNext = vi.fn();
    const coordinator = createMediaEndedCoordinator({
      isOwner: true,
      roomId,
      player: adapter,
      getCanonicalPlayback: canonicalState,
      playbackCommands: { markEnded },
    });

    await expect(coordinator.handleEnded()).resolves.toEqual(endedState);
    expect(markEnded).toHaveBeenCalledWith(roomId, 7);
    expect(playNext).not.toHaveBeenCalled();
  });
});
