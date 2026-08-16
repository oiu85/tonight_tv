import { describe, expect, it } from "vitest";

import {
  calculateDrift,
  comparePlaybackVersions,
  expectedCanonicalPosition,
  selectCorrectionDecision,
} from "../../src/lib/sync/sync-core";

const anchor = "2026-08-17T12:00:00.000Z";

describe("canonical position math", () => {
  it("keeps paused and ended states frozen at the anchor", () => {
    const muchLater = Date.parse(anchor) + 60_000;
    expect(
      expectedCanonicalPosition(
        { status: "paused", anchor_position_sec: 12, anchor_server_time: anchor },
        muchLater,
      ),
    ).toBe(12);
    expect(
      expectedCanonicalPosition(
        { status: "ended", anchor_position_sec: 80, anchor_server_time: anchor },
        muchLater,
      ),
    ).toBe(80);
  });

  it("advances playing state from server time and clamps negative elapsed", () => {
    expect(
      expectedCanonicalPosition(
        { status: "playing", anchor_position_sec: 12, anchor_server_time: anchor },
        Date.parse(anchor) + 2_500,
      ),
    ).toBe(14.5);
    expect(
      expectedCanonicalPosition(
        { status: "playing", anchor_position_sec: 12, anchor_server_time: anchor },
        Date.parse(anchor) - 1_000,
      ),
    ).toBe(12);
  });

  it("returns no live position for idle and clamps to known duration", () => {
    expect(
      expectedCanonicalPosition(
        { status: "idle", anchor_position_sec: 0, anchor_server_time: anchor },
        Date.parse(anchor),
      ),
    ).toBeNull();
    expect(
      expectedCanonicalPosition(
        { status: "playing", anchor_position_sec: 99, anchor_server_time: anchor },
        Date.parse(anchor) + 10_000,
        100,
      ),
    ).toBe(100);
  });

  it("uses absolute instants rather than local timezone components", () => {
    const sameInstantWithOffset = "2026-08-17T15:00:00.000+03:00";
    expect(Date.parse(sameInstantWithOffset)).toBe(Date.parse(anchor));
    expect(
      expectedCanonicalPosition(
        {
          status: "playing",
          anchor_position_sec: 4,
          anchor_server_time: sameInstantWithOffset,
        },
        Date.parse(anchor) + 1_000,
      ),
    ).toBe(5);
  });
});

describe("drift and version decisions", () => {
  it("defines positive drift as ahead and negative drift as behind", () => {
    expect(calculateDrift(12.5, 12)).toBe(0.5);
    expect(calculateDrift(11.5, 12)).toBe(-0.5);
  });

  it("classifies duplicate, old, sequential, and gapped versions", () => {
    expect(comparePlaybackVersions(7, 7)).toBe("stale_or_duplicate");
    expect(comparePlaybackVersions(6, 7)).toBe("stale_or_duplicate");
    expect(comparePlaybackVersions(8, 7)).toBe("sequential");
    expect(comparePlaybackVersions(10, 7)).toBe("gap");
  });
});

describe("drift correction policy", () => {
  function decide(
    driftSec: number,
    overrides: Partial<Parameters<typeof selectCorrectionDecision>[0]> = {},
  ) {
    return selectCorrectionDecision({
      state: { status: "playing" },
      driftSec,
      expectedPositionSec: 20,
      playerReady: true,
      seekable: true,
      buffering: false,
      currentPlaybackRate: 1,
      rateCorrectionActive: false,
      ...overrides,
    });
  }

  it("does nothing below the correction threshold", () => {
    expect(decide(0.249)).toEqual({ kind: "none" });
  });

  it("speeds up a slightly late player and slows a slightly early player", () => {
    expect(decide(-0.5)).toEqual({ kind: "set_rate", rate: 1.03 });
    expect(decide(0.5)).toEqual({ kind: "set_rate", rate: 0.97 });
  });

  it("hard seeks large drift and waits when the target is not seekable", () => {
    expect(decide(-1.01)).toEqual({
      kind: "seek",
      positionSec: 20,
      resetRate: false,
    });
    expect(decide(2, { seekable: false })).toEqual({
      kind: "wait",
      resetRate: false,
    });
  });

  it("resets rate after convergence and never rate-catches up while paused", () => {
    expect(
      decide(0.05, {
        currentPlaybackRate: 1.03,
        rateCorrectionActive: true,
      }),
    ).toEqual({ kind: "reset_rate" });
    expect(
      decide(-0.5, {
        state: { status: "paused" },
        currentPlaybackRate: 1.03,
      }),
    ).toEqual({ kind: "seek", positionSec: 20, resetRate: true });
  });
});
