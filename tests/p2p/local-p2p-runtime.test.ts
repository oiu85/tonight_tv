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
      select: vi.fn(),
      streamTo: vi.fn(),
    },
  ];
  readonly listeners = new Map<string, Listener[]>();
  destroyed = false;
  numPeers = 0;
  uploadSpeed = 0;
  downloadSpeed = 0;
  progress = 0;
  downloaded = 0;

  on(name: string, listener: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
    return this;
  }

  once(name: string, listener: Listener) {
    return this.on(name, listener);
  }

  addPeer = vi.fn(() => true);
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
  const torrentsList: FakeTorrent[] = [];
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
      if (torrentsList.includes(torrent)) {
        throw new Error(`Cannot add duplicate torrent ${infoHash}`);
      }
      torrentsList.push(torrent);
      callback(torrent);
      return torrent;
    },
  );
  const get = vi.fn((id: string) => torrentsList.find((item) => item.infoHash === id.toLowerCase()));
  const client = {
    createServer,
    remove,
    destroy,
    seed,
    add,
    get,
    torrents: torrentsList,
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
        private: false,
        dht: false,
        lsd: true,
        utPex: true,
        destroyStoreOnDestroy: true,
      }),
      expect.any(Function),
    );
    expect(descriptor).toEqual({
      infoHash,
      magnetUri: expect.stringContaining(`magnet:?xt=urn:btih:${infoHash}`),
      fileName: "fixture.mp4",
      fileSize: 7,
      mimeType: "video/mp4",
    });
    expect(descriptor.magnetUri).toContain("tr=");
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
      expect.stringContaining(magnetUri),
      expect.objectContaining({
        private: false,
        dht: false,
        lsd: true,
        utPex: true,
        destroyStoreOnDestroy: true,
      }),
      expect.any(Function),
    );
    expect(fixture.torrent.files[0].streamTo).toHaveBeenCalledWith(video);
    expect(fixture.torrent.files[0].select).toHaveBeenCalled();
    expect(fixture.runtime.getState().status).toBe("connecting");

    await fixture.runtime.leaveLocalStream(infoHash);

    expect(fixture.client.remove).toHaveBeenCalledWith(
      fixture.torrent,
      { destroyStore: true },
      expect.any(Function),
    );
    expect(fixture.runtime.getState().status).toBe("stopped");

    await fixture.runtime.destroy();
  });

  it("plays the original File in the hosting tab instead of the torrent stream", async () => {
    const fixture = runtimeFixture();
    const file = new File(["fixture"], "fixture.mp4", { type: "video/mp4" });
    const descriptor = await fixture.runtime.seedLocalFile(file);
    const video = document.createElement("video");
    const blobUrl = "blob:http://localhost/seed-file";
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue(blobUrl);

    await fixture.runtime.attachToMediaElement(descriptor, video);

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(video.src).toContain("blob:");
    expect(fixture.client.add).not.toHaveBeenCalled();
    expect(fixture.torrent.files[0].streamTo).not.toHaveBeenCalled();

    createObjectURL.mockRestore();
    await fixture.runtime.destroy();
  });

  it("opens a room-signal WebRTC peer when a leech hello arrives at the seeder", async () => {
    const fixture = runtimeFixture();
    const peers: FakePeer[] = [];
    class FakePeer {
      id?: string;
      readonly handlers = new Map<string, Listener[]>();
      constructor(readonly options: { initiator?: boolean }) {
        peers.push(this);
      }
      on(name: string, listener: Listener) {
        this.handlers.set(name, [...(this.handlers.get(name) ?? []), listener]);
        return this;
      }
      signal = vi.fn();
      destroy = vi.fn();
    }
    const runtime = createLocalP2pRuntime({
      loadWebTorrent: fixture.loadWebTorrent,
      registerServiceWorker: fixture.registerServiceWorker,
      loadSimplePeer: async () => FakePeer as never,
      metricIntervalMs: 60_000,
    });
    await runtime.seedLocalFile(new File(["fixture"], "fixture.mp4", { type: "video/mp4" }));
    const sent: unknown[] = [];
    runtime.setSignalTransport({
      sessionId: "zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz",
      send: (message) => {
        sent.push(message);
      },
      subscribe: (listener) => {
        listener({
          kind: "hello",
          infoHash,
          from: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          to: null,
          role: "leech",
        });
        return () => undefined;
      },
    });
    await vi.waitFor(() => {
      expect(peers).toHaveLength(1);
    });

    expect(peers).toHaveLength(1);
    expect(peers[0].options.initiator).toBe(true);
    expect(fixture.torrent.addPeer).toHaveBeenCalledWith(peers[0]);
    expect(sent.some((message) => message && typeof message === "object" && (message as { kind: string }).kind === "hello")).toBe(true);

    await runtime.destroy();
    await fixture.runtime.destroy();
  });

  it("reuses an already added torrent instead of crashing on duplicate add", async () => {
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
    await fixture.runtime.attachToMediaElement(descriptor, video);

    expect(fixture.client.add).toHaveBeenCalledTimes(1);
    expect(fixture.torrent.files[0].streamTo).toHaveBeenCalled();

    await fixture.runtime.destroy();
  });
});
