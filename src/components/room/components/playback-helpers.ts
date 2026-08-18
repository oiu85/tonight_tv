/**
 * Shared formatters and status mapping used by the room player UI.
 */

import type { MediaRuntimeError } from "@/lib/media/media-source";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
import type { RoomSyncStatus } from "@/lib/sync/room-sync-coordinator";
import { getNumberLocale, type Locale } from "@/i18n";

export function formatPlaybackTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "--:--";
  }
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remaining = whole % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

type Translator = (key: string, values?: Record<string, string | number | Date>) => string;

export function mediaErrorCopy(
  error: MediaRuntimeError,
  tVideo: Translator,
  tErrors: Translator,
): { title: string; body: string } {
  switch (error.category) {
    case "autoplay_permission_blocked":
      return { title: tVideo("blockedTitle"), body: tVideo("blockedBody") };
    case "authenticated_source_unsupported":
      return { title: tErrors("authSourceTitle"), body: tErrors("authSourceBody") };
    case "expired_url_suspected":
      return { title: tErrors("expiredTitle"), body: tErrors("expiredBody") };
    case "encrypted_drm_source_unsupported":
      return { title: tErrors("drmTitle"), body: tErrors("drmBody") };
    case "unsupported_codec_container":
      return { title: tErrors("codecTitle"), body: tErrors("codecBody") };
    case "cors_referrer_origin_blocked":
      return { title: tErrors("corsTitle"), body: tErrors("corsBody") };
    case "network_source_unreachable":
      return { title: tErrors("networkTitle"), body: tErrors("networkBody") };
    case "hls_manifest_error":
      return { title: tErrors("hlsManifestTitle"), body: tErrors("hlsManifestBody") };
    case "hls_media_error":
      return { title: tErrors("hlsMediaTitle"), body: tErrors("hlsMediaBody") };
    case "p2p_unsupported":
      return { title: tErrors("p2pUnsupportedTitle"), body: tErrors("p2pUnsupportedBody") };
    case "p2p_file_required":
      return { title: tErrors("p2pFileRequiredTitle"), body: tErrors("p2pFileRequiredBody") };
    case "p2p_no_peers":
    case "p2p_host_unavailable":
      return { title: tErrors("p2pNoPeersTitle"), body: tErrors("p2pNoPeersBody") };
    case "p2p_media_unsupported":
      return { title: tErrors("codecTitle"), body: tErrors("p2pCodecBody") };
    case "p2p_tracker_unavailable":
    case "p2p_stream_failed":
      return { title: tErrors("p2pStreamTitle"), body: tErrors("p2pStreamBody") };
    default:
      return { title: tErrors("fatal"), body: tErrors("fatal") };
  }
}

export function syncStatusCopy(
  status: RoomSyncStatus,
  behindSeconds: number,
  playback: RoomSnapshot["playback"]["status"],
  t: Translator,
): { label: string; tone: "live" | "warning" | "danger" | "neutral"; detail: string } {
  if (playback === "ended") {
    return { label: t("ended"), tone: "warning", detail: t("ended") };
  }
  if (playback === "paused") {
    return { label: t("paused"), tone: "warning", detail: t("paused") };
  }
  if (playback === "idle") {
    return { label: t("idle"), tone: "neutral", detail: t("idle") };
  }
  switch (status) {
    case "live":
      if (behindSeconds < 2) return { label: t("live"), tone: "live", detail: t("live") };
      return { label: t("behindLabel", { seconds: Math.round(behindSeconds) }), tone: "warning", detail: t("behind") };
    case "synchronizing":
    case "aligning":
    case "seeking":
    case "catching_up":
      return { label: t("catchingUp"), tone: "warning", detail: t("catchingUp") };
    case "buffering":
      return { label: t("buffering"), tone: "warning", detail: t("buffering") };
    case "starting":
      return { label: t("starting"), tone: "neutral", detail: t("starting") };
    case "playback_blocked":
      return { label: t("permissionNeeded"), tone: "warning", detail: t("permissionNeeded") };
    case "error":
      return { label: t("issue"), tone: "danger", detail: t("issue") };
    case "paused":
      return { label: t("paused"), tone: "warning", detail: t("paused") };
    case "ended":
      return { label: t("ended"), tone: "warning", detail: t("ended") };
    case "room_idle":
      return { label: t("idle"), tone: "neutral", detail: t("idle") };
    case "stopped":
      return { label: t("stopped"), tone: "neutral", detail: t("stopped") };
    default:
      return { label: t("connecting"), tone: "neutral", detail: t("connecting") };
  }
}

/** Convenience wrapper to format dates in the user's active locale. */
export function formatLocaleDate(value: string | Date, locale: Locale): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(getNumberLocale(locale), { dateStyle: "medium" }).format(date);
}
