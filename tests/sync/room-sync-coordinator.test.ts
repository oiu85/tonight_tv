import { describe, expect, it, vi } from "vitest";

import type {
  PlaybackStateChangedEvent,
  RoomChannelConnectOptions,
  RoomChannelHandlers,
  RoomChannelService,
} from "../../src/lib/realtime/room-channel-service";
import type { RoomSnapshot } from "../../src/lib/rooms/room-service";
import type { ClockCalibrator } from "../../src/lib/sync/clock-calibrator";
import { createRoomSyncCoordinator } from "../../src/lib/sync/room-sync-coordinator";
import type {
  PlayerSyncAdapter,
  SyncMedia,
} from "../../src/lib/sync/sync-core";

const roomId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const mediaId = "44444444-4444-4444-8444-444444444444";
const serverNowMs = Date.parse("2026-08-17T12:00:00.000Z");

function makeSnapshot(
  playback: Partial<RoomSnapshot["playback"]> = {},
): RoomSnapshot {
  const timestamp = new Date(serverNowMs).toISOString();
  return {
    server_time: timestamp,
    room: {
      id: roomId,
      name: "Room A",
      owner_user_id: userId,
      created_at: timestamp,
      updated_at: timestamp,
    },
    caller: {
      user_id: userId,
      is_owner: true,
      room_session_id: sessionId,
      display_name: "Owner A",
    },
    playback: {
      room_id: roomId,
      current_media_id: mediaId,
      status: "playing",
      anchor_position_sec: 10,
      anchor_server_time: timestamp,
      state_version: 1,
      updated_at: timestamp,
      ...playback,
    },
    current_media:
      playback.status === "idle" || playback.current_media_id === null
        ? null
        : {
            id: mediaId,
            title: "Movie",
            source_url: "https://media.example/movie.mp4",
            source_type: "mp4",
            queue_position: 0,
            created_at: timestamp,
            updated_at: timestamp,
          },
    subtitles: [],
    queue: [],
    recent_chat: [],
  };
}

class FakePlayer implements PlayerSyncAdapter {
  mediaId: string | null = null;
  currentTime = 0;
  duration: number | null = 120;
  playbackRate = 1;
  paused = true;
  ready = true;
  seekable = true;
  readonly loads: (SyncMedia | null)[] = [];
  readonly seeks: number[] = [];
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
    this.loads.push(media);
    this.mediaId = media?.id ?? null;
    this.currentTime = 0;
  }

  async waitUntilReady() {
    this.ready = true;
  }

  isReady() {
    return this.ready;
  }

  isSeekable() {
    return this.seekable;
  }

  isPaused() {
    return this.paused;
  }

  getCurrentTime() {
    return this.currentTime;
  }

  getDuration() {
    return this.duration;
  }

  async seek(positionSec: number) {
    this.seeks.push(positionSec);
    this.currentTime = positionSec;
  }

  getPlaybackRate() {
    return this.playbackRate;
  }

  setPlaybackRate(rate: number) {
    this.playbackRate = rate;
  }
}

function createChannelFake() {
  let handlers: RoomChannelHandlers | null = null;
  let version = 0;
  let status: ReturnType<RoomChannelService["getStatus"]> = "idle";
  const connect = vi.fn(async (options: RoomChannelConnectOptions) => {
    handlers = options.handlers;
    version = options.initialStateVersion;
    status = "subscribed";
    handlers.onStatusChanged?.("subscribed", null);
  });
  const disconnect = vi.fn(async () => {
    status = "closed";
  });
  const service: RoomChannelService = {
    connect,
    disconnect,
    getStatus: () => status,
    getWatchers: () => [],
    getLastAppliedVersion: () => version,
    replacePlaybackVersion: (nextVersion) => {
      version = nextVersion;
    },
  };

  return {
    service,
    connect,
    disconnect,
    getHandlers: () => handlers!,
  };
}

function createClockFake() {
  let calibrationCount = 0;
  let stale = false;
  let nowMs = serverNowMs;
  const calibrator: ClockCalibrator = {
    calibrate: vi.fn(async () => {
      calibrationCount += 1;
      stale = false;
      return {
        offsetMs: 0,
        roundTripTimeMs: 10,
        calibratedAtWallMs: nowMs,
        calibratedAtMonotonicMs: 0,
        estimatedServerAtCalibrationMs: nowMs,
        quality: "excellent" as const,
        samples: [],
      };
    }),
    estimatedServerNowMs: () => nowMs,
    getCalibration: () => null,
    getCalibrationAgeMs: () => 0,
    isCalibrationStale: () => stale,
  };

  return {
    calibrator,
    get calibrationCount() {
      return calibrationCount;
    },
    setStale(nextStale: boolean) {
      stale = nextStale;
    },
    advance(milliseconds: number) {
      nowMs += milliseconds;
    },
  };
}

function createHarness(initialSnapshot = makeSnapshot()) {
  let activeSnapshot = initialSnapshot;
  let monotonicMs = 0;
  const fetchSnapshot = vi.fn(async () => activeSnapshot);
  const player = new FakePlayer();
  const channel = createChannelFake();
  const clock = createClockFake();
  const coordinator = createRoomSyncCoordinator({
    roomService: { fetchSnapshot },
    channelService: channel.service,
    clockCalibrator: clock.calibrator,
    player,
    monotonicNowMs: () => monotonicMs,
    longHiddenThresholdMs: 1_000,
  });

  return {
    coordinator,
    fetchSnapshot,
    player,
    channel,
    clock,
    setSnapshot(nextSnapshot: RoomSnapshot) {
      activeSnapshot = nextSnapshot;
    },
    advanceMonotonic(milliseconds: number) {
      monotonicMs += milliseconds;
    },
  };
}

const startOptions = {
  roomId,
  identity: { userId, roomSessionId: sessionId, displayName: "Owner A" },
} as const;

describe("room synchronization lifecycle", () => {
  it("calibrates, closes the subscribe race, loads media, and aligns the initial snapshot", async () => {
    const harness = createHarness();

    await harness.coordinator.start(startOptions);

    expect(harness.clock.calibrationCount).toBe(1);
    expect(harness.fetchSnapshot).toHaveBeenCalledTimes(2);
    expect(harness.channel.connect).toHaveBeenCalledOnce();
    expect(harness.player.loads).toEqual([
      expect.objectContaining({ id: mediaId, sourceType: "mp4" }),
    ]);
    expect(harness.player.seeks[0]).toBe(10);
    expect(harness.player.play).toHaveBeenCalledOnce();
    expect(harness.coordinator.getState()).toMatchObject({
      status: "live",
      canonicalPlayback: { state_version: 1 },
    });
  });

  it("ignores stale events, applies sequential events, and reconciles a gap", async () => {
    const harness = createHarness();
    await harness.coordinator.start(startOptions);
    const handlers = harness.channel.getHandlers();
    const baseEvent: PlaybackStateChangedEvent = {
      ...makeSnapshot().playback,
      status: "paused",
    };

    await handlers.onPlaybackState(baseEvent);
    expect(harness.coordinator.getState().canonicalPlayback?.state_version).toBe(1);

    await handlers.onPlaybackState({ ...baseEvent, state_version: 2 });
    expect(harness.coordinator.getState()).toMatchObject({
      status: "paused",
      canonicalPlayback: { state_version: 2 },
    });

    harness.setSnapshot(
      makeSnapshot({ status: "paused", state_version: 4 }),
    );
    await handlers.onPlaybackState({ ...baseEvent, state_version: 4 });

    expect(harness.coordinator.getState().canonicalPlayback?.state_version).toBe(4);
    expect(harness.fetchSnapshot).toHaveBeenCalledTimes(3);
  });

  it("reconciles once after reconnect and recalibrates the clock", async () => {
    const harness = createHarness();
    await harness.coordinator.start(startOptions);
    const baselineFetches = harness.fetchSnapshot.mock.calls.length;
    const baselineCalibrations = harness.clock.calibrationCount;

    await harness.channel.getHandlers().onReconcile("reconnected");

    expect(harness.fetchSnapshot).toHaveBeenCalledTimes(baselineFetches + 1);
    expect(harness.clock.calibrationCount).toBe(baselineCalibrations + 1);
    expect(harness.coordinator.getState().reason).toBe("realtime_reconnected");
  });

  it("resyncs after a long background interval without trusting browser timers", async () => {
    const harness = createHarness();
    await harness.coordinator.start(startOptions);
    const baselineFetches = harness.fetchSnapshot.mock.calls.length;

    await harness.coordinator.handleVisibilityChange(false);
    harness.advanceMonotonic(1_500);
    await harness.coordinator.handleVisibilityChange(true);

    expect(harness.fetchSnapshot).toHaveBeenCalledTimes(baselineFetches + 1);
    expect(harness.coordinator.getState().reason).toBe("visibility_resume");
  });

  it("catches up locally after buffering without any snapshot/network request", async () => {
    const harness = createHarness();
    await harness.coordinator.start(startOptions);
    const baselineFetches = harness.fetchSnapshot.mock.calls.length;
    harness.player.currentTime = 1;

    await harness.coordinator.handleBufferingChange(true);
    harness.clock.advance(5_000);
    await harness.coordinator.handleBufferingChange(false);

    expect(harness.fetchSnapshot).toHaveBeenCalledTimes(baselineFetches);
    expect(harness.player.currentTime).toBe(15);
    expect(harness.coordinator.getState().status).toBe("live");
  });

  it("reloads the same current media ID when its source metadata changes", async () => {
    const harness = createHarness();
    await harness.coordinator.start(startOptions);
    const changedSnapshot = makeSnapshot();
    harness.setSnapshot({
      ...changedSnapshot,
      current_media: {
        ...changedSnapshot.current_media!,
        source_url: "https://media.example/movie-v2.m3u8",
        source_type: "hls",
        updated_at: new Date(serverNowMs + 1_000).toISOString(),
      },
    });

    await harness.channel.getHandlers().onQueueChanged?.({
      room_id: roomId,
    });

    expect(harness.player.loads).toHaveLength(2);
    expect(harness.player.loads[1]).toMatchObject({
      id: mediaId,
      sourceUrl: "https://media.example/movie-v2.m3u8",
      sourceType: "hls",
    });
  });

  it("GO LIVE fetches truth, refreshes a stale clock, and only operates locally", async () => {
    const harness = createHarness();
    await harness.coordinator.start(startOptions);
    const baselineFetches = harness.fetchSnapshot.mock.calls.length;
    const baselineCalibrations = harness.clock.calibrationCount;
    harness.clock.setStale(true);
    harness.player.currentTime = 0;

    await harness.coordinator.goLive();

    expect(harness.fetchSnapshot).toHaveBeenCalledTimes(baselineFetches + 1);
    expect(harness.clock.calibrationCount).toBe(baselineCalibrations + 1);
    expect(harness.player.currentTime).toBe(10);
    expect(harness.coordinator.getState().reason).toBe("go_live");
  });

  it("coalesces simultaneous GO LIVE requests into one snapshot refresh", async () => {
    const harness = createHarness();
    await harness.coordinator.start(startOptions);
    const baselineFetches = harness.fetchSnapshot.mock.calls.length;

    await Promise.all([
      harness.coordinator.goLive(),
      harness.coordinator.goLive(),
      harness.coordinator.goLive(),
    ]);

    expect(harness.fetchSnapshot).toHaveBeenCalledTimes(baselineFetches + 1);
  });

  it("cleans up the channel and restores exactly normal playback rate", async () => {
    const harness = createHarness();
    await harness.coordinator.start(startOptions);
    harness.player.playbackRate = 1.03;

    await harness.coordinator.stop();

    expect(harness.channel.disconnect).toHaveBeenCalledOnce();
    expect(harness.player.playbackRate).toBe(1);
    expect(harness.coordinator.getState().status).toBe("stopped");
  });
});
