// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createLocalP2pRuntime } from "../../src/lib/p2p/local-p2p-runtime";

const infoHash = "0123456789abcdef0123456789abcdef01234567";
const magnetUri = `magnet:?xt=urn:btih:${infoHash}`;

type Listener = (...args: unknown[]) => void;

class FakeTorrent {
  readonly infoHash = infoHash;
  readonly magnetURI = magnetUri;
  readonly files = [
    {
      name: "fixture.mp4",
      length: 7,
      streamTo: vi.fn(),
    },
  ];
  readonly listeners = new Map<string, Listener[]>();
  destroyed = false;
  numPeers = 0;
  uploadSpeed = 0;
  downloadSpeed = 0;
  progress = 0;

  on(name: string, listener: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
    return this;
  }

  once(name: string, listener: Listener) {
    return this.on(name, listener);
  }
}

function browserSupportFixture() {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {},
  });
  Object.defineProperty(globalThis, "RTCPeerConnection", {
    configurable: true,
    value: class RTCPeerConnection {},
  });
}

function runtimeFixture() {
  browserSupportFixture();
  const torrent = new FakeTorrent();
  const registration = {} as ServiceWorkerRegistration;
  const createServer = vi.fn();
  const remove = vi.fn(
    (
      selected: FakeTorrent,
      options: { destroyStore: boolean },
      callback: (error?: Error) => void,
    ) => {
      selected.destroyed = true;
      callback();
    },
  );
  const destroy = vi.fn((callback: (error?: Error) => void) => callback());
  const seed = vi.fn(
    (
      _file: File,
      _options: unknown,
      callback: (seeded: FakeTorrent) => void,
    ) => {
      callback(torrent);
      return torrent;
    },
  );
  const add = vi.fn(
    (
      _magnet: string,
      _options: unknown,
      callback: (joined: FakeTorrent) => void,
    ) => {
      callback(torrent);
      return torrent;
    },
  );
  const client = {
    createServer,
    remove,
    destroy,
    seed,
    add,
    destroyed: false,
  };
  const WebTorrentClass = vi.fn(function WebTorrentClass() {
    return client;
  });
  const loadWebTorrent = vi.fn(async () => WebTorrentClass as never);
  const registerServiceWorker = vi.fn(async () => registration);
  const runtime = createLocalP2pRuntime({
    loadWebTorrent,
    registerServiceWorker,
    metricIntervalMs: 60_000,
  });

  return {
    runtime,
    torrent,
    registration,
    client,
    WebTorrentClass,
    loadWebTorrent,
    registerServiceWorker,
  };
}

describe("local P2P browser runtime", () => {
  it("initializes one stable WebTorrent client and attaches the Service Worker once", async () => {
    const fixture = runtimeFixture();

    await Promise.all([
      fixture.runtime.initialize(),
      fixture.runtime.initialize(),
      fixture.runtime.initialize(),
    ]);

    expect(fixture.loadWebTorrent).toHaveBeenCalledTimes(1);
    expect(fixture.registerServiceWorker).toHaveBeenCalledTimes(1);
    expect(fixture.WebTorrentClass).toHaveBeenCalledTimes(1);
    expect(fixture.client.createServer).toHaveBeenCalledWith({
      controller: fixture.registration,
    });

    await fixture.runtime.destroy();
    expect(fixture.client.destroy).toHaveBeenCalledTimes(1);
  });

  it("seeds the original browser File and returns only the generated descriptor", async () => {
    const fixture = runtimeFixture();
    const file = new File(["fixture"], "fixture.mp4", { type: "video/mp4" });

    const descriptor = await fixture.runtime.seedLocalFile(file);

    expect(fixture.client.seed).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        announce: expect.any(Array),
        private: true,
        dht: false,
        lsd: false,
        utPex: false,
        destroyStoreOnDestroy: true,
      }),
      expect.any(Function),
    );
    expect(descriptor).toEqual({
      infoHash,
      magnetUri,
      fileName: "fixture.mp4",
      fileSize: 7,
      mimeType: "video/mp4",
    });
    expect(fixture.runtime.hasLocalSeed(infoHash)).toBe(true);

    await fixture.runtime.destroy();
  });

  it("streams a joined file and destroys its temporary store on final cleanup", async () => {
    const fixture = runtimeFixture();
    const descriptor = {
      infoHash,
      magnetUri,
      fileName: "fixture.mp4",
      fileSize: 7,
      mimeType: "video/mp4",
    } as const;
    const video = document.createElement("video");

    await fixture.runtime.attachToMediaElement(descriptor, video);

    expect(fixture.client.add).toHaveBeenCalledWith(
      magnetUri,
      expect.objectContaining({
        private: true,
        dht: false,
        lsd: false,
        utPex: false,
        destroyStoreOnDestroy: true,
      }),
      expect.any(Function),
    );
    expect(fixture.torrent.files[0].streamTo).toHaveBeenCalledWith(video);

    await fixture.runtime.leaveLocalStream(infoHash);

    expect(fixture.client.remove).toHaveBeenCalledWith(
      fixture.torrent,
      { destroyStore: true },
      expect.any(Function),
    );
    expect(fixture.runtime.getState().status).toBe("stopped");

    await fixture.runtime.destroy();
  });
});
