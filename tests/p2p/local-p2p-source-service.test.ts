import { describe, expect, it, vi } from "vitest";

import { createLocalP2pSourceService } from "../../src/lib/p2p/local-p2p-source-service";
import type { LocalP2pRuntime } from "../../src/lib/p2p/local-p2p-runtime";
import type { MediaItem } from "../../src/lib/media/media-queue-service";

const roomId = "11111111-1111-4111-8111-111111111111";
const hash = "0123456789abcdef0123456789abcdef01234567";
const descriptor = { infoHash: hash, magnetUri: `magnet:?xt=urn:btih:${hash}`, fileName: "fixture.mp4", fileSize: 10, mimeType: "video/mp4" } as const;
const media = { id: "22222222-2222-4222-8222-222222222222", title: "Fixture" } as MediaItem;

function runtimeMock(): LocalP2pRuntime {
  return {
    initialize: vi.fn(),
    seedLocalFile: vi.fn(async () => descriptor),
    joinLocalStream: vi.fn(),
    attachToMediaElement: vi.fn(),
    leaveLocalStream: vi.fn(async () => undefined),
    hasLocalSeed: vi.fn(() => false),
    setSignalTransport: vi.fn(),
    getState: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    destroy: vi.fn(async () => undefined),
  } as unknown as LocalP2pRuntime;
}

describe("local P2P source service", () => {
  it("cleans the newly seeded torrent when the owner RPC fails", async () => {
    const runtime = runtimeMock();
    const addMedia = vi.fn(async () => { throw new Error("owner RPC failed"); });
    const service = createLocalP2pSourceService({} as never, runtime, { addMedia });
    await expect(service.startDeviceStream(roomId, "Fixture", new File(["x"], "fixture.mp4", { type: "video/mp4" }))).rejects.toThrow("owner RPC failed");
    expect(runtime.leaveLocalStream).toHaveBeenCalledWith(hash);
  });

  it("passes a successful browser seed descriptor to the owner queue path", async () => {
    const runtime = runtimeMock();
    const addMedia = vi.fn(async () => media);
    const service = createLocalP2pSourceService({} as never, runtime, { addMedia });
    await expect(service.startDeviceStream(roomId, "Fixture", new File(["x"], "fixture.mp4"))).resolves.toEqual({ media, descriptor });
    expect(addMedia).toHaveBeenCalledWith(roomId, { title: "Fixture", sourceType: "local_p2p", localP2p: descriptor });
  });

  it("rejects a different file when the owner resumes a device stream", async () => {
    const runtime = runtimeMock();
    vi.mocked(runtime.seedLocalFile).mockResolvedValue({
      ...descriptor,
      infoHash: "abcdef0123456789abcdef0123456789abcdef01",
    });
    const service = createLocalP2pSourceService({} as never, runtime, { addMedia: vi.fn() });

    await expect(
      service.resumeDeviceStream(descriptor, new File(["different"], "fixture.mp4")),
    ).rejects.toThrow("not the original file");
    expect(runtime.leaveLocalStream).toHaveBeenCalledWith(
      "abcdef0123456789abcdef0123456789abcdef01",
    );
  });

  it("does not re-hash the original file when this tab is already hosting it", async () => {
    const runtime = runtimeMock();
    vi.mocked(runtime.hasLocalSeed).mockReturnValue(true);
    const service = createLocalP2pSourceService({} as never, runtime, { addMedia: vi.fn() });

    await expect(
      service.resumeDeviceStream(descriptor, new File(["x"], "fixture.mp4")),
    ).resolves.toEqual(descriptor);
    expect(runtime.seedLocalFile).not.toHaveBeenCalled();
  });
});
