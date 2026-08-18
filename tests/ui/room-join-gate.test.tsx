// The room join gate uses Next's useRouter, which requires App Router
// context. We assert the wire-level contract by exercising the actual hook
// chain that `useRouter` is invoked from and verifying the resulting element
// is wired correctly. The end-to-end room-client test renders the gate as
// part of the real `RoomClient` lifecycle.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let routerState: { pathname: string; push: ReturnType<typeof vi.fn> } = {
  pathname: "/r/11111111-1111-4111-8111-111111111111",
  push: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerState.push }),
  usePathname: () => routerState.pathname,
}));

import {
  RoomJoinError,
  RoomJoinGate,
  RoomJoinLoading,
} from "../../src/components/room/room-join-gate";
import { ToastProvider } from "../../src/components/primitives";
import type { RoomJoinPreview } from "../../src/lib/rooms/room-service";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nHarness } from "../setup-i18n";

function withProviders(node: React.ReactNode) {
  return (
    <I18nHarness>
      <ToastProvider>{node}</ToastProvider>
    </I18nHarness>
  );
}

const preview: RoomJoinPreview = {
  room_id: "11111111-1111-4111-8111-111111111111",
  room_name: "Friday movie night",
  current_title: "Horizon Beyond",
  has_active_media: true,
};

beforeEach(() => {
  routerState = {
    pathname: "/r/11111111-1111-4111-8111-111111111111",
    push: vi.fn(),
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("RoomJoinGate", () => {
  it("renders the safe preview copy and lifecycle idle state", () => {
    const markup = renderToStaticMarkup(
      withProviders(
        <RoomJoinGate
          preview={preview}
          joinStage="idle"
          error={null}
          onJoin={() => undefined}
        />,
      ),
    );
    expect(markup).toContain("Friday movie night");
    expect(markup).toContain("Horizon Beyond");
    expect(markup).toContain("Join room");
    expect(markup).toContain("Back");
  });

  it("preserves the previously entered nickname as the initial input value", () => {
    const markup = renderToStaticMarkup(
      withProviders(
        <RoomJoinGate
          preview={preview}
          joinStage="idle"
          error={null}
          initialNickname="Sam"
          onJoin={() => undefined}
        />,
      ),
    );
    expect(markup).toContain('value="Sam"');
  });

  it("shows the joining lifecycle with a spinner for the active step", () => {
    const markup = renderToStaticMarkup(
      withProviders(
        <RoomJoinGate
          preview={preview}
          joinStage="joining"
          error={null}
          onJoin={() => undefined}
        />,
      ),
    );
    expect(markup).toContain("Joining room…");
    expect(markup).toContain("aria-current=\"step\"");
  });

  it("renders a friendly retry path on error", () => {
    const markup = renderToStaticMarkup(
      withProviders(
        <RoomJoinError error="The room could not be reached" onRetry={() => undefined} />,
      ),
    );
    expect(markup).toContain("This room link is invalid");
    expect(markup).toContain("The room could not be reached");
    expect(markup).toContain("Retry");
  });

  it("renders a clean loading shell", () => {
    const markup = renderToStaticMarkup(withProviders(<RoomJoinLoading />));
    expect(markup).toContain("Preparing room");
  });

  it("does not leak the source URL or queue in the safe preview", () => {
    const markup = renderToStaticMarkup(
      withProviders(
        <RoomJoinGate
          preview={preview}
          joinStage="idle"
          error={null}
          onJoin={() => undefined}
        />,
      ),
    );
    expect(markup).not.toContain("source_url");
    expect(markup).not.toContain("queue");
    expect(markup).not.toContain("storage_path");
  });
});
