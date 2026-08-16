import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  createPlaybackCommandService,
  type CanonicalPlaybackState,
} from "../../src/lib/playback/playback-command-service";
import type { Database } from "../../src/lib/supabase/database.types";

const roomId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-08-17T12:00:00.000Z";

function createState(overrides: Partial<CanonicalPlaybackState> = {}) {
  return {
    room_id: roomId,
    current_media_id: mediaId,
    status: "playing" as const,
    anchor_position_sec: 12.5,
    anchor_server_time: timestamp,
    state_version: 8,
    updated_at: timestamp,
    ...overrides,
  };
}

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

describe("Playback command service", () => {
  it("routes every command through the canonical typed RPC surface", async () => {
    const state = createState();
    const response = { data: [state], error: null };
    const { client, rpc } = createClientMock(
      response,
      response,
      response,
      response,
      response,
      response,
      response,
    );
    const service = createPlaybackCommandService(client);

    await expect(service.play(roomId, 7)).resolves.toEqual(state);
    await expect(service.pause(roomId, 7)).resolves.toEqual(state);
    await expect(service.seek(roomId, 7, 42.125)).resolves.toEqual(state);
    await expect(service.restart(roomId, 7)).resolves.toEqual(state);
    await expect(service.selectMedia(roomId, 7, mediaId, true)).resolves.toEqual(state);
    await expect(service.markEnded(roomId, 7)).resolves.toEqual(state);
    await expect(service.playNext(roomId, 7)).resolves.toEqual(state);

    expect(rpc).toHaveBeenNthCalledWith(1, "room_play", {
      p_room_id: roomId,
      p_expected_version: 7,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "room_pause", {
      p_room_id: roomId,
      p_expected_version: 7,
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "room_seek", {
      p_room_id: roomId,
      p_expected_version: 7,
      p_target_position_sec: 42.125,
    });
    expect(rpc).toHaveBeenNthCalledWith(4, "room_restart", {
      p_room_id: roomId,
      p_expected_version: 7,
    });
    expect(rpc).toHaveBeenNthCalledWith(5, "room_select_media", {
      p_room_id: roomId,
      p_expected_version: 7,
      p_media_id: mediaId,
      p_autoplay: true,
    });
    expect(rpc).toHaveBeenNthCalledWith(6, "room_mark_ended", {
      p_room_id: roomId,
      p_expected_version: 7,
    });
    expect(rpc).toHaveBeenNthCalledWith(7, "room_play_next", {
      p_room_id: roomId,
      p_expected_version: 7,
    });
  });

  it("maps a database serialization conflict to stale_version", async () => {
    const { client } = createClientMock({
      data: null,
      error: { code: "40001", message: "Playback state version conflict" },
    });

    await expect(createPlaybackCommandService(client).play(roomId, 7)).rejects.toMatchObject({
      code: "stale_version",
      databaseCode: "40001",
    });
  });

  it("maps ownership failure without exposing the database message", async () => {
    const { client } = createClientMock({
      data: null,
      error: { code: "42501", message: "Room ownership is required" },
    });

    await expect(createPlaybackCommandService(client).pause(roomId, 7)).rejects.toMatchObject({
      code: "permission_denied",
      message: "Only the room owner may control shared playback.",
    });
  });

  it("distinguishes an exhausted queue from a generic request failure", async () => {
    const { client } = createClientMock({
      data: null,
      error: { code: "P0002", message: "No next media item is available" },
    });

    await expect(createPlaybackCommandService(client).playNext(roomId, 7)).rejects.toMatchObject({
      code: "no_next_media",
    });
  });

  it("rejects invalid versions and seek targets before making an RPC", async () => {
    const { client, rpc } = createClientMock();
    const service = createPlaybackCommandService(client);

    await expect(service.play(roomId, -1)).rejects.toMatchObject({
      code: "invalid_command",
    });
    await expect(service.seek(roomId, 0, Number.NaN)).rejects.toMatchObject({
      code: "invalid_command",
    });
    await expect(service.seek(roomId, 0, Number.POSITIVE_INFINITY)).rejects.toMatchObject({
      code: "invalid_command",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never invents canonical state when the RPC response is malformed", async () => {
    const { client } = createClientMock({ data: [], error: null });

    await expect(createPlaybackCommandService(client).restart(roomId, 7)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});
