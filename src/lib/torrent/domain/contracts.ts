export const TORRENT_METADATA_MAX_BYTES = 2 * 1024 * 1024;
export const TORRENT_MANIFEST_PAGE_SIZE = 500;
export const TORRENT_MANIFEST_MAX_FILES = 5_000;
export const TORRENT_PATH_MAX_LENGTH = 1_024;
export const TORRENT_PATH_MAX_DEPTH = 32;

export type TorrentInputKind = "magnet" | "torrent_file";
export type TorrentFileKind =
  | "video"
  | "subtitle"
  | "audio"
  | "image"
  | "archive"
  | "other";

export type TorrentManifestFile = Readonly<{
  index: number;
  path: string;
  name: string;
  sizeBytes: number;
  extension: string | null;
  kind: TorrentFileKind;
  playableCandidate: boolean;
  candidateRank: number;
}>;

export type TorrentInspectionStatus =
  | "registering_torrent"
  | "fetching_metadata"
  | "waiting_for_peers"
  | "probing_media"
  | "ready"
  | "error";

export type TorrentInspection = Readonly<{
  infoHash: string;
  torrentName: string | null;
  status: TorrentInspectionStatus;
  files: readonly TorrentManifestFile[];
  totalFiles: number;
  truncated: boolean;
  magnetUri?: string | null;
}>;

export type TorrentAudioTrack = Readonly<{
  index: number;
  language: string | null;
  title: string | null;
  codec: string | null;
  channels: number | null;
}>;

export type TorrentEmbeddedSubtitle = Readonly<{
  index: number;
  language: string | null;
  title: string | null;
  codec: string | null;
  forced: boolean;
  url: string | null;
}>;

export type TorrentMediaProbe = Readonly<{
  durationSec: number | null;
  container: string | null;
  videoCodec: string | null;
  width: number | null;
  height: number | null;
  audioTracks: readonly TorrentAudioTrack[];
  embeddedSubtitles: readonly TorrentEmbeddedSubtitle[];
  browserCompatible: boolean;
  expectedPlaybackMode: "http" | "hls";
  transcodeRequired: boolean;
}>;

export type ResolvedTorrentPlaybackSource = Readonly<{
  kind: "http" | "hls";
  url: string;
  expiresAt?: string;
  durationSec?: number;
  timelineOffsetSec: number;
  mediaIdentity: string;
  capabilities: Readonly<{
    seek: boolean;
    playbackRate: boolean;
  }>;
  probe: TorrentMediaProbe | null;
}>;

export type TorrentGatewayStatus = Readonly<{
  infoHash: string;
  status: TorrentInspectionStatus;
  peers: number | null;
  downloadBytesPerSec: number | null;
  errorCategory: TorrentErrorCategory | null;
}>;

export type TorrentGatewayInput =
  | Readonly<{ kind: "magnet"; magnetUri: string }>
  | Readonly<{ kind: "torrent_file"; bytes: Uint8Array }>;

export type PrepareTorrentInput = Readonly<{
  infoHash: string;
  fileIndex: number;
  expectedFilePath: string;
}>;

export type ResolveTorrentPlaybackInput = PrepareTorrentInput &
  Readonly<{ sourceRevision: number; mediaId: string }>;

export type TorrentStatusInput = Readonly<{ infoHash: string }>;

export type TorrentErrorCategory =
  | "invalid_torrent"
  | "invalid_magnet"
  | "torrent_metadata_timeout"
  | "no_peers"
  | "torrent_metadata_unavailable"
  | "no_playable_video"
  | "selected_file_missing"
  | "unsupported_media"
  | "media_probe_failed"
  | "gateway_unavailable"
  | "gateway_auth_failed"
  | "stream_prepare_failed"
  | "transcode_failed"
  | "stream_expired"
  | "hls_failed"
  | "subtitle_import_failed"
  | "gateway_rate_limited"
  | "unknown_torrent_error";

export class TorrentGatewayError extends Error {
  readonly category: TorrentErrorCategory;
  readonly status: number;

  constructor(
    category: TorrentErrorCategory,
    message: string,
    options?: ErrorOptions & { status?: number },
  ) {
    super(message, options);
    this.name = "TorrentGatewayError";
    this.category = category;
    this.status = options?.status ?? 502;
  }
}

export interface TorrentGateway {
  inspect(input: TorrentGatewayInput): Promise<TorrentInspection>;
  prepare(input: PrepareTorrentInput): Promise<ResolvedTorrentPlaybackSource>;
  resolvePlayback(
    input: ResolveTorrentPlaybackInput,
  ): Promise<ResolvedTorrentPlaybackSource>;
  getStatus(input: TorrentStatusInput): Promise<TorrentGatewayStatus>;
  fetchSubtitle(input: PrepareTorrentInput): Promise<Readonly<{ name: string; text: string }>>;
  dispose?(input: TorrentStatusInput): Promise<void>;
}
