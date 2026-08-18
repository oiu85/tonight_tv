import type { ChatMessage } from "@/lib/chat/room-chat-service";
import type {
  RoomChannelStatus,
  RoomWatcher,
} from "@/lib/realtime/room-channel-service";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
import type {
  RoomSyncReason,
  RoomSyncState,
  RoomSyncStatus,
} from "@/lib/sync/room-sync-coordinator";
import type { CanonicalPlaybackState } from "@/lib/sync/sync-core";

export type PlayerClockState = Readonly<{
  currentTime: number;
  duration: number | null;
  canonicalTime: number;
  behindSeconds: number;
}>;

export type RoomSyncUiState = Readonly<{
  status: RoomSyncStatus;
  reason: RoomSyncReason | null;
  channelStatus: RoomChannelStatus;
  error: RoomSyncState["error"];
  canonicalPlayback: CanonicalPlaybackState | null;
}>;

const EMPTY_WATCHERS: readonly RoomWatcher[] = Object.freeze([]);
const EMPTY_CHAT: readonly ChatMessage[] = Object.freeze([]);
const INITIAL_CLOCK: PlayerClockState = Object.freeze({
  currentTime: 0,
  duration: null,
  canonicalTime: 0,
  behindSeconds: 0,
});
const INITIAL_SYNC_UI: RoomSyncUiState = Object.freeze({
  status: "idle",
  reason: null,
  channelStatus: "idle",
  error: null,
  canonicalPlayback: null,
});

type Listener = () => void;

function addListener(listeners: Set<Listener>, listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(listeners: Set<Listener>): void {
  for (const listener of listeners) {
    listener();
  }
}

function sameClock(left: PlayerClockState, right: PlayerClockState): boolean {
  return (
    left.currentTime === right.currentTime &&
    left.duration === right.duration &&
    left.canonicalTime === right.canonicalTime &&
    left.behindSeconds === right.behindSeconds
  );
}

function sameSyncUi(left: RoomSyncUiState, right: RoomSyncUiState): boolean {
  return (
    left.status === right.status &&
    left.reason === right.reason &&
    left.channelStatus === right.channelStatus &&
    left.error === right.error &&
    left.canonicalPlayback === right.canonicalPlayback
  );
}

function displayClockTime(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }
  return Math.floor(seconds * 2) / 2;
}

export type RoomSessionStore = Readonly<{
  applyCoordinatorState: (state: RoomSyncState) => void;
  setClock: (clock: PlayerClockState) => void;
  getSnapshot: () => RoomSnapshot | null;
  subscribeSnapshot: (listener: Listener) => () => void;
  getSyncUi: () => RoomSyncUiState;
  subscribeSyncUi: (listener: Listener) => () => void;
  getWatchers: () => readonly RoomWatcher[];
  subscribeWatchers: (listener: Listener) => () => void;
  getChatMessages: () => readonly ChatMessage[];
  subscribeChat: (listener: Listener) => () => void;
  getClock: () => PlayerClockState;
  subscribeClock: (listener: Listener) => () => void;
}>;

export function createRoomSessionStore(): RoomSessionStore {
  let snapshot: RoomSnapshot | null = null;
  let syncUi: RoomSyncUiState = INITIAL_SYNC_UI;
  let watchers: readonly RoomWatcher[] = EMPTY_WATCHERS;
  let chatMessages: readonly ChatMessage[] = EMPTY_CHAT;
  let clock: PlayerClockState = INITIAL_CLOCK;

  const snapshotListeners = new Set<Listener>();
  const syncUiListeners = new Set<Listener>();
  const watcherListeners = new Set<Listener>();
  const chatListeners = new Set<Listener>();
  const clockListeners = new Set<Listener>();

  function applyCoordinatorState(state: RoomSyncState): void {
    const nextSyncUi: RoomSyncUiState = Object.freeze({
      status: state.status,
      reason: state.reason,
      channelStatus: state.channelStatus,
      error: state.error,
      canonicalPlayback: state.canonicalPlayback,
    });
    if (snapshot !== state.snapshot) {
      snapshot = state.snapshot;
      emit(snapshotListeners);
    }
    if (!sameSyncUi(syncUi, nextSyncUi)) {
      syncUi = nextSyncUi;
      emit(syncUiListeners);
    }
    const nextWatchers = state.watchers.length === 0 ? EMPTY_WATCHERS : state.watchers;
    const nextChat = state.chatMessages.length === 0 ? EMPTY_CHAT : state.chatMessages;
    if (watchers !== nextWatchers) {
      watchers = nextWatchers;
      emit(watcherListeners);
    }
    if (chatMessages !== nextChat) {
      chatMessages = nextChat;
      emit(chatListeners);
    }
  }

  function setClock(nextClock: PlayerClockState): void {
    const quantized: PlayerClockState = Object.freeze({
      currentTime: displayClockTime(nextClock.currentTime),
      duration: nextClock.duration,
      canonicalTime: displayClockTime(nextClock.canonicalTime),
      behindSeconds: Math.max(0, Math.round(nextClock.behindSeconds)),
    });
    if (sameClock(clock, quantized)) {
      return;
    }
    clock = quantized;
    emit(clockListeners);
  }

  return Object.freeze({
    applyCoordinatorState,
    setClock,
    getSnapshot: () => snapshot,
    subscribeSnapshot: (listener) => addListener(snapshotListeners, listener),
    getSyncUi: () => syncUi,
    subscribeSyncUi: (listener) => addListener(syncUiListeners, listener),
    getWatchers: () => watchers,
    subscribeWatchers: (listener) => addListener(watcherListeners, listener),
    getChatMessages: () => chatMessages,
    subscribeChat: (listener) => addListener(chatListeners, listener),
    getClock: () => clock,
    subscribeClock: (listener) => addListener(clockListeners, listener),
  });
}
