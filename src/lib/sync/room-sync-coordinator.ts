"use client";

import {
  getBrowserRoomChatService,
  type ChatMessage,
  type RoomChatService,
} from "../chat/room-chat-service";
import {
  getBrowserRoomChannelService,
  type PlaybackStateChangedEvent,
  type ReconcileReason,
  type RoomChannelError,
  type RoomChannelService,
  type RoomChannelStatus,
  type RoomPresenceIdentity,
  type RoomWatcher,
} from "../realtime/room-channel-service";
import {
  getBrowserRoomService,
  type RoomService,
  type RoomSnapshot,
} from "../rooms/room-service";
import {
  createRoomClockCalibrator,
  type ClockCalibrator,
} from "./clock-calibrator";
import {
  calculateDrift,
  comparePlaybackVersions,
  DEFAULT_DRIFT_POLICY,
  expectedCanonicalPosition,
  selectCorrectionDecision,
  type CanonicalPlaybackState,
  type PlayerSyncAdapter,
  type SyncMedia,
} from "./sync-core";

const FORCE_ALIGNMENT_TOLERANCE_SEC = 0.05;
const DEFAULT_LONG_HIDDEN_THRESHOLD_MS = 15_000;

export type RoomSyncStatus =
  | "idle"
  | "starting"
  | "synchronizing"
  | "live"
  | "paused"
  | "ended"
  | "room_idle"
  | "buffering"
  | "playback_blocked"
  | "error"
  | "stopped";

export type RoomSyncErrorCode =
  | "invalid_start_state"
  | "snapshot_identity_mismatch"
  | "missing_media_metadata"
  | "player_operation_failed"
  | "reconciliation_failed";

export class RoomSyncError extends Error {
  readonly code: RoomSyncErrorCode;

  constructor(code: RoomSyncErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RoomSyncError";
    this.code = code;
  }
}

export type RoomSyncReason =
  | "initial"
  | "realtime_reconnected"
  | "realtime_version_gap"
  | "realtime_malformed_event"
  | "realtime_handler_failed"
  | "room_metadata_changed"
  | "visibility_resume"
  | "go_live";

export type RoomSyncState = Readonly<{
  status: RoomSyncStatus;
  reason: RoomSyncReason | null;
  canonicalPlayback: CanonicalPlaybackState | null;
  snapshot: RoomSnapshot | null;
  channelStatus: RoomChannelStatus;
  watchers: readonly RoomWatcher[];
  chatMessages: readonly ChatMessage[];
  error: RoomSyncError | RoomChannelError | null;
}>;

export type RoomSyncHandlers = Readonly<{
  onStateChanged?: (state: RoomSyncState) => void;
}>;

export type RoomSyncStartOptions = Readonly<{
  roomId: string;
  identity: RoomPresenceIdentity;
  handlers?: RoomSyncHandlers;
}>;

export type RoomSyncCoordinator = Readonly<{
  start: (options: RoomSyncStartOptions) => Promise<void>;
  stop: () => Promise<void>;
  tick: () => Promise<void>;
  goLive: () => Promise<void>;
  sendChatMessage: (body: string) => Promise<ChatMessage>;
  handleVisibilityChange: (visible: boolean) => Promise<void>;
  handleBufferingChange: (buffering: boolean) => Promise<void>;
  getState: () => RoomSyncState;
}>;

export type RoomSyncDependencies = Readonly<{
  roomService: Pick<RoomService, "fetchSnapshot">;
  channelService: RoomChannelService;
  chatService: RoomChatService;
  clockCalibrator: ClockCalibrator;
  player: PlayerSyncAdapter;
  monotonicNowMs?: () => number;
  longHiddenThresholdMs?: number;
}>;

function snapshotPlayback(snapshot: RoomSnapshot): CanonicalPlaybackState {
  return snapshot.playback;
}

function snapshotMedia(snapshot: RoomSnapshot): SyncMedia | null {
  const media = snapshot.current_media;
  return media
    ? {
        id: media.id,
        title: media.title,
        sourceUrl: media.source_url,
        sourceType: media.source_type,
      }
    : null;
}

function mapRealtimeReason(reason: ReconcileReason): RoomSyncReason {
  switch (reason) {
    case "reconnected":
      return "realtime_reconnected";
    case "version_gap":
      return "realtime_version_gap";
    case "malformed_event":
      return "realtime_malformed_event";
    default:
      return "realtime_handler_failed";
  }
}

function asSyncError(
  error: unknown,
  code: RoomSyncErrorCode,
  message: string,
): RoomSyncError {
  return error instanceof RoomSyncError
    ? error
    : new RoomSyncError(code, message, { cause: error });
}

export function createRoomSyncCoordinator(
  dependencies: RoomSyncDependencies,
): RoomSyncCoordinator {
  const {
    roomService,
    channelService,
    chatService,
    clockCalibrator,
    player,
  } = dependencies;
  const monotonicNowMs =
    dependencies.monotonicNowMs ??
    (() => (typeof performance === "undefined" ? Date.now() : performance.now()));
  const longHiddenThresholdMs =
    dependencies.longHiddenThresholdMs ?? DEFAULT_LONG_HIDDEN_THRESHOLD_MS;

  let roomId: string | null = null;
  let identity: RoomPresenceIdentity | null = null;
  let handlers: RoomSyncHandlers | undefined;
  let snapshot: RoomSnapshot | null = null;
  let canonicalPlayback: CanonicalPlaybackState | null = null;
  let loadedMedia: SyncMedia | null = null;
  let status: RoomSyncStatus = "idle";
  let reason: RoomSyncReason | null = null;
  let error: RoomSyncError | RoomChannelError | null = null;
  let channelStatus: RoomChannelStatus = "idle";
  let watchers: readonly RoomWatcher[] = Object.freeze([]);
  let chatMessages: readonly ChatMessage[] = Object.freeze([]);
  let buffering = false;
  let hiddenAtMonotonicMs: number | null = null;
  let rateCorrectionActive = false;
  let startPromise: Promise<void> | null = null;
  let reconciliationPromise: Promise<void> | null = null;
  let reconciliationRequested = false;
  let recalibrationRequested = false;
  let forceAlignmentRequested = false;
  let activeRecalibration = false;
  let activeForceAlignment = false;
  let generation = 0;

  function currentState(): RoomSyncState {
    return Object.freeze({
      status,
      reason,
      canonicalPlayback,
      snapshot,
      channelStatus,
      watchers,
      chatMessages,
      error,
    });
  }

  function publishState(): void {
    handlers?.onStateChanged?.(currentState());
  }

  function setStatus(
    nextStatus: RoomSyncStatus,
    nextReason: RoomSyncReason | null = reason,
    nextError: RoomSyncError | RoomChannelError | null = null,
  ): void {
    status = nextStatus;
    reason = nextReason;
    error = nextError;
    publishState();
  }

  function resetPlaybackRate(): void {
    if (
      Math.abs(player.getPlaybackRate() - DEFAULT_DRIFT_POLICY.normalPlaybackRate) >
      0.000_001
    ) {
      player.setPlaybackRate(DEFAULT_DRIFT_POLICY.normalPlaybackRate);
    }
    rateCorrectionActive = false;
  }

  function validateSnapshotAccess(nextSnapshot: RoomSnapshot): void {
    if (
      !roomId ||
      !identity ||
      nextSnapshot.room.id !== roomId ||
      nextSnapshot.caller.user_id !== identity.userId ||
      nextSnapshot.caller.room_session_id !== identity.roomSessionId
    ) {
      throw new RoomSyncError(
        "snapshot_identity_mismatch",
        "The room snapshot did not match the joined room identity.",
      );
    }
  }

  async function matchPlaybackIntent(state: CanonicalPlaybackState): Promise<void> {
    if (state.status === "playing") {
      if (player.isPaused()) {
        try {
          await player.play();
        } catch (cause) {
          setStatus(
            "playback_blocked",
            reason,
            new RoomSyncError(
              "player_operation_failed",
              "The browser blocked canonical playback. User interaction is required.",
              { cause },
            ),
          );
        }
      }
      return;
    }

    if (!player.isPaused()) {
      await player.pause();
    }
  }

  async function alignPlayer(forceAlignment: boolean): Promise<void> {
    const state = canonicalPlayback;
    if (!state) {
      return;
    }

    if (state.status === "idle") {
      resetPlaybackRate();
      await matchPlaybackIntent(state);
      setStatus("room_idle");
      return;
    }

    if (!player.isReady()) {
      resetPlaybackRate();
      setStatus("buffering");
      return;
    }

    const expectedPosition = expectedCanonicalPosition(
      state,
      clockCalibrator.estimatedServerNowMs(),
      player.getDuration(),
    );
    if (expectedPosition === null) {
      return;
    }

    const driftSec = calculateDrift(player.getCurrentTime(), expectedPosition);
    if (
      forceAlignment &&
      Math.abs(driftSec) >= FORCE_ALIGNMENT_TOLERANCE_SEC &&
      player.isSeekable(expectedPosition)
    ) {
      resetPlaybackRate();
      await player.seek(expectedPosition);
    } else {
      const decision = selectCorrectionDecision({
        state,
        driftSec,
        expectedPositionSec: expectedPosition,
        playerReady: player.isReady(),
        seekable: player.isSeekable(expectedPosition),
        buffering,
        currentPlaybackRate: player.getPlaybackRate(),
        rateCorrectionActive,
      });

      switch (decision.kind) {
        case "wait":
          if (decision.resetRate) {
            resetPlaybackRate();
          }
          break;
        case "reset_rate":
          resetPlaybackRate();
          break;
        case "set_rate":
          if (Math.abs(player.getPlaybackRate() - decision.rate) > 0.000_001) {
            player.setPlaybackRate(decision.rate);
          }
          rateCorrectionActive = true;
          break;
        case "seek":
          if (decision.resetRate) {
            resetPlaybackRate();
          }
          await player.seek(decision.positionSec);
          break;
        case "none":
          break;
      }
    }

    await matchPlaybackIntent(state);
    if (status === "playback_blocked") {
      return;
    }

    setStatus(
      buffering
        ? "buffering"
        : state.status === "playing"
          ? "live"
          : state.status === "paused"
            ? "paused"
            : "ended",
    );
  }

  async function applyCanonicalState(
    nextState: CanonicalPlaybackState,
    media: SyncMedia | null,
    forceAlignment: boolean,
  ): Promise<void> {
    const previousState = canonicalPlayback;
    const mediaChanged =
      previousState?.current_media_id !== nextState.current_media_id;
    const statusChanged = previousState?.status !== nextState.status;
    if (mediaChanged || statusChanged) {
      resetPlaybackRate();
    }

    canonicalPlayback = nextState;
    publishState();

    if (nextState.status === "idle") {
      if (player.getMediaId() !== null) {
        await player.loadMedia(null);
      }
      loadedMedia = null;
      await alignPlayer(forceAlignment);
      return;
    }

    if (!media || media.id !== nextState.current_media_id) {
      throw new RoomSyncError(
        "missing_media_metadata",
        "The canonical playback state referenced media missing from the room snapshot.",
      );
    }

    const sourceChanged =
      player.getMediaId() !== media.id ||
      !loadedMedia ||
      loadedMedia.id !== media.id ||
      loadedMedia.sourceUrl !== media.sourceUrl ||
      loadedMedia.sourceType !== media.sourceType;
    if (sourceChanged) {
      resetPlaybackRate();
      await player.loadMedia(media);
      loadedMedia = media;
      await player.waitUntilReady();
      forceAlignment = true;
    } else if (forceAlignment && !player.isReady()) {
      await player.waitUntilReady();
    }

    await alignPlayer(forceAlignment);
  }

  async function applySnapshot(
    nextSnapshot: RoomSnapshot,
    forceAlignment: boolean,
  ): Promise<void> {
    validateSnapshotAccess(nextSnapshot);
    chatMessages = chatService.hydrate(
      nextSnapshot.room.id,
      nextSnapshot.recent_chat,
    );
    publishState();
    const nextPlayback = snapshotPlayback(nextSnapshot);

    if (
      canonicalPlayback &&
      nextPlayback.state_version < canonicalPlayback.state_version
    ) {
      return;
    }

    snapshot = nextSnapshot;
    await applyCanonicalState(
      nextPlayback,
      snapshotMedia(nextSnapshot),
      forceAlignment,
    );
    channelService.replacePlaybackVersion(
      Math.max(channelService.getLastAppliedVersion(), nextPlayback.state_version),
    );
  }

  function requestReconciliation(
    nextReason: RoomSyncReason,
    options: Readonly<{
      recalibrate?: boolean;
      forceAlignment?: boolean;
    }> = {},
  ): Promise<void> {
    if (!roomId || !identity) {
      return Promise.reject(
        new RoomSyncError(
          "invalid_start_state",
          "Room synchronization must be started after Auth and durable room join.",
        ),
      );
    }

    reason = nextReason;
    const needsRecalibration = options.recalibrate ?? false;
    const needsForceAlignment = options.forceAlignment ?? false;
    if (reconciliationPromise) {
      const requiresStrongerFollowUp =
        (needsRecalibration && !activeRecalibration) ||
        (needsForceAlignment && !activeForceAlignment);
      if (requiresStrongerFollowUp) {
        reconciliationRequested = true;
        recalibrationRequested ||= needsRecalibration;
        forceAlignmentRequested ||= needsForceAlignment;
      }
      return reconciliationPromise;
    }

    reconciliationRequested = true;
    recalibrationRequested = needsRecalibration;
    forceAlignmentRequested = needsForceAlignment;

    reconciliationPromise ??= (async () => {
      try {
        while (reconciliationRequested) {
          const reconciliationGeneration = generation;
          reconciliationRequested = false;
          const shouldRecalibrate =
            recalibrationRequested || clockCalibrator.isCalibrationStale();
          const shouldForceAlignment = forceAlignmentRequested;
          activeRecalibration = shouldRecalibrate;
          activeForceAlignment = shouldForceAlignment;
          recalibrationRequested = false;
          forceAlignmentRequested = false;
          setStatus("synchronizing", reason);

          if (shouldRecalibrate) {
            await clockCalibrator.calibrate();
          }

          if (reconciliationGeneration !== generation) {
            return;
          }

          const nextSnapshot = await roomService.fetchSnapshot(roomId);
          if (reconciliationGeneration !== generation) {
            return;
          }
          await applySnapshot(nextSnapshot, shouldForceAlignment);
          activeRecalibration = false;
          activeForceAlignment = false;
        }
      } catch (cause) {
        const syncError = asSyncError(
          cause,
          "reconciliation_failed",
          "Unable to reconcile the canonical room state.",
        );
        setStatus("error", reason, syncError);
        throw syncError;
      } finally {
        activeRecalibration = false;
        activeForceAlignment = false;
        reconciliationPromise = null;
      }
    })();

    return reconciliationPromise;
  }

  async function applyRealtimePlayback(
    event: PlaybackStateChangedEvent,
  ): Promise<void> {
    if (!canonicalPlayback) {
      await requestReconciliation("realtime_handler_failed");
      return;
    }

    const versionDecision = comparePlaybackVersions(
      event.state_version,
      canonicalPlayback.state_version,
    );
    if (versionDecision === "stale_or_duplicate") {
      return;
    }

    if (versionDecision === "gap") {
      await requestReconciliation("realtime_version_gap");
      return;
    }

    if (event.current_media_id !== canonicalPlayback.current_media_id) {
      await requestReconciliation("room_metadata_changed", {
        forceAlignment: true,
      });
      return;
    }

    if (snapshot) {
      snapshot = Object.freeze({ ...snapshot, playback: event });
    }
    await applyCanonicalState(event, snapshotMedia(snapshot!), false);
  }

  async function applyRealtimeChat(message: ChatMessage): Promise<void> {
    chatMessages = chatService.mergeLiveMessage(message);
    publishState();
  }

  async function start(options: RoomSyncStartOptions): Promise<void> {
    const sameActiveRoom =
      roomId === options.roomId &&
      identity?.roomSessionId === options.identity.roomSessionId;
    if (sameActiveRoom && startPromise) {
      return startPromise;
    }
    if (
      sameActiveRoom &&
      status !== "stopped" &&
      status !== "idle" &&
      status !== "error"
    ) {
      return;
    }

    if (roomId) {
      await stop();
    }

    generation += 1;
    const startGeneration = generation;
    roomId = options.roomId;
    identity = options.identity;
    handlers = options.handlers;
    buffering = false;
    hiddenAtMonotonicMs = null;
    setStatus("starting", "initial");

    startPromise = (async () => {
      try {
        await clockCalibrator.calibrate();
        const initialSnapshot = await roomService.fetchSnapshot(options.roomId);
        await applySnapshot(initialSnapshot, true);

        await channelService.connect({
          roomId: options.roomId,
          identity: options.identity,
          initialStateVersion: initialSnapshot.playback.state_version,
          handlers: {
            onPlaybackState: applyRealtimePlayback,
            onReconcile: (realtimeReason) =>
              requestReconciliation(mapRealtimeReason(realtimeReason), {
                recalibrate: realtimeReason === "reconnected",
                forceAlignment: realtimeReason === "reconnected",
              }),
            onQueueChanged: () =>
              requestReconciliation("room_metadata_changed"),
            onSubtitleMetadataChanged: () =>
              requestReconciliation("room_metadata_changed"),
            onChatMessageCreated: applyRealtimeChat,
            onWatchersChanged: (nextWatchers) => {
              watchers = nextWatchers;
              publishState();
            },
            onStatusChanged: (nextStatus, channelError) => {
              channelStatus = nextStatus;
              if (channelError) {
                error = channelError;
              }
              publishState();
            },
          },
        });

        if (startGeneration !== generation) {
          return;
        }

        // A second snapshot closes the small fetch-to-subscribe race without
        // depending on Realtime replay as a source of truth.
        await requestReconciliation("initial", { forceAlignment: true });
      } catch (cause) {
        const syncError = asSyncError(
          cause,
          "invalid_start_state",
          "Unable to start room synchronization.",
        );
        setStatus("error", "initial", syncError);
        throw syncError;
      } finally {
        startPromise = null;
      }
    })();

    return startPromise;
  }

  async function stop(): Promise<void> {
    generation += 1;
    reconciliationRequested = false;
    recalibrationRequested = false;
    forceAlignmentRequested = false;
    activeRecalibration = false;
    activeForceAlignment = false;
    resetPlaybackRate();
    await channelService.disconnect();
    roomId = null;
    identity = null;
    snapshot = null;
    canonicalPlayback = null;
    loadedMedia = null;
    watchers = Object.freeze([]);
    chatService.clear();
    chatMessages = Object.freeze([]);
    buffering = false;
    hiddenAtMonotonicMs = null;
    channelStatus = "closed";
    setStatus("stopped", null);
  }

  async function tick(): Promise<void> {
    if (!canonicalPlayback || status === "stopped" || status === "error") {
      return;
    }

    try {
      await alignPlayer(false);
    } catch (cause) {
      const syncError = asSyncError(
        cause,
        "player_operation_failed",
        "Unable to correct local playback drift.",
      );
      setStatus("error", reason, syncError);
      throw syncError;
    }
  }

  async function goLive(): Promise<void> {
    await requestReconciliation("go_live", { forceAlignment: true });
  }

  async function sendChatMessage(body: string): Promise<ChatMessage> {
    if (!roomId || !identity) {
      throw new RoomSyncError(
        "invalid_start_state",
        "Room synchronization must be started after Auth and durable room join.",
      );
    }

    const message = await chatService.sendMessage(roomId, body);
    chatMessages = chatService.getMessages();
    publishState();
    return message;
  }

  async function handleVisibilityChange(visible: boolean): Promise<void> {
    if (!visible) {
      hiddenAtMonotonicMs = monotonicNowMs();
      resetPlaybackRate();
      return;
    }

    if (hiddenAtMonotonicMs === null) {
      return;
    }

    const hiddenDurationMs = Math.max(
      0,
      monotonicNowMs() - hiddenAtMonotonicMs,
    );
    hiddenAtMonotonicMs = null;
    if (hiddenDurationMs >= longHiddenThresholdMs) {
      await requestReconciliation("visibility_resume", {
        recalibrate: true,
        forceAlignment: true,
      });
      return;
    }

    await tick();
  }

  async function handleBufferingChange(nextBuffering: boolean): Promise<void> {
    buffering = nextBuffering;
    if (nextBuffering) {
      resetPlaybackRate();
      setStatus("buffering");
      return;
    }

    // Buffer recovery is a purely local recomputation. It never pauses or
    // mutates the authoritative room state.
    await tick();
  }

  return Object.freeze({
    start,
    stop,
    tick,
    goLive,
    sendChatMessage,
    handleVisibilityChange,
    handleBufferingChange,
    getState: currentState,
  });
}

export function createBrowserRoomSyncCoordinator(
  player: PlayerSyncAdapter,
): RoomSyncCoordinator {
  const roomService = getBrowserRoomService();
  return createRoomSyncCoordinator({
    roomService,
    channelService: getBrowserRoomChannelService(),
    chatService: getBrowserRoomChatService(),
    clockCalibrator: createRoomClockCalibrator(roomService),
    player,
  });
}
