import { describe, expect, it } from "vitest";

import { inspectTorrent } from "../../src/lib/torrent/torrent-client";
import { WEBTOR_AUTOSELECT_FILE_PATH } from "../../src/lib/torrent/torrent-manifest";

const hash = "52fd58172c296021f2e351b8a12bbc8be7c88f8d";
const magnet = `magnet:?xt=urn:btih:${hash}`;

describe("inspectTorrent identity", () => {
  it("resolves a magnet or webtor.io URL without waiting on the Webtor embed", async () => {
    await expect(inspectTorrent("room-1", { kind: "magnet", magnetUri: `https://webtor.io/${hash}` }))
      .resolves.toMatchObject({
        infoHash: hash,
        magnetUri: magnet,
        status: "ready",
        files: [{
          kind: "video",
          playableCandidate: true,
          path: WEBTOR_AUTOSELECT_FILE_PATH,
          sizeBytes: 0,
        }],
      });
  });

  it("keeps the original magnet URI when the user pasted a magnet", async () => {
    const named = `${magnet}&dn=Batman+Begins`;
    await expect(inspectTorrent("room-1", { kind: "magnet", magnetUri: named }))
      .resolves.toMatchObject({
        infoHash: hash,
        magnetUri: named,
        files: [{ path: WEBTOR_AUTOSELECT_FILE_PATH }],
      });
  });
});
