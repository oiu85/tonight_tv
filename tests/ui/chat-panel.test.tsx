import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatPanel } from "../../src/components/room/components/chat-panel";
import { RoomChatError } from "../../src/lib/chat/room-chat-service";
import { roomUiErrorFromUnknown } from "../../src/lib/room/domain-errors";
import { I18nHarness } from "../setup-i18n";

const userId = "33333333-3333-4333-8333-333333333333";

describe("ChatPanel wiring", () => {
  it("renders an empty-state for chat when no messages are present", () => {
    const markup = renderToStaticMarkup(
      <I18nHarness>
        <ChatPanel
          messages={[]}
          currentUserId={userId}
          connected={true}
          onSend={() => Promise.resolve()}
        />
      </I18nHarness>,
    );
    expect(markup).toContain("No messages yet");
    expect(markup).toContain('aria-live="polite"');
  });

  it("disables the composer when the room is reconnecting", () => {
    const markup = renderToStaticMarkup(
      <I18nHarness>
        <ChatPanel
          messages={[]}
          currentUserId={userId}
          connected={false}
          onSend={() => Promise.resolve()}
        />
      </I18nHarness>,
    );
    expect(markup).toContain("Reconnecting");
    expect(markup).toContain('disabled=""');
  });

  it("exposes the current user message surface distinctly", () => {
    const messages = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        room_id: "22222222-2222-4222-8222-222222222222",
        user_id: userId,
        sender_display_name: "Me",
        body: "hello",
        created_at: "2026-08-17T12:00:00.000Z",
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        room_id: "22222222-2222-4222-8222-222222222222",
        user_id: "99999999-9999-4999-8999-999999999999",
        sender_display_name: "Other",
        body: "hey",
        created_at: "2026-08-17T12:00:01.000Z",
      },
    ];
    const markup = renderToStaticMarkup(
      <I18nHarness>
        <ChatPanel
          messages={messages}
          currentUserId={userId}
          connected={true}
          onSend={() => Promise.resolve()}
        />
      </I18nHarness>,
    );
    expect(markup).toContain("tt-message-current");
    expect(markup).toContain("(you)");
  });

  it("produces a typed rate-limit error through the chat service contract", () => {
    // Smoke test that the chat error class correctly carries the rate-limit code;
    // the room UI uses this code to display a safe, draft-preserving message.
    const error = new RoomChatError("rate_limited", "You're sending messages too quickly. Try again shortly.");
    expect(error.code).toBe("rate_limited");
    expect(error.name).toBe("RoomChatError");
    // Send the same shape through the friendly mapper to confirm the
    // user copy is never the raw internal text.
    const friendly = roomUiErrorFromUnknown(error, "ignored");
    expect(friendly.kind).toBe("chat-rate-limit");
    expect(friendly.message).not.toMatch(/postgres/i);
  });
});
