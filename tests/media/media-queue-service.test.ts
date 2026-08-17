import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  createMediaQueueService,
  type MediaItem,
} from "../../src/lib/media/media-queue-service";
import type { PlaybackCommandService } from "../../src/lib/playback/playback-command-service";
import type { Database } from "../../src/lib/supabase/database.types";

const roomId = "11111111-1111-4111-8111-111111111111";
const mediaA = "22222222-2222-4222-8222-222222222222";
const mediaB = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-08-17T12:00:00.000Z";

function item(id: string, queuePosition: number): MediaItem {
  return {
    id,
    room_id: roomId,
    title: `Media ${queuePosition}`,
    source_url: `https://media.example.test/${queuePosition}.mp4`,
    source_type: "mp4",
    source_revision: 1,
    youtube_video_id: null,
    torrent_info_hash: null,
    torrent_input_kind: null,
    torrent_magnet_uri: null,
    torrent_metadata_path: null,
    torrent_name: null,
    torrent_file_index: null,
    torrent_file_path: null,
    torrent_file_name: null,
    torrent_file_size: null,
    queue_position: queuePosition,
    created_by: "44444444-4444-4444-8444-444444444444",
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function createClientMock(...responses: unknown[]) {
  const rpc = vi.fn();
  const upload = vi.fn(async () => ({ data: {}, error: null }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  for (const response of responses) {
    rpc.mockResolvedValueOnce(response);
  }
  return {
    client: {
      rpc,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  torrent_info_hash: null,
                  torrent_input_kind: null,
                  torrent_magnet_uri: null,
                  torrent_metadata_path: null,
                },
                error: null,
              })),
            })),
          })),
        })),
      })),
      storage: {
        from: vi.fn(() => ({
          upload,
          remove,
        })),
      },
    } as unknown as SupabaseClient<Database>,
    rpc,
    upload,
    remove,
  };
}

describe("media queue service", () => {
  it("normalizes add/edit input and uses only the owner RPC boundary", async () => {
    const first = item(mediaA, 0);
    const edited = { ...first, title: "Updated", source_type: "hls" as const };
    const { client, rpc } = createClientMock(
      { data: [first], error: null },
      { data: [edited], error: null },
    );
    const service = createMediaQueueService(client);

    await expect(
      service.addMedia(roomId, {
        title: "  Media 0  ",
        sourceUrl: "  https://media.example.test/0.mp4  ",
        sourceType: "mp4",
      }),
    ).resolves.toEqual(first);
    await expect(
      service.editMedia(roomId, mediaA, {
        title: " Updated ",
        sourceUrl: "https://media.example.test/live.m3u8",
        sourceType: "hls",
      }),
    ).resolves.toEqual(edited);

    expect(rpc).toHaveBeenNthCalledWith(1, "add_media_item", {
      p_room_id: roomId,
      p_title: "Media 0",
      p_source_url: "https://media.example.test/0.mp4",
      p_source_type: "mp4",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "edit_media_item", {
      p_room_id: roomId,
      p_media_id: mediaA,
      p_title: "Updated",
      p_source_url: "https://media.example.test/live.m3u8",
      p_source_type: "hls",
    });
  });

  it("sends one atomic reorder RPC and rejects duplicate IDs locally", async () => {
    const ordered = [item(mediaB, 0), item(mediaA, 1)];
    const { client, rpc } = createClientMock({ data: ordered, error: null });
    const service = createMediaQueueService(client);

    await expect(service.reorderMedia(roomId, [mediaB, mediaA])).resolves.toEqual(ordered);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("reorder_media_items", {
      p_room_id: roomId,
      p_ordered_media_ids: [mediaB, mediaA],
    });

    await expect(service.reorderMedia(roomId, [mediaA, mediaA])).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("maps viewer denial and current-media deletion to stable domain errors", async () => {
    const { client } = createClientMock(
      { data: null, error: { code: "42501", message: "Room ownership is required" } },
      { data: null, error: { code: "55000", message: "Current media cannot be removed" } },
    );
    const service = createMediaQueueService(client);

    await expect(
      service.addMedia(roomId, {
        title: "Denied",
        sourceUrl: "https://media.example.test/denied.mp4",
        sourceType: "mp4",
      }),
    ).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.removeMedia(roomId, mediaA)).rejects.toMatchObject({
      code: "current_media_cannot_be_removed",
      databaseCode: "55000",
    });
  });

  it("rejects watch-page credentials and malformed input without network probing", async () => {
    const { client, rpc } = createClientMock();
    const service = createMediaQueueService(client);

    await expect(
      service.addMedia(roomId, {
        title: "Credentials",
        sourceUrl: "https://user:secret@example.test/watch/123",
        sourceType: "auto",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      service.addMedia(roomId, {
        title: " ",
        sourceUrl: "not-a-url",
        sourceType: "auto",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("integrates manual next through the existing authoritative playback service", async () => {
    const state = {
      room_id: roomId,
      current_media_id: mediaB,
      status: "playing" as const,
      anchor_position_sec: 0,
      anchor_server_time: timestamp,
      state_version: 8,
      updated_at: timestamp,
    };
    const playNext = vi.fn(async () => state);
    const playback = { playNext } as Pick<PlaybackCommandService, "playNext">;
    const { client, rpc } = createClientMock();
    const service = createMediaQueueService(client, playback);

    await expect(service.playNext(roomId, 7)).resolves.toEqual(state);
    expect(playNext).toHaveBeenCalledWith(roomId, 7);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stores Torrent identity without uploading a .torrent file", async () => {
    const torrentItem: MediaItem = {
      ...item(mediaA, 0),
      source_url: null,
      source_type: "torrent",
      torrent_info_hash: "0123456789abcdef0123456789abcdef01234567",
      torrent_input_kind: "magnet",
      torrent_magnet_uri: `magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567`,
      torrent_metadata_path: null,
      torrent_name: "Movie",
      torrent_file_index: 4,
      torrent_file_path: "Movie/Movie.mkv",
      torrent_file_name: "Movie.mkv",
      torrent_file_size: 1_000,
    };
    const { client, rpc, upload } = createClientMock({ data: [torrentItem], error: null });
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(mediaA);
    const service = createMediaQueueService(client);
    await expect(service.addMedia(roomId, {
      title: "Movie",
      sourceType: "torrent",
      torrent: {
        infoHash: torrentItem.torrent_info_hash!,
        inputKind: "magnet",
        magnetUri: torrentItem.torrent_magnet_uri,
        torrentName: "Movie",
        fileIndex: 4,
        filePath: "Movie/Movie.mkv",
        fileName: "Movie.mkv",
        fileSize: 1_000,
      },
    })).resolves.toEqual(torrentItem);

    expect(upload).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("add_media_item", expect.objectContaining({
      p_media_id: mediaA,
      p_source_type: "torrent",
      p_source_url: undefined,
      p_torrent_info_hash: torrentItem.torrent_info_hash,
      p_torrent_metadata_path: undefined,
      p_torrent_file_index: 4,
    }));
    randomUuid.mockRestore();
  });
});
