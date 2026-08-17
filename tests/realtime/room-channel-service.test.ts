import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  classifyPlaybackEvent,
  createRoomChannelService,
  normalizeWatchers,
  type PlaybackStateChangedEvent,
  type RoomChannelConnectOptions,
  type RoomChannelHandlers,
} from "../../src/lib/realtime/room-channel-service";
import type { Database } from "../../src/lib/supabase/database.types";

const roomId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const mediaId = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-08-17T12:00:00.000Z";

type SubscribeCallback = (status: string, error?: Error) => void;
type EventCallback = (payload: unknown) => void;

class ChannelMock {
  readonly handlers = new Map<string, EventCallback[]>();
  readonly track = vi.fn().mockResolvedValue("ok");
  readonly untrack = vi.fn().mockResolvedValue("ok");
  private subscribeCallback: SubscribeCallback | null = null;
  private state: Record<string, unknown> = {};

  on(type: string, filter: { event: string }, callback: EventCallback) {
    const key = `${type}:${filter.event}`;
    this.handlers.set(key, [...(this.handlers.get(key) ?? []), callback]);
    return this;
  }

  subscribe(callback: SubscribeCallback) {
    this.subscribeCallback = callback;
    return this;
  }

  emitSubscribe(status: string, error?: Error) {
    this.subscribeCallback?.(status, error);
  }

  emit(type: string, event: string, payload: unknown = {}) {
    for (const callback of this.handlers.get(`${type}:${event}`) ?? []) {
      callback(payload);
    }
  }

  setPresenceState(state: Record<string, unknown>) {
    this.state = state;
  }

  presenceState() {
    return this.state;
  }
}

function createClientMock() {
  const channel = new ChannelMock();
  const setAuth = vi.fn().mockResolvedValue(undefined);
  const createChannel = vi.fn().mockReturnValue(channel as unknown as RealtimeChannel);
  const removeChannel = vi.fn().mockResolvedValue("ok");

  return {
    channel,
    setAuth,
    createChannel,
    removeChannel,
    client: {
      realtime: { setAuth },
      channel: createChannel,
      removeChannel,
    } as unknown as SupabaseClient<Database>,
  };
}

function createPlaybackEvent(
  overrides: Partial<PlaybackStateChangedEvent> = {},
): PlaybackStateChangedEvent {
  return {
    room_id: roomId,
    current_media_id: mediaId,
    status: "playing",
    anchor_position_sec: 12.5,
    anchor_server_time: timestamp,
    state_version: 8,
    updated_at: timestamp,
    ...overrides,
  };
}

function createHandlers(
  overrides: Partial<RoomChannelHandlers> = {},
): RoomChannelHandlers {
  return {
    onPlaybackState: vi.fn(),
    onReconcile: vi.fn(),
    onQueueChanged: vi.fn(),
    onSubtitleMetadataChanged: vi.fn(),
    onChatMessageCreated: vi.fn(),
    onWatchersChanged: vi.fn(),
    onStatusChanged: vi.fn(),
    ...overrides,
  };
}

function createOptions(
  handlers: RoomChannelHandlers,
  overrides: Partial<RoomChannelConnectOptions> = {},
): RoomChannelConnectOptions {
  return {
    roomId,
    identity: {
      userId,
      roomSessionId: sessionId,
      displayName: "Viewer B",
    },
    initialStateVersion: 7,
    handlers,
    ...overrides,
  };
}

async function connectSubscribed(
  service: ReturnType<typeof createRoomChannelService>,
  channel: ChannelMock,
  options: RoomChannelConnectOptions,
) {
  const pending = service.connect(options);
  await vi.waitFor(() => expect(channel.handlers.size).toBeGreaterThan(0));
  channel.emitSubscribe("SUBSCRIBED");
  await pending;
}

describe("playback Broadcast version decisions", () => {
  it("applies exactly the next version and ignores stale or duplicate events", () => {
    expect(classifyPlaybackEvent(createPlaybackEvent(), roomId, 7)).toMatchObject({
      kind: "apply",
      event: { state_version: 8 },
    });
    expect(classifyPlaybackEvent(createPlaybackEvent(), roomId, 8)).toEqual({
      kind: "ignore",
      reason: "stale_or_duplicate",
    });
    expect(
      classifyPlaybackEvent(createPlaybackEvent({ state_version: 6 }), roomId, 7),
    ).toEqual({ kind: "ignore", reason: "stale_or_duplicate" });
  });

  it("requests reconciliation for version gaps and malformed payloads", () => {
    expect(
      classifyPlaybackEvent(createPlaybackEvent({ state_version: 10 }), roomId, 7),
    ).toEqual({ kind: "reconcile", reason: "version_gap" });
    expect(
      classifyPlaybackEvent(
        createPlaybackEvent({ room_id: userId }),
        roomId,
        7,
      ),
    ).toEqual({ kind: "reconcile", reason: "malformed_event" });
    expect(
      classifyPlaybackEvent(
        createPlaybackEvent({ anchor_position_sec: Number.NaN }),
        roomId,
        7,
      ),
    ).toEqual({ kind: "reconcile", reason: "malformed_event" });
  });
});

describe("Presence normalization", () => {
  it("deduplicates multiple metas for one logical user and keeps the newest", () => {
    const newer = "2026-08-17T12:01:00.000Z";
    const watchers = normalizeWatchers({
      firstConnection: [
        {
          user_id: userId,
          room_session_id: sessionId,
          display_name: "Viewer B",
          online_at: timestamp,
          presence_ref: "first",
        },
      ],
      secondConnection: [
        {
          user_id: userId,
          room_session_id: sessionId,
          display_name: "Viewer B Updated",
          online_at: newer,
          presence_ref: "second",
        },
        {
          user_id: mediaId,
          room_session_id: "55555555-5555-4555-8555-555555555555",
          display_name: "Owner A",
          online_at: timestamp,
          presence_ref: "owner",
        },
      ],
      malformed: [{ user_id: "not-a-uuid" }],
    });

    expect(watchers).toHaveLength(2);
    expect(watchers.find((watcher) => watcher.user_id === userId)).toMatchObject({
      display_name: "Viewer B Updated",
      online_at: newer,
    });
  });
});

describe("room channel lifecycle", () => {
  it("uses one authenticated private channel and tracks Presence after subscribe", async () => {
    const { client, channel, setAuth, createChannel } = createClientMock();
    const handlers = createHandlers();
    const service = createRoomChannelService(client);

    await connectSubscribed(service, channel, createOptions(handlers));

    expect(setAuth).toHaveBeenCalledOnce();
    expect(createChannel).toHaveBeenCalledWith(`room:${roomId}`, {
      config: { private: true, presence: { enabled: true } },
    });
    expect(channel.track).toHaveBeenCalledOnce();
    expect(channel.track).toHaveBeenCalledWith({
      user_id: userId,
      room_session_id: sessionId,
      display_name: "Viewer B",
      online_at: expect.any(String),
    });
    expect(service.getStatus()).toBe("subscribed");
  });

  it("reuses an active room subscription and cleanup removes it once", async () => {
    const { client, channel, createChannel, removeChannel } = createClientMock();
    const service = createRoomChannelService(client);
    const handlers = createHandlers();
    const options = createOptions(handlers);

    await connectSubscribed(service, channel, options);
    await service.connect({ ...options, handlers: createHandlers() });

    expect(createChannel).toHaveBeenCalledOnce();
    expect(channel.handlers.get("broadcast:playback_state_changed")).toHaveLength(1);
    expect(channel.handlers.get("broadcast:chat_message_created")).toHaveLength(1);

    await service.disconnect();

    expect(channel.untrack).toHaveBeenCalledOnce();
    expect(removeChannel).toHaveBeenCalledOnce();
    expect(service.getStatus()).toBe("closed");
  });

  it("applies valid playback, ignores duplicates, and reconciles gaps", async () => {
    const { client, channel } = createClientMock();
    const onPlaybackState = vi.fn();
    const onReconcile = vi.fn();
    const handlers = createHandlers({ onPlaybackState, onReconcile });
    const service = createRoomChannelService(client);

    await connectSubscribed(service, channel, createOptions(handlers));

    channel.emit("broadcast", "playback_state_changed", {
      payload: createPlaybackEvent(),
    });
    await vi.waitFor(() => expect(onPlaybackState).toHaveBeenCalledOnce());
    expect(service.getLastAppliedVersion()).toBe(8);

    channel.emit("broadcast", "playback_state_changed", {
      payload: createPlaybackEvent(),
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(onPlaybackState).toHaveBeenCalledOnce();

    channel.emit("broadcast", "playback_state_changed", {
      payload: createPlaybackEvent({ state_version: 10 }),
    });
    await vi.waitFor(() => expect(onReconcile).toHaveBeenCalledWith("version_gap"));
    expect(service.getLastAppliedVersion()).toBe(8);
  });

  it("rejects malformed application events and reconciles instead", async () => {
    const { client, channel } = createClientMock();
    const onReconcile = vi.fn();
    const handlers = createHandlers({ onReconcile });
    const service = createRoomChannelService(client);

    await connectSubscribed(service, channel, createOptions(handlers));
    channel.emit("broadcast", "queue_changed", {
      payload: { room_id: userId, operation: "insert" },
    });

    await vi.waitFor(() =>
      expect(onReconcile).toHaveBeenCalledWith("malformed_event"),
    );
    expect(handlers.onQueueChanged).not.toHaveBeenCalled();
  });

  it("validates and forwards database-originated chat messages", async () => {
    const { client, channel } = createClientMock();
    const onChatMessageCreated = vi.fn();
    const onReconcile = vi.fn();
    const handlers = createHandlers({ onChatMessageCreated, onReconcile });
    const service = createRoomChannelService(client);

    await connectSubscribed(service, channel, createOptions(handlers));
    channel.emit("broadcast", "chat_message_created", {
      payload: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        room_id: roomId,
        user_id: userId,
        sender_display_name: "Viewer B",
        body: "Hello",
        created_at: timestamp,
      },
    });

    await vi.waitFor(() => expect(onChatMessageCreated).toHaveBeenCalledOnce());
    expect(onReconcile).not.toHaveBeenCalled();

    channel.emit("broadcast", "chat_message_created", {
      payload: { room_id: roomId, body: "missing fields" },
    });
    await vi.waitFor(() => expect(onReconcile).toHaveBeenCalledWith("malformed_event"));
  });

  it("re-tracks Presence and exposes one reconciliation after reconnect", async () => {
    const { client, channel } = createClientMock();
    const onReconcile = vi.fn();
    const handlers = createHandlers({ onReconcile });
    const service = createRoomChannelService(client);

    await connectSubscribed(service, channel, createOptions(handlers));
    channel.emitSubscribe("CHANNEL_ERROR", new Error("socket dropped"));
    expect(service.getStatus()).toBe("reconnecting");

    channel.emitSubscribe("SUBSCRIBED");

    await vi.waitFor(() => expect(channel.track).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(onReconcile).toHaveBeenCalledWith("reconnected"));
    expect(onReconcile).toHaveBeenCalledOnce();
    expect(service.getStatus()).toBe("subscribed");
  });

  it("surfaces an initial authorization/subscription failure", async () => {
    const { client, channel } = createClientMock();
    const service = createRoomChannelService(client);
    const pending = service.connect(createOptions(createHandlers()));
    await vi.waitFor(() => expect(channel.handlers.size).toBeGreaterThan(0));

    channel.emitSubscribe("CHANNEL_ERROR", new Error("not authorized"));

    await expect(pending).rejects.toMatchObject({ code: "subscribe_failed" });
    expect(service.getStatus()).toBe("error");
    expect(channel.track).not.toHaveBeenCalled();
  });

  it("normalizes Presence sync into unique watchers", async () => {
    const { client, channel } = createClientMock();
    const onWatchersChanged = vi.fn();
    const handlers = createHandlers({ onWatchersChanged });
    const service = createRoomChannelService(client);

    await connectSubscribed(service, channel, createOptions(handlers));
    channel.setPresenceState({
      one: [
        {
          user_id: userId,
          room_session_id: sessionId,
          display_name: "Viewer B",
          online_at: timestamp,
        },
        {
          user_id: userId,
          room_session_id: sessionId,
          display_name: "Viewer B",
          online_at: timestamp,
        },
      ],
    });
    channel.emit("presence", "sync");

    expect(service.getWatchers()).toHaveLength(1);
    expect(onWatchersChanged).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: userId }),
    ]);
  });
});
