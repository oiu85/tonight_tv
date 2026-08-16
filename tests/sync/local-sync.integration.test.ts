import { createClient, type Session } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createPlaybackCommandService } from "../../src/lib/playback/playback-command-service";
import { createRoomChannelService } from "../../src/lib/realtime/room-channel-service";
import { createRoomService } from "../../src/lib/rooms/room-service";
import { createRoomClockCalibrator } from "../../src/lib/sync/clock-calibrator";
import { createRoomSyncCoordinator } from "../../src/lib/sync/room-sync-coordinator";
import type {
  PlayerSyncAdapter,
  SyncMedia,
} from "../../src/lib/sync/sync-core";
import type { Database } from "../../src/lib/supabase/database.types";

const shouldRun = process.env.TONIGHT_TV_RUN_LOCAL_REALTIME_TESTS === "1";
const localUrl = process.env.TONIGHT_TV_LOCAL_SUPABASE_URL ?? "";
const publishableKey = process.env.TONIGHT_TV_LOCAL_SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.TONIGHT_TV_LOCAL_SUPABASE_SECRET_KEY ?? "";

function createTestClient(key = publishableKey) {
  return createClient<Database>(localUrl, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

class IntegrationPlayer implements PlayerSyncAdapter {
  mediaId: string | null = null;
  currentTime = 0;
  playbackRate = 1;
  paused = true;
  readonly play = vi.fn(async () => {
    this.paused = false;
  });
  readonly pause = vi.fn(async () => {
    this.paused = true;
  });

  getMediaId() {
    return this.mediaId;
  }

  async loadMedia(media: SyncMedia | null) {
    this.mediaId = media?.id ?? null;
    this.currentTime = 0;
  }

  async waitUntilReady() {}
  isReady() {
    return true;
  }
  isSeekable() {
    return true;
  }
  isPaused() {
    return this.paused;
  }
  getCurrentTime() {
    return this.currentTime;
  }
  getDuration() {
    return 300;
  }
  async seek(positionSec: number) {
    this.currentTime = positionSec;
  }
  getPlaybackRate() {
    return this.playbackRate;
  }
  setPlaybackRate(rate: number) {
    this.playbackRate = rate;
  }
}

describe.runIf(shouldRun)("local Supabase synchronization transport", () => {
  const clients: ReturnType<typeof createTestClient>[] = [];
  const userIds: string[] = [];
  const coordinators: ReturnType<typeof createRoomSyncCoordinator>[] = [];
  let roomId: string | null = null;

  afterAll(async () => {
    await Promise.allSettled(coordinators.map((coordinator) => coordinator.stop()));
    if (!localUrl.startsWith("http://127.0.0.1:")) {
      return;
    }

    const admin = createTestClient(secretKey);
    if (roomId) {
      await admin.from("rooms").delete().eq("id", roomId);
    }
    for (const userId of userIds) {
      await admin.auth.admin.deleteUser(userId);
    }
    await Promise.all(clients.map((client) => client.removeAllChannels()));
  });

  it(
    "delivers canonical Play/Pause/Seek to one owner and two viewer engines",
    async () => {
      expect(localUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(publishableKey).toBeTruthy();
      expect(secretKey).toBeTruthy();

      const owner = createTestClient();
      const viewerOne = createTestClient();
      const viewerTwo = createTestClient();
      const admin = createTestClient(secretKey);
      clients.push(owner, viewerOne, viewerTwo, admin);

      const ownerAuth = await owner.auth.signUp({
        email: `sync-owner-${crypto.randomUUID()}@example.test`,
        password: "local-sync-password",
      });
      const viewerOneAuth = await viewerOne.auth.signInAnonymously();
      const viewerTwoAuth = await viewerTwo.auth.signInAnonymously();
      expect(ownerAuth.error).toBeNull();
      expect(viewerOneAuth.error).toBeNull();
      expect(viewerTwoAuth.error).toBeNull();

      const sessions = [
        ownerAuth.data.session,
        viewerOneAuth.data.session,
        viewerTwoAuth.data.session,
      ] as Session[];
      userIds.push(...sessions.map((session) => session.user.id));

      const created = await owner.rpc("create_room", {
        p_name: "Local Sync Room",
      });
      expect(created.error).toBeNull();
      roomId = created.data?.[0]?.room_id ?? null;
      expect(roomId).toBeTruthy();

      const displayNames = ["Owner A", "Viewer B", "Viewer C"];
      const actors = [owner, viewerOne, viewerTwo];
      const joins = await Promise.all(
        actors.map((client, index) =>
          client.rpc("join_room", {
            p_room_id: roomId as string,
            p_display_name: displayNames[index],
          }),
        ),
      );
      for (const join of joins) {
        expect(join.error).toBeNull();
      }

      const mediaId = crypto.randomUUID();
      const inserted = await admin.from("media_items").insert({
        id: mediaId,
        room_id: roomId as string,
        title: "Local Sync Media",
        source_url: "https://media.example.test/local-sync.mp4",
        source_type: "mp4",
        queue_position: 0,
        created_by: sessions[0].user.id,
      });
      expect(inserted.error).toBeNull();

      const players = actors.map(() => new IntegrationPlayer());
      actors.forEach((client, index) => {
        const roomService = createRoomService(client);
        const coordinator = createRoomSyncCoordinator({
          roomService,
          channelService: createRoomChannelService(client),
          clockCalibrator: createRoomClockCalibrator(roomService, {
            sampleCount: 1,
          }),
          player: players[index],
        });
        coordinators.push(coordinator);
      });

      await Promise.all(
        coordinators.map((coordinator, index) =>
          coordinator.start({
            roomId: roomId as string,
            identity: {
              userId: sessions[index].user.id,
              roomSessionId: joins[index].data?.[0]?.session_id as string,
              displayName: displayNames[index],
            },
          }),
        ),
      );

      const commands = createPlaybackCommandService(owner);
      const selected = await commands.selectMedia(
        roomId as string,
        0,
        mediaId,
        false,
      );
      await vi.waitFor(
        () => {
          expect(
            coordinators.map((coordinator) => {
              const state = coordinator.getState();
              return {
                version: state.canonicalPlayback?.state_version,
                status: state.status,
                reason: state.reason,
                error: state.error?.message ?? null,
              };
            }),
          ).toEqual(
            Array.from({ length: 3 }, () => ({
              version: selected.state_version,
              status: "paused",
              reason: "room_metadata_changed",
              error: null,
            })),
          );
        },
        { timeout: 10_000, interval: 50 },
      );

      const playing = await commands.play(roomId as string, selected.state_version);
      await vi.waitFor(
        () => {
          expect(players.every((player) => !player.paused)).toBe(true);
          expect(
            coordinators.every(
              (coordinator) =>
                coordinator.getState().canonicalPlayback?.state_version ===
                playing.state_version,
            ),
          ).toBe(true);
        },
        { timeout: 10_000, interval: 50 },
      );

      const sought = await commands.seek(roomId as string, playing.state_version, 42);
      await vi.waitFor(
        () => {
          expect(
            players.every((player) => Math.abs(player.currentTime - 42) < 0.5),
          ).toBe(true);
          expect(
            coordinators.every(
              (coordinator) =>
                coordinator.getState().canonicalPlayback?.state_version ===
                sought.state_version,
            ),
          ).toBe(true);
        },
        { timeout: 10_000, interval: 50 },
      );

      const paused = await commands.pause(roomId as string, sought.state_version);
      await vi.waitFor(
        () => {
          expect(players.every((player) => player.paused)).toBe(true);
          expect(
            coordinators.every(
              (coordinator) =>
                coordinator.getState().canonicalPlayback?.state_version ===
                paused.state_version,
            ),
          ).toBe(true);
        },
        { timeout: 10_000, interval: 50 },
      );
    },
    45_000,
  );
});
