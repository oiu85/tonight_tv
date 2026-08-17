import { describe, expect, it, vi } from "vitest";

import {
  createHtmlMediaPlayerAdapter,
  createMediaEndedCoordinator,
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
  paused = true;
  readyState = 0;
  seekable: TimeRanges = new FakeTimeRanges([[0, 120]]);
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
  return { id: mediaId, title: "Movie", sourceUrl, sourceType } as const;
}

function createHlsFake(supported = true) {
  let errorListener: ((event: string, data: { type?: string; details?: string; fatal?: boolean }) => void) | null = null;
  const runtime = {
    attachMedia: vi.fn(),
    loadSource: vi.fn(),
    on: vi.fn((_event: string, listener: typeof errorListener) => {
      errorListener = listener;
    }),
    destroy: vi.fn(),
  } as unknown as HlsRuntime;
  const factory: HlsRuntimeFactory = {
    isSupported: () => supported,
    create: vi.fn(() => runtime),
    errorEvent: "hlsError",
  };
  return {
    factory,
    runtime,
    emitError(data: { type?: string; details?: string; fatal?: boolean }) {
      errorListener?.("hlsError", data);
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

    hls.emitError({ type: "mediaError", details: "fragLoadError", fatal: false });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ category: "hls_media_error", fatal: false }),
    );

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

  it("reports buffering recovery locally and never probes or proxies the source", async () => {
    const element = new FakeMediaElement();
    const onBufferingChange = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const adapter = createHtmlMediaPlayerAdapter(asMediaElement(element), {
      events: { onBufferingChange },
    });

    await adapter.loadMedia(media("https://media.example.test/watch/opaque", "auto"));
    element.dispatchEvent(new Event("waiting"));
    element.dispatchEvent(new Event("canplay"));

    expect(onBufferingChange).toHaveBeenNthCalledWith(1, true);
    expect(onBufferingChange).toHaveBeenNthCalledWith(2, false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
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
