import { describe, expect, it, vi } from "vitest";

import { PlaybackCommandError } from "../../src/lib/playback/playback-command-service";
import { settlePostMutationPlayback } from "../../src/lib/room/post-mutation-playback";

describe("post-mutation playback settlement", () => {
  it("keeps a successful queue mutation successful when reconciliation fails", async () => {
    const reconcile = vi.fn(async () => {
      const error = new Error("player failed after the queue RPC");
      error.name = "RoomSyncError";
      throw error;
    });

    await expect(settlePostMutationPlayback({
      reconcile,
      selectionFailureMessage: "selection failed",
      reconciliationFailureMessage: "Media was added, but playback is still synchronizing.",
    })).resolves.toEqual({
      selectionSucceeded: true,
      warning: "Media was added, but playback is still synchronizing.",
    });
  });

  it("reports selection failure separately and still attempts reconciliation", async () => {
    const select = vi.fn(async () => {
      throw new PlaybackCommandError("request_failed", "database details");
    });
    const reconcile = vi.fn(async () => undefined);

    const result = await settlePostMutationPlayback({
      select,
      reconcile,
      selectionFailureMessage: "Media was added, but playback could not switch to it yet.",
      reconciliationFailureMessage: "Media was added, but playback is still synchronizing.",
    });

    expect(result).toEqual({
      selectionSucceeded: false,
      warning: "Media was added, but playback could not switch to it yet.",
    });
    expect(reconcile).toHaveBeenCalledOnce();
  });
});
