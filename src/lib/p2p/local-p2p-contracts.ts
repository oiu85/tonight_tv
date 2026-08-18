export const LOCAL_P2P_TRACKERS = Object.freeze([
  "wss://tracker.btorrent.xyz",
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.webtorrent.dev",
] as const);
export const LOCAL_P2P_SERVICE_WORKER_URL = "/webtorrent/sw.min.js";
export const LOCAL_P2P_SERVICE_WORKER_SCOPE = "/webtorrent/";
export type LocalP2pStatus = "unsupported" | "idle" | "preparing" | "hashing" | "seeding" | "connecting" | "ready" | "buffering" | "no_peers" | "error" | "stopped";
export type LocalP2pDescriptor = Readonly<{ infoHash: string; magnetUri: string; fileName: string; fileSize: number; mimeType: string | null }>;
export type LocalP2pState = Readonly<{ status: LocalP2pStatus; infoHash: string | null; peerCount: number; uploadSpeed: number; downloadSpeed: number; progress: number; error: LocalP2pError | null }>;
export type LocalP2pErrorCode = "p2p_unsupported" | "p2p_service_worker_unavailable" | "p2p_initialization_failed" | "p2p_invalid_file" | "p2p_invalid_descriptor" | "p2p_seed_failed" | "p2p_join_failed" | "p2p_stream_failed" | "p2p_stopped";
export class LocalP2pError extends Error { readonly code: LocalP2pErrorCode; constructor(code: LocalP2pErrorCode, message: string, options?: ErrorOptions) { super(message, options); this.name = "LocalP2pError"; this.code = code; } }
