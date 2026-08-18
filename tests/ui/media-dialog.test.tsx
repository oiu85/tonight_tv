// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MediaDialog } from "../../src/components/room/components/media-dialog";
import { I18nHarness } from "../setup-i18n";

afterEach(cleanup);
const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  HTMLDialogElement.prototype.close = function close() { this.open = false; };
});

afterAll(() => {
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
});

describe("Stream from Device media dialog", () => {
  it("passes the browser File directly to the local P2P preparation path", async () => {
    const onSubmit = vi.fn();
    const onSubmitLocalP2p = vi.fn(async () => undefined);
    const view = render(
      <I18nHarness>
        <MediaDialog
          open
          onOpenChange={vi.fn()}
          roomId="11111111-1111-4111-8111-111111111111"
          item={null}
          submitting={false}
          error={null}
          localP2pState={{
            status: "idle",
            infoHash: null,
            peerCount: 0,
            uploadSpeed: 0,
            downloadSpeed: 0,
            progress: 0,
            error: null,
          }}
          onSubmit={onSubmit}
          onSubmitLocalP2p={onSubmitLocalP2p}
        />
      </I18nHarness>,
    );

    fireEvent.change(view.getByLabelText("Source Type"), {
      target: { value: "local_p2p" },
    });
    fireEvent.change(view.getByLabelText("Title"), {
      target: { value: "Local fixture" },
    });
    const file = new File(["fixture"], "fixture.mp4", { type: "video/mp4" });
    fireEvent.change(view.getByLabelText("Choose Video"), {
      target: { files: [file] },
    });
    fireEvent.click(view.getByRole("button", { name: "Start P2P Stream" }));

    await waitFor(() => {
      expect(onSubmitLocalP2p).toHaveBeenCalledWith("Local fixture", file, false);
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
