export const LOCAL_P2P_TRACKERS = Object.freeze([
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.webtorrent.dev",
  "wss://tracker.btorrent.xyz",
  "wss://tracker.files.fm:7073/announce",
] as const);

export const LOCAL_P2P_SERVICE_WORKER_URL = "/webtorrent/sw.min.js";
export const LOCAL_P2P_SERVICE_WORKER_SCOPE = "/";

export const LOCAL_P2P_JOIN_TIMEOUT_MS = 45_000;
export const LOCAL_P2P_HELLO_INTERVAL_MS = 3_000;
export const LOCAL_P2P_HELLO_KEEPALIVE_MS = 10_000;
export const LOCAL_P2P_INFO_HASH_PATTERN = /^[a-f0-9]{40}$/;
export const LOCAL_P2P_SESSION_ID_MIN = 8;
export const LOCAL_P2P_SESSION_ID_MAX = 80;
