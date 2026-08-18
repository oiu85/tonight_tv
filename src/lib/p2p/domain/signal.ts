import {
  LOCAL_P2P_INFO_HASH_PATTERN,
  LOCAL_P2P_SESSION_ID_MAX,
  LOCAL_P2P_SESSION_ID_MIN,
} from "./constants";

export type LocalP2pSignalKind = "hello" | "signal";
export type LocalP2pSignalRole = "seed" | "leech";

export type LocalP2pSignalMessage = Readonly<{
  kind: LocalP2pSignalKind;
  infoHash: string;
  from: string;
  to: string | null;
  role: LocalP2pSignalRole;
  data?: unknown;
}>;

export type LocalP2pSignalTransport = Readonly<{
  sessionId: string;
  send: (message: LocalP2pSignalMessage) => Promise<void> | void;
  subscribe: (listener: (message: LocalP2pSignalMessage) => void) => () => void;
}>;

function isSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= LOCAL_P2P_SESSION_ID_MIN &&
    value.length <= LOCAL_P2P_SESSION_ID_MAX
  );
}

export function parseLocalP2pSignal(value: unknown): LocalP2pSignalMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if ((record.kind !== "hello" && record.kind !== "signal") || (record.role !== "seed" && record.role !== "leech")) {
    return null;
  }
  if (typeof record.infoHash !== "string" || !LOCAL_P2P_INFO_HASH_PATTERN.test(record.infoHash)) return null;
  if (!isSessionId(record.from)) return null;
  if (record.to != null && !isSessionId(record.to)) return null;
  return Object.freeze({
    kind: record.kind,
    infoHash: record.infoHash,
    from: record.from,
    to: record.to ?? null,
    role: record.role,
    data: record.data,
  });
}

export function shouldInitiateSignal(localSessionId: string, remoteSessionId: string): boolean {
  return localSessionId > remoteSessionId;
}

export function shouldInitiateRoomPeer(options: Readonly<{
  localSessionId: string;
  remoteSessionId: string;
  localRole: LocalP2pSignalRole;
  remoteRole: LocalP2pSignalRole | null;
}>): boolean {
  if (options.localRole === "seed") return true;
  if (options.remoteRole === "seed") return false;
  return shouldInitiateSignal(options.localSessionId, options.remoteSessionId);
}

export function signalPeerKey(infoHash: string, remoteSessionId: string): string {
  return `${infoHash}:${remoteSessionId}`;
}
