"use client";

import type {
  RealtimeChannel,
  RealtimePresenceState,
  SupabaseClient,
} from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "../supabase/browser";
import type { Database } from "../supabase/database.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAYBACK_STATUSES = new Set(["idle", "paused", "playing", "ended"]);
const CHANGE_OPERATIONS = new Set(["insert", "update", "delete"]);

export type RoomChannelStatus =
  | "idle"
  | "connecting"
  | "subscribed"
  | "reconnecting"
  | "error"
  | "closed";

export type RoomChannelErrorCode =
  | "invalid_input"
  | "subscribe_failed"
  | "presence_track_failed"
  | "reconciliation_failed"
  | "connect_cancelled"
  | "cleanup_failed";

export class RoomChannelError extends Error {
  readonly code: RoomChannelErrorCode;

  constructor(code: RoomChannelErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RoomChannelError";
    this.code = code;
  }
}

export type RoomPresenceIdentity = Readonly<{
  userId: string;
  roomSessionId: string;
  displayName: string;
}>;

export type RoomPresencePayload = Readonly<{
  user_id: string;
  room_session_id: string;
  display_name: string;
  online_at: string;
}>;

export type RoomWatcher = RoomPresencePayload;

export type PlaybackStateChangedEvent = Readonly<{
  room_id: string;
  current_media_id: string | null;
  status: Database["public"]["Enums"]["playback_status"];
  anchor_position_sec: number;
  anchor_server_time: string;
  state_version: number;
  updated_at: string;
}>;

export type QueueChangedEvent = Readonly<{
  room_id: string;
  media_id?: string;
  operation?: "insert" | "update" | "delete";
}>;

export type SubtitleMetadataChangedEvent = Readonly<{
  room_id: string;
  subtitle_id?: string;
  media_id?: string;
  operation?: "insert" | "update" | "delete";
}>;

export type ReconcileReason =
  | "reconnected"
  | "version_gap"
  | "malformed_event"
  | "playback_handler_failed"
  | "queue_handler_failed"
  | "subtitle_handler_failed";

export type PlaybackEventDecision =
  | Readonly<{ kind: "ignore"; reason: "stale_or_duplicate" }>
  | Readonly<{ kind: "apply"; event: PlaybackStateChangedEvent }>
  | Readonly<{ kind: "reconcile"; reason: "version_gap" | "malformed_event" }>;

export type RoomChannelHandlers = Readonly<{
  onPlaybackState: (
    event: PlaybackStateChangedEvent,
  ) => void | Promise<void>;
  onReconcile: (reason: ReconcileReason) => void | Promise<void>;
  onQueueChanged?: (event: QueueChangedEvent) => void | Promise<void>;
  onSubtitleMetadataChanged?: (
    event: SubtitleMetadataChangedEvent,
  ) => void | Promise<void>;
  onWatchersChanged?: (watchers: readonly RoomWatcher[]) => void;
  onStatusChanged?: (
    status: RoomChannelStatus,
    error: RoomChannelError | null,
  ) => void;
}>;

export type RoomChannelConnectOptions = Readonly<{
  roomId: string;
  identity: RoomPresenceIdentity;
  initialStateVersion: number;
  handlers: RoomChannelHandlers;
}>;

export type RoomChannelService = Readonly<{
  connect: (options: RoomChannelConnectOptions) => Promise<void>;
  disconnect: () => Promise<void>;
  getStatus: () => RoomChannelStatus;
  getWatchers: () => readonly RoomWatcher[];
  getLastAppliedVersion: () => number;
  replacePlaybackVersion: (stateVersion: number) => void;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isNonnegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function invalidInput(message: string): RoomChannelError {
  return new RoomChannelError("invalid_input", message);
}

function validateStateVersion(stateVersion: number): void {
  if (!isNonnegativeSafeInteger(stateVersion)) {
    throw invalidInput("Playback state version must be a nonnegative safe integer.");
  }
}

function validateConnectOptions(options: RoomChannelConnectOptions): void {
  if (!isUuid(options.roomId)) {
    throw invalidInput("Room ID must be a valid UUID.");
  }

  if (!isUuid(options.identity.userId) || !isUuid(options.identity.roomSessionId)) {
    throw invalidInput("Presence identity must contain valid Auth and room-session UUIDs.");
  }

  const displayName = options.identity.displayName;
  if (
    displayName !== displayName.trim() ||
    displayName.length < 1 ||
    displayName.length > 40
  ) {
    throw invalidInput("Presence display name must be normalized and 1 to 40 characters.");
  }

  validateStateVersion(options.initialStateVersion);
}

function parsePlaybackEvent(
  payload: unknown,
  expectedRoomId: string,
): PlaybackStateChangedEvent | null {
  if (!isRecord(payload)) {
    return null;
  }

  const currentMediaId = payload.current_media_id;
  const status = payload.status;
  const mediaInvariantIsValid =
    (status === "idle" && currentMediaId === null) ||
    (status !== "idle" && isUuid(currentMediaId));

  if (
    payload.room_id !== expectedRoomId ||
    !isUuid(payload.room_id) ||
    !PLAYBACK_STATUSES.has(status as string) ||
    !mediaInvariantIsValid ||
    !isNonnegativeFiniteNumber(payload.anchor_position_sec) ||
    !isTimestamp(payload.anchor_server_time) ||
    !isNonnegativeSafeInteger(payload.state_version) ||
    !isTimestamp(payload.updated_at)
  ) {
    return null;
  }

  return {
    room_id: payload.room_id,
    current_media_id: currentMediaId as string | null,
    status: status as PlaybackStateChangedEvent["status"],
    anchor_position_sec: payload.anchor_position_sec,
    anchor_server_time: payload.anchor_server_time,
    state_version: payload.state_version,
    updated_at: payload.updated_at,
  };
}

export function classifyPlaybackEvent(
  payload: unknown,
  expectedRoomId: string,
  lastAppliedVersion: number,
): PlaybackEventDecision {
  const event = parsePlaybackEvent(payload, expectedRoomId);
  if (!event || !isNonnegativeSafeInteger(lastAppliedVersion)) {
    return { kind: "reconcile", reason: "malformed_event" };
  }

  if (event.state_version <= lastAppliedVersion) {
    return { kind: "ignore", reason: "stale_or_duplicate" };
  }

  if (event.state_version === lastAppliedVersion + 1) {
    return { kind: "apply", event };
  }

  return { kind: "reconcile", reason: "version_gap" };
}

function parseQueueEvent(
  payload: unknown,
  expectedRoomId: string,
): QueueChangedEvent | null {
  if (!isRecord(payload) || payload.room_id !== expectedRoomId) {
    return null;
  }

  if (payload.media_id !== undefined && !isUuid(payload.media_id)) {
    return null;
  }

  if (
    payload.operation !== undefined &&
    !CHANGE_OPERATIONS.has(payload.operation as string)
  ) {
    return null;
  }

  return {
    room_id: expectedRoomId,
    ...(payload.media_id === undefined ? {} : { media_id: payload.media_id }),
    ...(payload.operation === undefined
      ? {}
      : { operation: payload.operation as QueueChangedEvent["operation"] }),
  };
}

function parseSubtitleEvent(
  payload: unknown,
  expectedRoomId: string,
): SubtitleMetadataChangedEvent | null {
  if (!isRecord(payload) || payload.room_id !== expectedRoomId) {
    return null;
  }

  if (
    (payload.subtitle_id !== undefined && !isUuid(payload.subtitle_id)) ||
    (payload.media_id !== undefined && !isUuid(payload.media_id)) ||
    (payload.operation !== undefined &&
      !CHANGE_OPERATIONS.has(payload.operation as string))
  ) {
    return null;
  }

  return {
    room_id: expectedRoomId,
    ...(payload.subtitle_id === undefined
      ? {}
      : { subtitle_id: payload.subtitle_id }),
    ...(payload.media_id === undefined ? {} : { media_id: payload.media_id }),
    ...(payload.operation === undefined
      ? {}
      : {
          operation:
            payload.operation as SubtitleMetadataChangedEvent["operation"],
        }),
  };
}

function parsePresence(value: unknown): RoomWatcher | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isUuid(value.user_id) ||
    !isUuid(value.room_session_id) ||
    typeof value.display_name !== "string" ||
    value.display_name !== value.display_name.trim() ||
    value.display_name.length < 1 ||
    value.display_name.length > 40 ||
    !isTimestamp(value.online_at)
  ) {
    return null;
  }

  return {
    user_id: value.user_id,
    room_session_id: value.room_session_id,
    display_name: value.display_name,
    online_at: value.online_at,
  };
}

export function normalizeWatchers(
  state: RealtimePresenceState<RoomPresencePayload> | Record<string, unknown>,
): readonly RoomWatcher[] {
  const byUserId = new Map<string, RoomWatcher>();

  for (const presences of Object.values(state)) {
    if (!Array.isArray(presences)) {
      continue;
    }

    for (const presence of presences) {
      const watcher = parsePresence(presence);
      if (!watcher) {
        continue;
      }

      const existing = byUserId.get(watcher.user_id);
      if (!existing || Date.parse(watcher.online_at) >= Date.parse(existing.online_at)) {
        byUserId.set(watcher.user_id, watcher);
      }
    }
  }

  return Object.freeze(
    [...byUserId.values()].sort((left, right) =>
      left.user_id.localeCompare(right.user_id),
    ),
  );
}

export function createRoomChannelService(
  client: SupabaseClient<Database>,
): RoomChannelService {
  let channel: RealtimeChannel | null = null;
  let activeKey: string | null = null;
  let activeRoomId: string | null = null;
  let identity: RoomPresenceIdentity | null = null;
  let handlers: RoomChannelHandlers | null = null;
  let status: RoomChannelStatus = "idle";
  let watchers: readonly RoomWatcher[] = Object.freeze([]);
  let lastAppliedVersion = 0;
  let pendingConnect: Promise<void> | null = null;
  let cancelPendingConnect: (() => void) | null = null;
  let pendingReconciliation: Promise<void> | null = null;
  let playbackQueue = Promise.resolve();
  let everSubscribed = false;
  let needsReconnectReconciliation = false;
  let disconnecting = false;
  let generation = 0;

  function setStatus(
    nextStatus: RoomChannelStatus,
    error: RoomChannelError | null = null,
  ): void {
    status = nextStatus;
    handlers?.onStatusChanged?.(nextStatus, error);
  }

  function requestReconciliation(reason: ReconcileReason): Promise<void> {
    const activeHandlers = handlers;
    if (!activeHandlers) {
      return Promise.resolve();
    }

    pendingReconciliation ??= Promise.resolve()
      .then(() => activeHandlers.onReconcile(reason))
      .catch((cause) => {
        setStatus(
          "error",
          new RoomChannelError(
            "reconciliation_failed",
            "The room reconciliation callback failed.",
            { cause },
          ),
        );
      })
      .finally(() => {
        pendingReconciliation = null;
      });
    return pendingReconciliation;
  }

  function updateWatchers(activeChannel: RealtimeChannel): void {
    watchers = normalizeWatchers(
      activeChannel.presenceState<RoomPresencePayload>(),
    );
    handlers?.onWatchersChanged?.(watchers);
  }

  function extractPayload(message: unknown): unknown {
    return isRecord(message) ? message.payload : undefined;
  }

  async function handlePlaybackBroadcast(message: unknown): Promise<void> {
    if (!activeRoomId || !handlers) {
      return;
    }

    const decision = classifyPlaybackEvent(
      extractPayload(message),
      activeRoomId,
      lastAppliedVersion,
    );

    if (decision.kind === "ignore") {
      return;
    }

    if (decision.kind === "reconcile") {
      await requestReconciliation(decision.reason);
      return;
    }

    try {
      await handlers.onPlaybackState(decision.event);
      lastAppliedVersion = decision.event.state_version;
    } catch {
      await requestReconciliation("playback_handler_failed");
    }
  }

  async function handleQueueBroadcast(message: unknown): Promise<void> {
    if (!activeRoomId || !handlers) {
      return;
    }

    const event = parseQueueEvent(extractPayload(message), activeRoomId);
    if (!event) {
      await requestReconciliation("malformed_event");
      return;
    }

    try {
      await handlers.onQueueChanged?.(event);
    } catch {
      await requestReconciliation("queue_handler_failed");
    }
  }

  async function handleSubtitleBroadcast(
    message: unknown,
  ): Promise<void> {
    if (!activeRoomId || !handlers) {
      return;
    }

    const event = parseSubtitleEvent(extractPayload(message), activeRoomId);
    if (!event) {
      await requestReconciliation("malformed_event");
      return;
    }

    try {
      await handlers.onSubtitleMetadataChanged?.(event);
    } catch {
      await requestReconciliation("subtitle_handler_failed");
    }
  }

  async function trackPresence(activeChannel: RealtimeChannel): Promise<void> {
    if (!identity) {
      return;
    }

    const trackResult = await activeChannel.track({
      user_id: identity.userId,
      room_session_id: identity.roomSessionId,
      display_name: identity.displayName,
      online_at: new Date().toISOString(),
    } satisfies RoomPresencePayload);

    if (trackResult !== "ok") {
      throw new RoomChannelError(
        "presence_track_failed",
        "The private room channel subscribed, but Presence tracking failed.",
      );
    }
  }

  async function disconnect(): Promise<void> {
    if (!channel) {
      if (status !== "idle") {
        setStatus("closed");
      }
      return;
    }

    const channelToRemove = channel;
    disconnecting = true;
    cancelPendingConnect?.();
    generation += 1;
    channel = null;
    activeKey = null;
    activeRoomId = null;
    identity = null;
    pendingConnect = null;
    cancelPendingConnect = null;
    pendingReconciliation = null;
    watchers = Object.freeze([]);

    let cleanupFailed = false;
    if (everSubscribed) {
      cleanupFailed = (await channelToRemove.untrack()) !== "ok";
    }

    cleanupFailed = (await client.removeChannel(channelToRemove)) !== "ok" || cleanupFailed;

    everSubscribed = false;
    needsReconnectReconciliation = false;
    disconnecting = false;
    handlers?.onWatchersChanged?.(watchers);

    if (cleanupFailed) {
      const error = new RoomChannelError(
        "cleanup_failed",
        "The private room channel could not be removed cleanly.",
      );
      setStatus("error", error);
      throw error;
    }

    setStatus("closed");
  }

  async function connect(options: RoomChannelConnectOptions): Promise<void> {
    validateConnectOptions(options);
    const nextKey = `${options.roomId}:${options.identity.roomSessionId}`;

    if (activeKey === nextKey && channel) {
      handlers = options.handlers;
      lastAppliedVersion = Math.max(
        lastAppliedVersion,
        options.initialStateVersion,
      );
      return pendingConnect ?? Promise.resolve();
    }

    if (channel) {
      await disconnect();
    }

    generation += 1;
    const connectGeneration = generation;
    disconnecting = false;
    activeKey = nextKey;
    activeRoomId = options.roomId;
    identity = options.identity;
    handlers = options.handlers;
    lastAppliedVersion = options.initialStateVersion;
    everSubscribed = false;
    needsReconnectReconciliation = false;
    setStatus("connecting");

    await client.realtime.setAuth();

    const topic = `room:${options.roomId}`;
    const nextChannel = client.channel(topic, {
      config: {
        private: true,
        presence: { enabled: true },
      },
    });
    channel = nextChannel;

    nextChannel
      .on("broadcast", { event: "playback_state_changed" }, (message) => {
        playbackQueue = playbackQueue.then(() =>
          handlePlaybackBroadcast(message),
        );
      })
      .on("broadcast", { event: "queue_changed" }, (message) => {
        void handleQueueBroadcast(message);
      })
      .on(
        "broadcast",
        { event: "subtitle_metadata_changed" },
        (message) => {
          void handleSubtitleBroadcast(message);
        },
      )
      .on("presence", { event: "sync" }, () => updateWatchers(nextChannel))
      .on("presence", { event: "join" }, () => updateWatchers(nextChannel))
      .on("presence", { event: "leave" }, () => updateWatchers(nextChannel));

    let settled = false;
    pendingConnect = new Promise<void>((resolve, reject) => {
      cancelPendingConnect = () => {
        if (!settled) {
          settled = true;
          reject(
            new RoomChannelError(
              "connect_cancelled",
              "The private room channel connection was cancelled during cleanup.",
            ),
          );
        }
      };

      nextChannel.subscribe((subscribeStatus, cause) => {
        if (connectGeneration !== generation || channel !== nextChannel) {
          return;
        }

        if (subscribeStatus === "SUBSCRIBED") {
          void (async () => {
            try {
              await trackPresence(nextChannel);
              if (connectGeneration !== generation || channel !== nextChannel) {
                return;
              }

              const isReconnect = everSubscribed && needsReconnectReconciliation;
              everSubscribed = true;
              needsReconnectReconciliation = false;
              setStatus("subscribed");

              if (!settled) {
                settled = true;
                resolve();
              }

              if (isReconnect) {
                await requestReconciliation("reconnected");
              }
            } catch (error) {
              const channelError =
                error instanceof RoomChannelError
                  ? error
                  : new RoomChannelError(
                      "presence_track_failed",
                      "Presence tracking failed after subscribing.",
                      { cause: error },
                    );
              setStatus("error", channelError);
              if (!settled) {
                settled = true;
                reject(channelError);
              }
            }
          })();
          return;
        }

        if (subscribeStatus === "CHANNEL_ERROR" || subscribeStatus === "TIMED_OUT") {
          needsReconnectReconciliation = everSubscribed;
          const channelError = new RoomChannelError(
            "subscribe_failed",
            "The private room channel subscription failed.",
            { cause },
          );
          setStatus(everSubscribed ? "reconnecting" : "error", channelError);
          if (!settled) {
            settled = true;
            reject(channelError);
          }
          return;
        }

        if (subscribeStatus === "CLOSED" && !disconnecting) {
          needsReconnectReconciliation = everSubscribed;
          setStatus(everSubscribed ? "reconnecting" : "closed");
          if (!settled) {
            settled = true;
            reject(
              new RoomChannelError(
                "subscribe_failed",
                "The private room channel closed before subscribing.",
              ),
            );
          }
        }
      });
    }).finally(() => {
      if (connectGeneration === generation) {
        pendingConnect = null;
        cancelPendingConnect = null;
      }
    });

    return pendingConnect;
  }

  function replacePlaybackVersion(stateVersion: number): void {
    validateStateVersion(stateVersion);
    lastAppliedVersion = stateVersion;
  }

  return Object.freeze({
    connect,
    disconnect,
    getStatus: () => status,
    getWatchers: () => watchers,
    getLastAppliedVersion: () => lastAppliedVersion,
    replacePlaybackVersion,
  });
}

let browserRoomChannelService: RoomChannelService | undefined;

export function getBrowserRoomChannelService(): RoomChannelService {
  browserRoomChannelService ??= createRoomChannelService(
    createBrowserSupabaseClient(),
  );
  return browserRoomChannelService;
}
