export type LocalP2pErrorCode =
  | "p2p_unsupported"
  | "p2p_service_worker_unavailable"
  | "p2p_initialization_failed"
  | "p2p_invalid_file"
  | "p2p_invalid_descriptor"
  | "p2p_seed_failed"
  | "p2p_join_failed"
  | "p2p_stream_failed"
  | "p2p_stopped";

export class LocalP2pError extends Error {
  readonly code: LocalP2pErrorCode;

  constructor(code: LocalP2pErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LocalP2pError";
    this.code = code;
  }
}
