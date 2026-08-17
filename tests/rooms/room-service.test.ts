import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  createRoomService,
  type RoomSnapshot,
} from "../../src/lib/rooms/room-service";
import type { Database } from "../../src/lib/supabase/database.types";

const roomId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-08-17T12:00:00.000Z";

function createClientMock(...responses: unknown[]) {
  const rpc = vi.fn();

  for (const response of responses) {
    rpc.mockResolvedValueOnce(response);
  }

  return {
    client: { rpc } as unknown as SupabaseClient<Database>,
    rpc,
  };
}

function createSnapshot(): RoomSnapshot {
  return {
    server_time: timestamp,
    room: {
      id: roomId,
      name: "Movie night",
      owner_user_id: userId,
      created_at: timestamp,
      updated_at: timestamp,
    },
    caller: {
      user_id: userId,
      is_owner: true,
      room_session_id: null,
      display_name: null,
    },
    playback: {
      room_id: roomId,
      current_media_id: null,
      status: "idle",
      anchor_position_sec: 0,
      anchor_server_time: timestamp,
      state_version: 0,
      updated_at: timestamp,
    },
    current_media: null,
    subtitles: [],
    queue: [],
    recent_chat: [],
  };
}

describe("Room service", () => {
  it("keeps create and join RPC calls behind one typed service", async () => {
    const created = {
      room_id: roomId,
      owner_user_id: userId,
      room_name: "Movie night",
      created_at: timestamp,
      updated_at: timestamp,
      playback_status: "idle" as const,
      anchor_position_sec: 0,
      anchor_server_time: timestamp,
      state_version: 0,
    };
    const joined = {
      session_id: "33333333-3333-4333-8333-333333333333",
      room_id: roomId,
      user_id: userId,
      display_name: "Viewer",
      joined_at: timestamp,
      updated_at: timestamp,
    };
    const { client, rpc } = createClientMock(
      { data: [created], error: null },
      { data: [joined], error: null },
    );
    const service = createRoomService(client);

    await expect(service.createRoom("Movie night")).resolves.toEqual(created);
    await expect(service.joinRoom(roomId, "Viewer")).resolves.toEqual(joined);
    expect(rpc).toHaveBeenNthCalledWith(1, "create_room", {
      p_name: "Movie night",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "join_room", {
      p_room_id: roomId,
      p_display_name: "Viewer",
    });
  });

  it("lists only the authenticated owner's rooms newest first", async () => {
    const rooms = [
      {
        id: roomId,
        owner_user_id: userId,
        name: "Movie night",
        created_at: timestamp,
        updated_at: timestamp,
      },
    ];
    const order = vi.fn().mockResolvedValue({ data: rooms, error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: userId } },
          error: null,
        }),
      },
      from,
    } as unknown as SupabaseClient<Database>;

    await expect(createRoomService(client).listOwnedRooms()).resolves.toEqual(rooms);
    expect(from).toHaveBeenCalledWith("rooms");
    expect(select).toHaveBeenCalledWith("*");
    expect(eq).toHaveBeenCalledWith("owner_user_id", userId);
    expect(order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  it("normalizes and forwards owner-authorized room renames", async () => {
    const renamed = {
      id: roomId,
      owner_user_id: userId,
      name: "Saturday cinema",
      created_at: timestamp,
      updated_at: timestamp,
    };
    const { client, rpc } = createClientMock({ data: [renamed], error: null });

    await expect(
      createRoomService(client).renameRoom(roomId, "  Saturday cinema  "),
    ).resolves.toEqual(renamed);
    expect(rpc).toHaveBeenCalledWith("rename_room", {
      p_room_id: roomId,
      p_name: "Saturday cinema",
    });
  });

  it("maps an empty exact-ID preview to a stable not-found error", async () => {
    const { client } = createClientMock({ data: [], error: null });

    await expect(
      createRoomService(client).getRoomJoinPreview(roomId),
    ).rejects.toMatchObject({ code: "room_not_found" });
  });

  it("returns the validated snapshot and forwards the bounded-limit request", async () => {
    const snapshot = createSnapshot();
    const { client, rpc } = createClientMock({ data: snapshot, error: null });

    await expect(createRoomService(client).fetchSnapshot(roomId, 25)).resolves.toEqual(
      snapshot,
    );
    expect(rpc).toHaveBeenCalledWith("get_room_snapshot", {
      p_room_id: roomId,
      p_chat_limit: 25,
    });
  });

  it("rejects malformed snapshot responses before they reach room state", async () => {
    const { client } = createClientMock({
      data: { room: { id: roomId } },
      error: null,
    });

    await expect(createRoomService(client).fetchSnapshot(roomId)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("samples a valid database timestamp", async () => {
    const { client, rpc } = createClientMock({ data: timestamp, error: null });

    await expect(createRoomService(client).sampleServerTime()).resolves.toBe(timestamp);
    expect(rpc).toHaveBeenCalledWith("get_server_time");
  });

  it("converts database failures to structured errors without exposing raw text", async () => {
    const { client } = createClientMock({
      data: null,
      error: { code: "42501", message: "Room membership is required" },
    });

    await expect(createRoomService(client).fetchSnapshot(roomId)).rejects.toMatchObject({
      code: "permission_denied",
      databaseCode: "42501",
      message: "You do not have access to this room.",
    });
  });
});
