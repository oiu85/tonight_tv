import { describe, expect, it, vi } from "vitest";

import { WebtorTorrentGateway } from "../../src/lib/torrent/webtor-torrent-gateway";

const hash = "0123456789abcdef0123456789abcdef01234567";

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("WebtorTorrentGateway", () => {
  it("registers a Magnet and normalizes the file manifest", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ id: hash, name: "Movie", multi_file: true, files_count: 2 }))
      .mockResolvedValueOnce(json({
        items: [
          { type: "file", id: "content-video", path: "Movie/Movie.mkv", name: "Movie.mkv", size: 1000 },
          { type: "file", id: "content-subtitle", path: "Movie/Movie.en.srt", name: "Movie.en.srt", size: 100 },
        ],
      }));
    const gateway = new WebtorTorrentGateway({
      internalBaseUrl: "http://webtor:8080/rest-api/",
      mediaPublicBaseUrl: "https://media.example.test/",
      fetch: fetchMock as typeof fetch,
    });

    await expect(gateway.inspect({
      kind: "magnet",
      magnetUri: `magnet:?xt=urn:btih:${hash}`,
    })).resolves.toMatchObject({
      infoHash: hash,
      status: "ready",
      files: [
        { index: 0, kind: "video", playableCandidate: true },
        { index: 1, kind: "subtitle", playableCandidate: false },
      ],
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://webtor:8080/rest-api/resource/");
  });

  it("verifies the selected file and returns a public derived HLS source", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ id: hash, multi_file: true, files_count: 1 }))
      .mockResolvedValueOnce(json({
        items: [{ type: "file", id: "content-video", path: "Movie/Movie.mkv", name: "Movie.mkv", size: 1000 }],
      }))
      .mockResolvedValueOnce(json({
        exports: {
          stream: { url: "http://webtor:8080/hls/session/index.m3u8?token=signed" },
        },
      }));
    const gateway = new WebtorTorrentGateway({
      internalBaseUrl: "http://webtor:8080/rest-api/",
      mediaPublicBaseUrl: "https://media.example.test/",
      fetch: fetchMock as typeof fetch,
    });

    await expect(gateway.resolvePlayback({
      infoHash: hash,
      fileIndex: 0,
      expectedFilePath: "Movie/Movie.mkv",
      mediaId: "22222222-2222-4222-8222-222222222222",
      sourceRevision: 3,
    })).resolves.toMatchObject({
      kind: "hls",
      url: "https://media.example.test/hls/session/index.m3u8?token=signed",
      timelineOffsetSec: 0,
      mediaIdentity: `22222222-2222-4222-8222-222222222222:3:${hash}:0`,
    });
    expect(String(fetchMock.mock.calls[2][0])).toContain("/export/content-video?");
  });

  it("fails safely when the selected file identity changed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ id: hash, multi_file: true, files_count: 1 }))
      .mockResolvedValueOnce(json({
        items: [{ type: "file", id: "content-video", path: "Movie/Other.mkv", name: "Other.mkv", size: 1000 }],
      }));
    const gateway = new WebtorTorrentGateway({
      internalBaseUrl: "http://webtor:8080/rest-api/",
      fetch: fetchMock as typeof fetch,
    });
    await expect(gateway.prepare({
      infoHash: hash,
      fileIndex: 0,
      expectedFilePath: "Movie/Movie.mkv",
    })).rejects.toMatchObject({ category: "selected_file_missing" });
  });

  it("normalizes an unavailable gateway", async () => {
    const gateway = new WebtorTorrentGateway({
      internalBaseUrl: "http://webtor:8080/rest-api/",
      fetch: vi.fn(async () => { throw new Error("offline"); }) as typeof fetch,
    });
    await expect(gateway.inspect({
      kind: "magnet",
      magnetUri: `magnet:?xt=urn:btih:${hash}`,
    })).rejects.toMatchObject({ category: "gateway_unavailable", status: 503 });
  });
});
