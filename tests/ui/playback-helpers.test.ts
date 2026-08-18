import { describe, expect, it, vi } from "vitest";

import { isPlaybackPresentationHeld, syncStatusCopy } from "../../src/components/room/components/playback-helpers";

describe("isPlaybackPresentationHeld", () => {
  it("covers only the unstable alignment statuses", () => {
    expect(isPlaybackPresentationHeld("seeking")).toBe(true);
    expect(isPlaybackPresentationHeld("aligning")).toBe(true);
    expect(isPlaybackPresentationHeld("starting")).toBe(true);
    expect(isPlaybackPresentationHeld("synchronizing")).toBe(false);
    expect(isPlaybackPresentationHeld("catching_up")).toBe(false);
    expect(isPlaybackPresentationHeld("live")).toBe(false);
    expect(isPlaybackPresentationHeld("paused")).toBe(false);
  });
});

describe("syncStatusCopy", () => {
  it("uses keys relative to the scoped sync translator", () => {
    const translate = vi.fn((key: string, values?: Record<string, string | number | Date>) =>
      values?.seconds === undefined ? key : `${key}:${values.seconds}`,
    );

    expect(syncStatusCopy("live", 0.5, "playing", translate)).toEqual({
      label: "live",
      tone: "live",
      detail: "live",
    });
    expect(syncStatusCopy("live", 4.4, "playing", translate)).toEqual({
      label: "behindLabel:4",
      tone: "warning",
      detail: "behind",
    });
    expect(syncStatusCopy("buffering", 0, "playing", translate)).toEqual({
      label: "buffering",
      tone: "warning",
      detail: "buffering",
    });
    expect(syncStatusCopy("live", 0, "paused", translate)).toEqual({
      label: "paused",
      tone: "warning",
      detail: "paused",
    });

    expect(translate.mock.calls.flatMap((call) => call[0])).not.toContain("sync.live");
  });
});
