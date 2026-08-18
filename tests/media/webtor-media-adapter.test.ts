// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from "vitest";

import { createWebtorMediaPlayerAdapter } from "../../src/lib/torrent/infrastructure/webtor/media-player-adapter";
import type { SyncMedia } from "../../src/lib/sync/sync-core";
import type { WebtorEvent, WebtorGenerator, WebtorPlayer } from "@webtor/embed-sdk-js";

const infoHash = "0123456789abcdef0123456789abcdef01234567";
const media: SyncMedia = {
  id: "22222222-2222-4222-8222-222222222222",
  roomId: "11111111-1111-4111-8111-111111111111",
  title: "Webtor fixture",
  sourceUrl: null,
  sourceType: "torrent",
  youtubeVideoId: null,
  torrentInfoHash: infoHash,
  torrentFilePath: "Movie/Movie.mp4",
};

type WebtorConfig = Readonly<{
  id?: string;
  el?: HTMLElement;
  magnet: string;
  path?: string;
  controls?: boolean;
  features?: Record<string, boolean>;
  on: (event: WebtorEvent) => void;
}>;

const push = vi.fn();

beforeAll(() => {
  (window as Window & { webtor?: WebtorGenerator }).webtor = {
    push,
  } as unknown as WebtorGenerator;
});

describe("Webtor media adapter", () => {
  it("loads the torrent identity and maps Webtor events to shared player controls", async () => {
    push.mockReset();
    const mount = document.createElement("div");
    const onReady = vi.fn();
    const onDurationChange = vi.fn();
    const adapter = createWebtorMediaPlayerAdapter({
      mount,
      events: { onReady, onDurationChange },
    });

    await adapter.loadMedia(media);
    expect(push).toHaveBeenCalledOnce();
    const config = push.mock.calls[0][0] as WebtorConfig;
    expect(config.id).toMatch(/^tt-webtor-/);
    expect(config.el).toBeUndefined();
    expect(config.magnet).toBe(`magnet:?xt=urn:btih:${infoHash}`);
    expect(config.path).toBe(media.torrentFilePath);
    expect(config.controls).toBe(true);
    expect(config.features?.timeline).toBe(false);
    expect(config.features?.playpause).toBe(false);

    const player: WebtorPlayer = {
      play: vi.fn(),
      pause: vi.fn(),
      setPosition: vi.fn(),
    } as unknown as WebtorPlayer;
    const readyPromise = adapter.waitUntilReady();
    config.on({ name: "duration", data: { value: 150 } } as WebtorEvent);
    config.on({ name: "current time", data: { value: 12.5 } } as WebtorEvent);
    config.on({ name: "inited", player } as WebtorEvent);
    await expect(readyPromise).resolves.toBeUndefined();

    await adapter.play();
    adapter.seek(70);
    adapter.pause();

    expect(onReady).toHaveBeenCalledOnce();
    expect(onDurationChange).toHaveBeenCalledWith(150);
    expect(adapter.getCurrentTime()).toBe(12.5);
    expect(adapter.getDuration()).toBe(150);
    expect(player.play).toHaveBeenCalledOnce();
    expect(player.setPosition).toHaveBeenCalledWith(70);
    expect(player.pause).toHaveBeenCalledOnce();

    mount.append(document.createElement("span"));
    adapter.destroy();
    expect(mount.childElementCount).toBe(0);
  });

  it("omits path so Webtor can auto-select the main video", async () => {
    push.mockReset();
    const adapter = createWebtorMediaPlayerAdapter({ mount: document.createElement("div") });
    await adapter.loadMedia({
      ...media,
      torrentFilePath: "__webtor_autoselect__.mp4",
    });
    const config = push.mock.calls[0][0] as WebtorConfig;
    expect(config.path).toBeUndefined();
  });

  it("rejects non-torrent media instead of confusing it with WebTorrent local P2P", async () => {
    const adapter = createWebtorMediaPlayerAdapter({ mount: document.createElement("div") });
    await expect(adapter.loadMedia({ ...media, sourceType: "local_p2p" })).rejects.toMatchObject({
      category: "invalid_torrent",
    });
  });
});
