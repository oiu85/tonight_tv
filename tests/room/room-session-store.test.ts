import { describe, expect, it, vi } from "vitest";

import { createRoomSessionStore } from "../../src/lib/room/room-session-store";
import type { RoomSyncState } from "../../src/lib/sync/room-sync-coordinator";

function syncState(overrides: Partial<RoomSyncState> = {}): RoomSyncState {
  return {
    status: "live",
    reason: null,
    canonicalPlayback: null,
    snapshot: null,
    channelStatus: "subscribed",
    watchers: [],
    chatMessages: [],
    error: null,
    ...overrides,
  };
}

describe("createRoomSessionStore", () => {
  it("notifies only the chat slice when a chat message arrives", () => {
    const store = createRoomSessionStore();
    const onSnapshot = vi.fn();
    const onSyncUi = vi.fn();
    const onChat = vi.fn();
    const onWatchers = vi.fn();
    const onClock = vi.fn();

    store.subscribeSnapshot(onSnapshot);
    store.subscribeSyncUi(onSyncUi);
    store.subscribeChat(onChat);
    store.subscribeWatchers(onWatchers);
    store.subscribeClock(onClock);

    const first = syncState({ status: "live" });
    store.applyCoordinatorState(first);
    expect(onSyncUi).toHaveBeenCalledOnce();
    onSyncUi.mockClear();

    store.applyCoordinatorState(
      syncState({
        status: "live",
        chatMessages: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            room_id: "11111111-1111-4111-8111-111111111111",
            user_id: "22222222-2222-4222-8222-222222222222",
            sender_display_name: "Sam",
            body: "hello",
            created_at: "2026-08-18T12:00:00.000Z",
          },
        ],
      }),
    );

    expect(onChat).toHaveBeenCalledOnce();
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(onSyncUi).not.toHaveBeenCalled();
    expect(onWatchers).not.toHaveBeenCalled();
    expect(onClock).not.toHaveBeenCalled();
  });

  it("quantizes clock updates so sub-second jitter does not notify twice", () => {
    const store = createRoomSessionStore();
    const onClock = vi.fn();
    store.subscribeClock(onClock);

    store.setClock({
      currentTime: 12.04,
      duration: 100,
      canonicalTime: 12.1,
      behindSeconds: 0.4,
    });
    store.setClock({
      currentTime: 12.41,
      duration: 100,
      canonicalTime: 12.2,
      behindSeconds: 0.4,
    });

    expect(onClock).toHaveBeenCalledOnce();
    expect(store.getClock()).toEqual({
      currentTime: 12,
      duration: 100,
      canonicalTime: 12,
      behindSeconds: 0,
    });
  });
});
