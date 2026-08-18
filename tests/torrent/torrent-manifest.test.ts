import { describe, expect, it } from "vitest";

import {
  classifyTorrentFile,
  extractInfoHashFromTorrentInput,
  inspectionFromMagnetIdentity,
  parseMagnetIdentity,
  parseTorrentFileIdentity,
  rankSubtitleCandidates,
  rankVideoCandidates,
  WEBTOR_AUTOSELECT_FILE_PATH,
} from "../../src/lib/torrent/torrent-manifest";

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function bencode(value: unknown): Uint8Array {
  const text = (input: string) => new TextEncoder().encode(input);
  if (typeof value === "number") return text(`i${value}e`);
  if (typeof value === "string") {
    const bytes = text(value);
    return concat([text(`${bytes.byteLength}:`), bytes]);
  }
  if (value instanceof Uint8Array) {
    return concat([text(`${value.byteLength}:`), value]);
  }
  if (Array.isArray(value)) {
    return concat([text("l"), ...value.map(bencode), text("e")]);
  }
  const record = value as Record<string, unknown>;
  return concat([
    text("d"),
    ...Object.keys(record).sort().flatMap((key) => [bencode(key), bencode(record[key])]),
    text("e"),
  ]);
}

function torrentFixture(): Uint8Array {
  return bencode({
    announce: "http://tracker.invalid/announce",
    info: {
      files: [
        { length: 900_000_000, path: ["Season 01", "Episode 01.mkv"] },
        { length: 4_000, path: ["Season 01", "Episode 01.ar.srt"] },
        { length: 800_000_000, path: ["Season 01", "حلقة 02.mkv"] },
      ],
      name: "Synthetic Show",
      "piece length": 16_384,
      pieces: new Uint8Array(20),
    },
  });
}

describe("Torrent input parsing", () => {
  it("accepts a canonical Magnet URI and rejects malformed input", async () => {
    const hash = "0123456789abcdef0123456789abcdef01234567";
    await expect(parseMagnetIdentity(`magnet:?xt=urn:btih:${hash}&dn=Legal+Fixture`))
      .resolves.toMatchObject({ infoHash: hash, magnetUri: `magnet:?xt=urn:btih:${hash}&dn=Legal+Fixture` });
    await expect(parseMagnetIdentity("magnet:?dn=missing-hash"))
      .rejects.toMatchObject({ category: "invalid_magnet" });
  });

  it("accepts a raw info hash and a webtor.io URL as torrent identity", async () => {
    const hash = "52fd58172c296021f2e351b8a12bbc8be7c88f8d";
    await expect(parseMagnetIdentity(hash)).resolves.toMatchObject({
      infoHash: hash,
      magnetUri: `magnet:?xt=urn:btih:${hash}`,
    });
    await expect(parseMagnetIdentity(`https://webtor.io/${hash.toUpperCase()}`)).resolves.toMatchObject({
      infoHash: hash,
      magnetUri: `magnet:?xt=urn:btih:${hash}`,
    });
    expect(extractInfoHashFromTorrentInput(`https://webtor.io/${hash}/file.mp4`)).toBe(hash);
  });

  it("builds a playable autoselect inspection when only the magnet identity is known", async () => {
    const identity = await parseMagnetIdentity(`magnet:?xt=urn:btih:${"52fd58172c296021f2e351b8a12bbc8be7c88f8d"}&dn=Legal+Fixture`);
    expect(inspectionFromMagnetIdentity(identity)).toMatchObject({
      infoHash: identity.infoHash,
      torrentName: "Legal Fixture",
      status: "ready",
      files: [{
        path: WEBTOR_AUTOSELECT_FILE_PATH,
        name: "Legal Fixture.mp4",
        kind: "video",
        playableCandidate: true,
        sizeBytes: 0,
      }],
    });
  });

  it("parses legal synthetic metadata with nested and Unicode paths", async () => {
    await expect(parseTorrentFileIdentity(torrentFixture())).resolves.toMatchObject({
      name: "Synthetic Show",
      magnetUri: expect.stringContaining("magnet:?xt=urn:btih:"),
    });
  });

  it("rejects malformed and oversized torrent metadata", async () => {
    await expect(parseTorrentFileIdentity(new Uint8Array([1, 2, 3])))
      .rejects.toMatchObject({ category: "invalid_torrent" });
    await expect(parseTorrentFileIdentity(new Uint8Array(2 * 1024 * 1024 + 1)))
      .rejects.toMatchObject({ category: "invalid_torrent" });
  });
});

describe("Torrent file classification", () => {
  const file = (index: number, path: string, sizeBytes: number) =>
    classifyTorrentFile({ index, path, sizeBytes });

  it("ranks the primary movie above samples without hiding either", () => {
    const ranked = rankVideoCandidates([
      file(0, "Movie/sample.mkv", 40_000_000),
      file(1, "Movie/Movie.1080p.mkv", 2_000_000_000),
    ]);
    expect(ranked.map((entry) => entry.index)).toEqual([1, 0]);
  });

  it("requires callers to handle multiple videos and reports no-video manifests", () => {
    expect(rankVideoCandidates([
      file(0, "Episode1.mkv", 100),
      file(1, "Episode2.mkv", 100),
      file(2, "Episode3.mkv", 100),
    ])).toHaveLength(3);
    expect(rankVideoCandidates([
      file(0, "readme.txt", 100),
      file(1, "cover.jpg", 100),
      file(2, "archive.rar", 100),
    ])).toEqual([]);
  });

  it("matches nearby sidecar subtitles and normalizes language labels", () => {
    const video = file(0, "Movie/Movie.2026.1080p.mkv", 1_000);
    const candidates = rankSubtitleCandidates(video, [
      video,
      file(1, "Movie/Movie.2026.1080p.en.srt", 10),
      file(2, "Movie/Movie.2026.1080p.ar.srt", 10),
      file(3, "Other/unrelated-documentary.srt", 10),
    ]);
    expect(candidates.map((candidate) => candidate.languageCode)).toEqual(["ar", "en"]);
    expect(candidates.map((candidate) => candidate.label).sort()).toEqual(["Arabic", "English"]);
  });

  it("treats a no-subtitle torrent as a valid empty candidate set", () => {
    const video = file(0, "Movie.mkv", 1_000);
    expect(rankSubtitleCandidates(video, [video])).toEqual([]);
  });
});
