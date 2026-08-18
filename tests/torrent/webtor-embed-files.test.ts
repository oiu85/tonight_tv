import { describe, expect, it } from "vitest";

import { collectWebtorFiles } from "../../src/lib/torrent/webtor-embed-files";

describe("collectWebtorFiles", () => {
  it("flattens a cached Webtor movie payload into a playable file", () => {
    const files = collectWebtorFiles({
      name: "Batman Begins (2005)",
      files: [{
        name: "Batman.Begins.2005.1080p.BluRay.x264.YIFY.mp4",
        path: "/Batman.Begins.2005.1080p.BluRay.x264.YIFY.mp4",
        length: 1_600_000_000,
      }],
    });
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      kind: "video",
      playableCandidate: true,
      name: "Batman.Begins.2005.1080p.BluRay.x264.YIFY.mp4",
      path: "Batman.Begins.2005.1080p.BluRay.x264.YIFY.mp4",
    });
  });

  it("walks nested directories and skips unreadable entries", () => {
    const files = collectWebtorFiles({
      files: [
        {
          type: "dir",
          name: "Season 01",
          files: [
            { name: "Episode 01.mkv", path: ["Season 01", "Episode 01.mkv"], length: 900_000_000 },
            { name: "Episode 01.ar.srt", length: 4_000 },
            { name: "..", path: "../evil.mkv", length: 1 },
          ],
        },
      ],
    });
    expect(files.map((file) => file.path)).toEqual([
      "Season 01/Episode 01.mkv",
      "Season 01/Episode 01.ar.srt",
    ]);
    expect(files.map((file) => file.kind)).toEqual(["video", "subtitle"]);
  });
});
