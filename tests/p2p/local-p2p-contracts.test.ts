import { describe, expect, it } from "vitest";

import {
  magnetWithTrackers,
  mimeTypeFromFileName,
  parseLocalP2pSignal,
  shouldInitiateRoomPeer,
  shouldInitiateSignal,
} from "../../src/lib/p2p/local-p2p-contracts";

const hash = "52fd58172c296021f2e351b8a12bbc8be7c88f8d";

describe("local P2P descriptors", () => {
  it("stores tracker-bearing magnets without the video file", () => {
    const magnet = magnetWithTrackers(`magnet:?xt=urn:btih:${hash}`);
    expect(magnet.startsWith(`magnet:?xt=urn:btih:${hash}`)).toBe(true);
    expect(magnet).toContain("tr=");
    expect(magnetWithTrackers(magnet)).toBe(magnet);
  });

  it("accepts room-channel WebRTC signaling payloads and rejects garbage", () => {
    expect(parseLocalP2pSignal({
      kind: "hello",
      infoHash: hash,
      from: "33333333-3333-4333-8333-333333333333",
      to: null,
      role: "seed",
    })).toMatchObject({ kind: "hello", role: "seed", infoHash: hash });
    expect(parseLocalP2pSignal({ kind: "hello" })).toBeNull();
  });

  it("picks a stable WebRTC initiator from session ids", () => {
    expect(shouldInitiateSignal("b-session", "a-session")).toBe(true);
    expect(shouldInitiateSignal("a-session", "b-session")).toBe(false);
    expect(shouldInitiateRoomPeer({
      localSessionId: "a-session",
      remoteSessionId: "z-session",
      localRole: "seed",
      remoteRole: "leech",
    })).toBe(true);
    expect(shouldInitiateRoomPeer({
      localSessionId: "z-session",
      remoteSessionId: "a-session",
      localRole: "leech",
      remoteRole: "seed",
    })).toBe(false);
  });

  it("infers a playable MIME type from the original file name", () => {
    expect(mimeTypeFromFileName("movie.mp4")).toBe("video/mp4");
    expect(mimeTypeFromFileName("clip.webm")).toBe("video/webm");
  });
});
