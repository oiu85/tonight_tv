export { LOCAL_P2P_RTC_CONFIG } from "./domain/ice";
export {
  LOCAL_P2P_SERVICE_WORKER_SCOPE,
  LOCAL_P2P_SERVICE_WORKER_URL,
  LOCAL_P2P_TRACKERS,
} from "./domain/constants";
export { LocalP2pError, type LocalP2pErrorCode } from "./domain/errors";
export { magnetWithTrackers, mimeTypeFromFileName } from "./domain/magnet";
export {
  parseLocalP2pSignal,
  shouldInitiateRoomPeer,
  shouldInitiateSignal,
  type LocalP2pSignalKind,
  type LocalP2pSignalMessage,
  type LocalP2pSignalRole,
  type LocalP2pSignalTransport,
} from "./domain/signal";
export {
  type LocalP2pDescriptor,
  type LocalP2pState,
  type LocalP2pStatus,
} from "./domain/types";
