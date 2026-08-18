// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createLocalP2pMediaPlayerAdapter } from "../../src/lib/media/local-p2p-media-adapter";
import type { LocalP2pRuntime } from "../../src/lib/p2p/local-p2p-runtime";
import type { LocalP2pSourceService } from "../../src/lib/p2p/local-p2p-source-service";
import type { SyncMedia } from "../../src/lib/sync/sync-core";

const roomId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";
const infoHash = "0123456789abcdef0123456789abcdef01234567";
const descriptor = {
  infoHash,
  magnetUri: `magnet:?xt=urn:btih:${infoHash}`,
  fileName: "fixture.mp4",
  fileSize: 1024,
  mimeType: "video/mp4",
} as const;
const syncMedia: SyncMedia = {
  id: mediaId,
  roomId,
  title: "Fixture",
  sourceUrl: null,
  sourceType: "local_p2p",
  youtubeVideoId: null,
};

function runtimeMock(hasLocalSeed = false): LocalP2pRuntime {
  return {
    initialize: vi.fn(async () => undefined),
    seedLocalFile: vi.fn(),
    joinLocalStream: vi.fn(),
    attachToMediaElement: vi.fn(async (_descriptor, element: HTMLMediaElement) => {
      element.src = "http://localhost/webtorrent/stream";
    }),
    leaveLocalStream: vi.fn(async () => undefined),
    hasLocalSeed: vi.fn(() => hasLocalSeed),
    setSignalTransport: vi.fn(),
    getState: vi.fn(() => ({
      status: "ready" as const,
      infoHash,
      peerCount: 0,
      uploadSpeed: 0,
      downloadSpeed: 0,
      progress: 1,
      hosting: hasLocalSeed,
      error: null,
    })),
    subscribe: vi.fn(() => () => undefined),
    destroy: vi.fn(async () => undefined),
  } as unknown as LocalP2pRuntime;
}

function sourceServiceMock(): LocalP2pSourceService {
  return {
    startDeviceStream: vi.fn(),
    resolveSource: vi.fn(async () => descriptor),
    resumeDeviceStream: vi.fn(),
  } as unknown as LocalP2pSourceService;
}

function videoFixture() {
  const element = document.createElement("video");
  let paused = true;
  Object.defineProperties(element, {
    paused: { configurable: true, get: () => paused },
    readyState: { configurable: true, get: () => 1 },
    duration: { configurable: true, get: () => 120 },
  });
  element.load = vi.fn();
  element.play = vi.fn(async () => { paused = false; });
  element.pause = vi.fn(() => { paused = true; });
  return element;
}

describe("local P2P media adapter", () => {
  it("streams into the shared video element even when the owner tab is not hosting", async () => {
    const runtime = runtimeMock(false);
    const element = videoFixture();
    const adapter = createLocalP2pMediaPlayerAdapter({
      mediaElement: element,
      roomId,
      isOwner: true,
      runtime,
      sourceService: sourceServiceMock(),
    });

    await adapter.loadMedia(syncMedia);
    expect(runtime.attachToMediaElement).toHaveBeenCalledWith(descriptor, expect.any(HTMLVideoElement));
    expect(element.load).toHaveBeenCalledTimes(1);
    adapter.destroy();
  });

  it("streams into the shared video element and exposes normal sync controls", async () => {
    const runtime = runtimeMock(false);
    const element = videoFixture();
    const onReady = vi.fn();
    const adapter = createLocalP2pMediaPlayerAdapter({
      mediaElement: element,
      roomId,
      isOwner: false,
      runtime,
      sourceService: sourceServiceMock(),
      events: { onReady },
    });

    await adapter.loadMedia(syncMedia);
    element.dispatchEvent(new Event("loadedmetadata"));
    await adapter.waitUntilReady();
    await adapter.seek(75);
    await adapter.play();

    expect(runtime.attachToMediaElement).toHaveBeenCalledWith(descriptor, element);
    expect(adapter.isReady()).toBe(true);
    expect(adapter.getCurrentTime()).toBe(75);
    expect(adapter.isPaused()).toBe(false);
    expect(onReady).toHaveBeenCalled();

    adapter.pause();
    expect(adapter.isPaused()).toBe(true);
    adapter.destroy();
    await Promise.resolve();
    expect(runtime.leaveLocalStream).toHaveBeenCalledWith(infoHash);
  });

  it("preserves an owner seed when the adapter is replaced", async () => {
    const runtime = runtimeMock(true);
    const element = videoFixture();
    const adapter = createLocalP2pMediaPlayerAdapter({
      mediaElement: element,
      roomId,
      isOwner: true,
      runtime,
      sourceService: sourceServiceMock(),
    });

    await adapter.loadMedia(syncMedia);
    adapter.destroy();
    await Promise.resolve();
    expect(runtime.leaveLocalStream).not.toHaveBeenCalled();
  });

  it("does not treat a transient viewer media error as fatal while the swarm is still opening", async () => {
    const runtime = runtimeMock(false);
    vi.mocked(runtime.getState).mockReturnValue({
      status: "connecting",
      infoHash,
      peerCount: 0,
      uploadSpeed: 0,
      downloadSpeed: 0,
      progress: 0,
      hosting: false,
      error: null,
    });
    const element = videoFixture();
    const onError = vi.fn();
    const adapter = createLocalP2pMediaPlayerAdapter({
      mediaElement: element,
      roomId,
      isOwner: false,
      runtime,
      sourceService: sourceServiceMock(),
      events: { onError },
    });

    await adapter.loadMedia(syncMedia);
    element.dispatchEvent(new Event("error"));

    expect(adapter.hasFatalError()).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ fatal: false }));
    adapter.destroy();
  });

  it("does not become ready from canplay until the video reports a real duration", async () => {
    const runtime = runtimeMock(false);
    const element = document.createElement("video");
    Object.defineProperties(element, {
      paused: { configurable: true, get: () => true },
      readyState: { configurable: true, get: () => 0 },
      duration: { configurable: true, get: () => Number.NaN },
    });
    element.load = vi.fn();
    const adapter = createLocalP2pMediaPlayerAdapter({
      mediaElement: element,
      roomId,
      isOwner: false,
      runtime,
      sourceService: sourceServiceMock(),
    });

    await adapter.loadMedia(syncMedia);
    element.dispatchEvent(new Event("canplay"));
    element.dispatchEvent(new Event("loadedmetadata"));

    expect(adapter.isReady()).toBe(false);
    await expect(Promise.race([
      adapter.waitUntilReady().then(() => "ready"),
      Promise.resolve("pending"),
    ])).resolves.toBe("pending");
    adapter.destroy();
  });
});
