"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import type { ChatMessage } from "@/lib/chat/room-chat-service";
import type { RoomWatcher } from "@/lib/realtime/room-channel-service";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
import {
  createRoomSessionStore,
  type PlayerClockState,
  type RoomSessionStore,
  type RoomSyncUiState,
} from "@/lib/room/room-session-store";

const RoomSessionContext = createContext<RoomSessionStore | null>(null);
const EMPTY_WATCHERS: readonly RoomWatcher[] = Object.freeze([]);
const EMPTY_CHAT: readonly ChatMessage[] = Object.freeze([]);
const FALLBACK_CLOCK: PlayerClockState = Object.freeze({
  currentTime: 0,
  duration: null,
  canonicalTime: 0,
  behindSeconds: 0,
});
const FALLBACK_SYNC_UI: RoomSyncUiState = Object.freeze({
  status: "idle",
  reason: null,
  channelStatus: "idle",
  error: null,
  canonicalPlayback: null,
});

function subscribeNoop(): () => void {
  return () => undefined;
}

export function RoomSessionProvider({
  store,
  children,
}: {
  store: RoomSessionStore;
  children: ReactNode;
}) {
  return (
    <RoomSessionContext.Provider value={store}>
      {children}
    </RoomSessionContext.Provider>
  );
}

export function useRoomSessionStore(): RoomSessionStore | null {
  return useContext(RoomSessionContext);
}

export function useRoomSnapshot(): RoomSnapshot | null {
  const store = useContext(RoomSessionContext);
  return useSyncExternalStore(
    store ? store.subscribeSnapshot : subscribeNoop,
    store ? store.getSnapshot : () => null,
    store ? store.getSnapshot : () => null,
  );
}

export function useRoomSyncUi(): RoomSyncUiState {
  const store = useContext(RoomSessionContext);
  return useSyncExternalStore(
    store ? store.subscribeSyncUi : subscribeNoop,
    store ? store.getSyncUi : () => FALLBACK_SYNC_UI,
    store ? store.getSyncUi : () => FALLBACK_SYNC_UI,
  );
}

export function useRoomWatchers(): readonly RoomWatcher[] {
  const store = useContext(RoomSessionContext);
  return useSyncExternalStore(
    store ? store.subscribeWatchers : subscribeNoop,
    store ? store.getWatchers : () => EMPTY_WATCHERS,
    store ? store.getWatchers : () => EMPTY_WATCHERS,
  );
}

export function useRoomChatMessages(): readonly ChatMessage[] {
  const store = useContext(RoomSessionContext);
  return useSyncExternalStore(
    store ? store.subscribeChat : subscribeNoop,
    store ? store.getChatMessages : () => EMPTY_CHAT,
    store ? store.getChatMessages : () => EMPTY_CHAT,
  );
}

export function usePlayerClock(): PlayerClockState {
  const store = useContext(RoomSessionContext);
  return useSyncExternalStore(
    store ? store.subscribeClock : subscribeNoop,
    store ? store.getClock : () => FALLBACK_CLOCK,
    store ? store.getClock : () => FALLBACK_CLOCK,
  );
}

export { createRoomSessionStore };
