import type { Database } from "../supabase/database.types";

export type PlaybackStatus = Database["public"]["Enums"]["playback_status"];

export type CanonicalPlaybackState = Readonly<{
  room_id: string;
  current_media_id: string | null;
  status: PlaybackStatus;
  anchor_position_sec: number;
  anchor_server_time: string;
  state_version: number;
  updated_at: string;
}>;

export type SyncMedia = Readonly<{
  id: string;
  roomId?: string;
  title: string;
  sourceUrl: string | null;
  sourceType: Database["public"]["Enums"]["media_source_type"];
  youtubeVideoId: string | null;
  sourceRevision?: number;
  torrentInfoHash?: string | null;
  torrentFileIndex?: number | null;
  torrentFilePath?: string | null;
}>;

export type PlayerCapabilities = Readonly<{
  supportsFinePlaybackRateCorrection: boolean;
  supportsPictureInPicture: boolean;
  supportsNativeTextTracks: boolean;
}>;

/**
 * The deliberately small media boundary consumed by the synchronization engine.
 * A future HTML5/HLS adapter owns media-specific loading and readiness details.
 */
export type PlayerSyncAdapter = Readonly<{
  getMediaId: () => string | null;
  loadMedia: (media: SyncMedia | null) => Promise<void>;
  waitUntilReady: () => Promise<void>;
  isReady: () => boolean;
  isSeekable: (positionSec: number) => boolean;
  /**
   * Resolves a canonical target to a position that this runtime can seek now.
   * VOD returns null until the exact target is seekable. A live/DVR runtime may
   * clamp to its current seekable window.
   */
  getSeekableTarget?: (positionSec: number) => number | null;
  isPaused: () => boolean;
  getCurrentTime: () => number;
  getDuration: () => number | null;
  seek: (positionSec: number) => void | Promise<void>;
  play: () => Promise<void>;
  pause: () => void | Promise<void>;
  getPlaybackRate: () => number;
  setPlaybackRate: (rate: number) => void;
  getAvailablePlaybackRates: () => readonly number[];
  getCapabilities: () => PlayerCapabilities;
}>;

export const DEFAULT_DRIFT_POLICY = Object.freeze({
  noCorrectionThresholdSec: 0.25,
  rateCorrectionResetThresholdSec: 0.1,
  hardSeekThresholdSec: 1,
  catchUpPlaybackRate: 1.03,
  slowDownPlaybackRate: 0.97,
  normalPlaybackRate: 1,
});

export const SEEK_ONLY_DRIFT_POLICY = Object.freeze({
  ...DEFAULT_DRIFT_POLICY,
  noCorrectionThresholdSec: 0.5,
  rateCorrectionResetThresholdSec: 0.25,
  hardSeekThresholdSec: 2,
});

export type DriftPolicy = Readonly<{
  noCorrectionThresholdSec: number;
  rateCorrectionResetThresholdSec: number;
  hardSeekThresholdSec: number;
  catchUpPlaybackRate: number;
  slowDownPlaybackRate: number;
  normalPlaybackRate: number;
}>;

export type CorrectionDecision =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "wait"; resetRate: boolean }>
  | Readonly<{ kind: "reset_rate" }>
  | Readonly<{ kind: "set_rate"; rate: number }>
  | Readonly<{ kind: "seek"; positionSec: number; resetRate: boolean }>;

export type VersionDecision = "stale_or_duplicate" | "sequential" | "gap";

function clampPosition(positionSec: number, durationSec?: number | null): number {
  const nonnegativePosition = Math.max(0, positionSec);
  if (
    durationSec === null ||
    durationSec === undefined ||
    !Number.isFinite(durationSec) ||
    durationSec < 0
  ) {
    return nonnegativePosition;
  }

  return Math.min(nonnegativePosition, durationSec);
}

/** Returns the canonical media position, or null when the room has no live media. */
export function expectedCanonicalPosition(
  state: Pick<
    CanonicalPlaybackState,
    "status" | "anchor_position_sec" | "anchor_server_time"
  >,
  estimatedServerNowMs: number,
  durationSec?: number | null,
): number | null {
  if (state.status === "idle") {
    return null;
  }

  if (state.status !== "playing") {
    return clampPosition(state.anchor_position_sec, durationSec);
  }

  const anchorServerTimeMs = Date.parse(state.anchor_server_time);
  const elapsedSec = Number.isFinite(anchorServerTimeMs)
    ? Math.max(0, estimatedServerNowMs - anchorServerTimeMs) / 1_000
    : 0;

  return clampPosition(
    state.anchor_position_sec + elapsedSec,
    durationSec,
  );
}

/** Positive drift means the local player is ahead; negative means it is behind. */
export function calculateDrift(
  actualPositionSec: number,
  expectedPositionSec: number,
): number {
  return actualPositionSec - expectedPositionSec;
}

export function comparePlaybackVersions(
  incomingVersion: number,
  lastAppliedVersion: number,
): VersionDecision {
  if (incomingVersion <= lastAppliedVersion) {
    return "stale_or_duplicate";
  }

  return incomingVersion === lastAppliedVersion + 1 ? "sequential" : "gap";
}

export function selectCorrectionDecision(options: Readonly<{
  state: Pick<CanonicalPlaybackState, "status">;
  driftSec: number;
  expectedPositionSec: number;
  playerReady: boolean;
  seekable: boolean;
  buffering: boolean;
  currentPlaybackRate: number;
  rateCorrectionActive: boolean;
  supportsFinePlaybackRateCorrection?: boolean;
  policy?: DriftPolicy;
}>): CorrectionDecision {
  const policy = options.policy ?? DEFAULT_DRIFT_POLICY;
  const rateIsNormal =
    Math.abs(options.currentPlaybackRate - policy.normalPlaybackRate) < 0.000_001;

  if (options.state.status === "idle") {
    return rateIsNormal ? { kind: "none" } : { kind: "reset_rate" };
  }

  if (!options.playerReady || options.buffering) {
    return { kind: "wait", resetRate: !rateIsNormal };
  }

  const absoluteDrift = Math.abs(options.driftSec);

  if (options.state.status !== "playing") {
    if (absoluteDrift < policy.noCorrectionThresholdSec) {
      return rateIsNormal ? { kind: "none" } : { kind: "reset_rate" };
    }

    return options.seekable
      ? {
          kind: "seek",
          positionSec: options.expectedPositionSec,
          resetRate: !rateIsNormal,
        }
      : { kind: "wait", resetRate: !rateIsNormal };
  }

  if (
    options.rateCorrectionActive &&
    absoluteDrift <= policy.rateCorrectionResetThresholdSec
  ) {
    return { kind: "reset_rate" };
  }

  if (absoluteDrift < policy.noCorrectionThresholdSec) {
    return { kind: "none" };
  }

  if (absoluteDrift >= policy.hardSeekThresholdSec) {
    return options.seekable
      ? {
          kind: "seek",
          positionSec: options.expectedPositionSec,
          resetRate: !rateIsNormal,
        }
      : { kind: "wait", resetRate: !rateIsNormal };
  }

  if (options.supportsFinePlaybackRateCorrection === false) {
    return rateIsNormal ? { kind: "none" } : { kind: "reset_rate" };
  }

  return {
    kind: "set_rate",
    rate:
      options.driftSec < 0
        ? policy.catchUpPlaybackRate
        : policy.slowDownPlaybackRate,
  };
}
