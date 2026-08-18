import type { LocalP2pError } from "./errors";

export type LocalP2pStatus =
  | "unsupported"
  | "idle"
  | "preparing"
  | "hashing"
  | "seeding"
  | "connecting"
  | "ready"
  | "buffering"
  | "no_peers"
  | "error"
  | "stopped";

export type LocalP2pDescriptor = Readonly<{
  infoHash: string;
  magnetUri: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
}>;

export type LocalP2pState = Readonly<{
  status: LocalP2pStatus;
  infoHash: string | null;
  peerCount: number;
  uploadSpeed: number;
  downloadSpeed: number;
  progress: number;
  hosting: boolean;
  error: LocalP2pError | null;
}>;

export const IDLE_LOCAL_P2P_STATE: LocalP2pState = Object.freeze({
  status: "idle",
  infoHash: null,
  peerCount: 0,
  uploadSpeed: 0,
  downloadSpeed: 0,
  progress: 0,
  hosting: false,
  error: null,
});
