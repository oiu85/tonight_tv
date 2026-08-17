import { createClient, type Session } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createRoomChatService } from "../../src/lib/chat/room-chat-service";
import { createMediaQueueService } from "../../src/lib/media/media-queue-service";
import { createPlaybackCommandService } from "../../src/lib/playback/playback-command-service";
import { createRoomChannelService } from "../../src/lib/realtime/room-channel-service";
import { createRoomService } from "../../src/lib/rooms/room-service";
import { createSubtitleService } from "../../src/lib/subtitles/subtitle-service";
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
  let subtitlePath: string | null = null;

  afterAll(async () => {
    await Promise.allSettled(coordinators.map((coordinator) => coordinator.stop()));
    if (!localUrl.startsWith("http://127.0.0.1:")) {
      return;
    }

    const admin = createTestClient(secretKey);
    if (subtitlePath) {
      await admin.storage.from("subtitles").remove([subtitlePath]);
    }
    if (roomId) {
      await admin.from("rooms").delete().eq("id", roomId);
    }
    for (const userId of userIds) {
      await admin.auth.admin.deleteUser(userId);
    }
    await Promise.all(clients.map((client) => client.removeAllChannels()));
  });

  it(
    "proves the owner and two-viewer backend synchronization workflow",
    async () => {
      expect(localUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(publishableKey).toBeTruthy();
      expect(secretKey).toBeTruthy();

      const owner = createTestClient();
      const viewerOne = createTestClient();
      const viewerTwo = createTestClient();
      const outsider = createTestClient();
      const admin = createTestClient(secretKey);
      clients.push(owner, viewerOne, viewerTwo, outsider, admin);

      const ownerAuth = await owner.auth.signUp({
        email: `sync-owner-${crypto.randomUUID()}@example.test`,
        password: "local-sync-password",
      });
      const viewerOneAuth = await viewerOne.auth.signInAnonymously();
      const viewerTwoAuth = await viewerTwo.auth.signInAnonymously();
      const outsiderAuth = await outsider.auth.signInAnonymously();
      expect(ownerAuth.error).toBeNull();
      expect(viewerOneAuth.error).toBeNull();
      expect(viewerTwoAuth.error).toBeNull();
      expect(outsiderAuth.error).toBeNull();

      const sessions = [
        ownerAuth.data.session,
        viewerOneAuth.data.session,
        viewerTwoAuth.data.session,
      ] as Session[];
      const outsiderSession = outsiderAuth.data.session as Session;
      userIds.push(
        ...sessions.map((session) => session.user.id),
        outsiderSession.user.id,
      );

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

      const media = await createMediaQueueService(owner).addMedia(roomId as string, {
        title: "Local Sync Media",
        sourceUrl: "https://media.example.test/local-sync.mp4",
        sourceType: "mp4",
      });

      const players = actors.map(() => new IntegrationPlayer());
      const monotonicTimes = [0, 0, 0];
      const createCoordinator = (client: (typeof actors)[number], index: number) => {
        const roomService = createRoomService(client);
        return createRoomSyncCoordinator({
          roomService,
          channelService: createRoomChannelService(client),
          chatService: createRoomChatService(client),
          clockCalibrator: createRoomClockCalibrator(roomService, {
            sampleCount: 1,
          }),
          player: players[index],
          monotonicNowMs: () => monotonicTimes[index],
        });
      };
      actors.forEach((client, index) => {
        const coordinator = createCoordinator(client, index);
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

      await vi.waitFor(
        () => {
          expect(
            coordinators.every(
              (coordinator) => coordinator.getState().watchers.length === 3,
            ),
          ).toBe(true);
        },
        { timeout: 10_000, interval: 50 },
      );

      const commands = createPlaybackCommandService(owner);
      const selected = await commands.selectMedia(
        roomId as string,
        0,
        media.id,
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

      await new Promise((resolve) => setTimeout(resolve, 150));
      const paused = await commands.pause(roomId as string, playing.state_version);
      const expectedPausePosition =
        playing.anchor_position_sec +
        (Date.parse(paused.anchor_server_time) -
          Date.parse(playing.anchor_server_time)) /
          1000;
      expect(
        Math.abs(paused.anchor_position_sec - expectedPausePosition),
      ).toBeLessThan(0.01);
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

      const sought = await commands.seek(roomId as string, paused.state_version, 42);
      await vi.waitFor(
        () => {
          expect(players.every((player) => player.paused)).toBe(true);
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

      const disconnectedViewer = coordinators[1];
      await disconnectedViewer.stop();
      const resumedPlaying = await commands.play(roomId as string, sought.state_version);
      const absentSeek = await commands.seek(
        roomId as string,
        resumedPlaying.state_version,
        64,
      );
      await vi.waitFor(
        () => {
          expect(
            [coordinators[0], coordinators[2]].every(
              (coordinator) =>
                coordinator.getState().canonicalPlayback?.state_version ===
                absentSeek.state_version,
            ),
          ).toBe(true);
        },
        { timeout: 10_000, interval: 50 },
      );

      const reconnectedViewer = createCoordinator(viewerOne, 1);
      coordinators[1] = reconnectedViewer;
      await reconnectedViewer.start({
        roomId: roomId as string,
        identity: {
          userId: sessions[1].user.id,
          roomSessionId: joins[1].data?.[0]?.session_id as string,
          displayName: displayNames[1],
        },
      });
      expect(reconnectedViewer.getState().canonicalPlayback?.state_version).toBe(
        absentSeek.state_version,
      );
      expect(players[1].paused).toBe(false);
      expect(players[1].currentTime).toBeGreaterThanOrEqual(63.5);

      await coordinators[2].handleVisibilityChange(false);
      monotonicTimes[2] = 20_000;
      const visibilitySeek = await commands.seek(
        roomId as string,
        absentSeek.state_version,
        80,
      );
      await vi.waitFor(
        () => {
          expect(
            coordinators[2].getState().canonicalPlayback?.state_version,
          ).toBe(visibilitySeek.state_version);
        },
        { timeout: 10_000, interval: 50 },
      );
      players[2].currentTime = 3;
      await coordinators[2].handleVisibilityChange(true);
      expect(coordinators[2].getState().reason).toBe("visibility_resume");
      expect(players[2].currentTime).toBeGreaterThanOrEqual(79.5);

      const versionBeforeGoLive = visibilitySeek.state_version;
      players[1].currentTime = 0;
      await reconnectedViewer.goLive();
      const afterGoLive = await createRoomService(viewerOne).fetchSnapshot(
        roomId as string,
      );
      expect(afterGoLive.playback.state_version).toBe(versionBeforeGoLive);
      expect(players[1].currentTime).toBeGreaterThanOrEqual(79.5);

      const chat = await reconnectedViewer.sendChatMessage(
        "Hello from Viewer B",
      );
      await vi.waitFor(
        () => {
          expect(
            [coordinators[0], coordinators[2]].every((coordinator) =>
              coordinator
                .getState()
                .chatMessages.some((message) => message.id === chat.id),
            ),
          ).toBe(true);
        },
        { timeout: 10_000, interval: 50 },
      );

      await reconnectedViewer.stop();
      const reloadedViewer = createCoordinator(viewerOne, 1);
      coordinators[1] = reloadedViewer;
      await reloadedViewer.start({
        roomId: roomId as string,
        identity: {
          userId: sessions[1].user.id,
          roomSessionId: joins[1].data?.[0]?.session_id as string,
          displayName: displayNames[1],
        },
      });
      expect(
        reloadedViewer
          .getState()
          .chatMessages.some((message) => message.id === chat.id),
      ).toBe(true);

      const ownerSubtitles = createSubtitleService(owner);
      const subtitle = await ownerSubtitles.uploadSubtitle({
        roomId: roomId as string,
        mediaId: media.id,
        label: "English",
        languageCode: "en",
        fileName: "controlled-fixture.vtt",
        text: "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nTonight TV\n",
      });
      subtitlePath = subtitle.storage_path;
      const viewerDownload = await createSubtitleService(viewerOne).downloadSubtitle(
        subtitle,
      );
      expect(await viewerDownload.text()).toContain("Tonight TV");
      await expect(
        createSubtitleService(outsider).downloadSubtitle(subtitle),
      ).rejects.toMatchObject({ code: "download_failed" });

      await ownerSubtitles.deleteSubtitle(subtitle);
      subtitlePath = null;
    },
    60_000,
  );
});
