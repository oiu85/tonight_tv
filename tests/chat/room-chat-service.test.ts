import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  createRoomChatService,
  mergeChatMessages,
  RoomChatError,
  type ChatMessage,
} from "../../src/lib/chat/room-chat-service";
import type { Database } from "../../src/lib/supabase/database.types";

const roomId = "11111111-1111-4111-8111-111111111111";
const otherRoomId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

function message(
  id: string,
  createdAt: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id,
    room_id: roomId,
    user_id: userId,
    sender_display_name: "Viewer B",
    body: "Hello",
    created_at: createdAt,
    ...overrides,
  };
}

function createClientMock() {
  const rpc = vi.fn();
  return {
    rpc,
    client: { rpc } as unknown as SupabaseClient<Database>,
  };
}

describe("room chat collection", () => {
  it("hydrates bounded snapshot rows into ascending authoritative order", () => {
    const first = message(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "2026-08-17T12:00:00.000Z",
    );
    const second = message(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "2026-08-17T12:00:01.000Z",
    );
    const { client } = createClientMock();
    const service = createRoomChatService(client);

    const hydrated = service.hydrate(roomId, [
      { ...second, room_id: undefined },
      { ...first, room_id: undefined },
    ]);

    expect(hydrated.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(hydrated.every((item) => item.room_id === roomId)).toBe(true);
  });

  it("counts Unicode characters like Postgres and preserves sub-millisecond order", async () => {
    const first = message(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "2026-08-17T12:00:00.000001Z",
    );
    const second = message(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "2026-08-17T12:00:00.000002Z",
    );
    const { client, rpc } = createClientMock();
    rpc.mockResolvedValue({
      data: [message("cccccccc-cccc-4ccc-8ccc-cccccccccccc", second.created_at, {
        body: "ok",
      })],
      error: null,
    });
    const service = createRoomChatService(client);

    expect(service.hydrate(roomId, [second, first]).map((item) => item.id)).toEqual([
      first.id,
      second.id,
    ]);
    const emoji = "\u{1F642}";
    await expect(
      service.sendMessage(roomId, emoji.repeat(1000)),
    ).resolves.toBeDefined();
    await expect(
      service.sendMessage(roomId, emoji.repeat(1001)),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("merges a same-room snapshot with a live message received during the fetch race", () => {
    const live = message(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "2026-08-17T12:00:01.000Z",
      { body: "Live while fetching" },
    );
    const { client } = createClientMock();
    const service = createRoomChatService(client);

    service.hydrate(roomId, []);
    service.mergeLiveMessage(live);
    service.hydrate(roomId, []);

    expect(service.getMessages()).toEqual([live]);
  });

  it("does not duplicate the RPC-returned message when Broadcast arrives", async () => {
    const canonical = message(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "2026-08-17T12:00:00.000Z",
      { body: "<script>alert('stored as text')</script>" },
    );
    const { client, rpc } = createClientMock();
    rpc.mockResolvedValue({ data: [canonical], error: null });
    const service = createRoomChatService(client);
    service.hydrate(roomId, []);

    await expect(service.sendMessage(roomId, `  ${canonical.body}  `)).resolves.toEqual(
      canonical,
    );
    service.mergeLiveMessage(canonical);

    expect(rpc).toHaveBeenCalledWith("send_chat_message", {
      p_room_id: roomId,
      p_body: canonical.body,
    });
    expect(service.getMessages()).toEqual([canonical]);
  });

  it("merges same-time messages deterministically by ID", () => {
    const laterId = message(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "2026-08-17T12:00:00.000Z",
    );
    const earlierId = message(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "2026-08-17T12:00:00.000Z",
    );

    expect(mergeChatMessages([], [laterId, earlierId], roomId)).toEqual([
      earlierId,
      laterId,
    ]);
  });

  it("rejects malformed and cross-room live payloads", () => {
    const { client } = createClientMock();
    const service = createRoomChatService(client);
    service.hydrate(roomId, []);

    expect(() =>
      service.mergeLiveMessage(
        message(
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          "2026-08-17T12:00:00.000Z",
          { room_id: otherRoomId },
        ),
      ),
    ).toThrowError(RoomChatError);
    expect(() => service.mergeLiveMessage({ body: "missing identity" })).toThrowError(
      RoomChatError,
    );
  });
});

describe("room chat send errors", () => {
  it.each([
    [
      { code: "P0001", message: "Chat rate limit exceeded" },
      "rate_limited",
    ],
    [
      { code: "42501", message: "Authentication is required" },
      "authentication_required",
    ],
    [
      { code: "42501", message: "Room membership is required" },
      "permission_denied",
    ],
  ])("maps database errors to %s", async (databaseError, expectedCode) => {
    const { client, rpc } = createClientMock();
    rpc.mockResolvedValue({ data: null, error: databaseError });
    const service = createRoomChatService(client);

    await expect(service.sendMessage(roomId, "Hello")).rejects.toMatchObject({
      code: expectedCode,
    });
  });

  it("rejects empty and over-limit messages before sending", async () => {
    const { client, rpc } = createClientMock();
    const service = createRoomChatService(client);

    await expect(service.sendMessage(roomId, "   ")).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(service.sendMessage(roomId, "x".repeat(1001))).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
