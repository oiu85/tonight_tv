"use client";

import {
  AlertTriangle,
  Captions,
  CheckCircle2,
  Expand,
  FastForward,
  Film,
  Loader2,
  Maximize,
  Pause,
  PictureInPicture,
  Play,
  RotateCcw,
  Users as UsersIcon,
  Volume2,
  VolumeX,
  Wifi,
} from "lucide-react";
import { type RefObject, useState } from "react";

import type { MediaRuntimeError } from "@/lib/media/media-source";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
import type { RoomSyncStatus } from "@/lib/sync/room-sync-coordinator";
import { Button, IconButton, ProgressMeter, StatusBadge } from "../ui/primitives";

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
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function mediaErrorCopy(error: MediaRuntimeError): { title: string; body: string } {
  switch (error.category) {
    case "autoplay_permission_blocked":
      return { title: "Playback needs your permission.", body: "Press start watching to join live." };
    case "authenticated_source_unsupported":
      return {
        title: "This source requires browser credentials or origin access that Tonight TV cannot use.",
        body: "Use a direct, public media URL.",
      };
    case "expired_url_suspected":
      return { title: "This media URL may have expired.", body: "Ask the room owner to update the source." };
    case "encrypted_drm_source_unsupported":
      return { title: "Encrypted or DRM-protected sources are not supported.", body: "Replace the source with a direct, unencrypted URL." };
    case "unsupported_codec_container":
      return {
        title: "This media format or codec cannot be played on this device.",
        body: "Try a different file or container.",
      };
    case "cors_referrer_origin_blocked":
      return { title: "This media host does not allow playback from Tonight TV.", body: "Use a host that permits Tonight TV as a referrer." };
    case "network_source_unreachable":
      return { title: "The media source could not be reached.", body: "Check the source URL or your network." };
    case "hls_manifest_error":
      return { title: "The HLS manifest could not be loaded.", body: "Replace the source with a working HLS URL." };
    case "hls_media_error":
      return { title: "The HLS stream reported a media error.", body: "Try a different stream or replace the source." };
    default:
      return {
        title: "This media source could not be played on this device.",
        body: "Replace the source or retry.",
      };
  }
}

function syncStatusCopy(
  status: RoomSyncStatus,
  behindSeconds: number,
  playback: RoomSnapshot["playback"]["status"],
): { label: string; tone: "live" | "warning" | "danger" | "neutral"; detail: string } {
  if (playback === "ended") {
    return { label: "Ended", tone: "warning", detail: "Waiting for the next program" };
  }
  if (playback === "paused") {
    return { label: "Paused", tone: "warning", detail: "Paused by admin" };
  }
  if (playback === "idle") {
    return { label: "Ready", tone: "neutral", detail: "No program is selected yet" };
  }
  switch (status) {
    case "live":
      if (behindSeconds < 2) return { label: "LIVE", tone: "live", detail: "Synced with the room" };
      return { label: `${Math.round(behindSeconds)}s behind live`, tone: "warning", detail: "Use GO LIVE to catch up" };
    case "synchronizing":
      return { label: "Catching up", tone: "warning", detail: "Catching up to live…" };
    case "buffering":
      return { label: "Buffering", tone: "warning", detail: "Room is still live" };
    case "starting":
      return { label: "Starting", tone: "neutral", detail: "Loading media" };
    case "playback_blocked":
      return { label: "Permission needed", tone: "warning", detail: "Start watching to join live" };
    case "error":
      return { label: "Connection issue", tone: "danger", detail: "Room synchronization needs attention" };
    case "paused":
      return { label: "Paused", tone: "warning", detail: "Paused by admin" };
    case "ended":
      return { label: "Ended", tone: "warning", detail: "Waiting for the next program" };
    case "room_idle":
      return { label: "Idle", tone: "neutral", detail: "No program is selected yet" };
    case "stopped":
      return { label: "Stopped", tone: "neutral", detail: "The room is closing" };
    default:
      return { label: "Connecting", tone: "neutral", detail: "Preparing the room" };
  }
}

export function VideoStage({
  videoRef,
  snapshot,
  status,
  mediaError,
  onStartWatching,
  onRetry,
  onAddMedia,
  onReconnect,
  reason,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  snapshot: RoomSnapshot;
  status: RoomSyncStatus;
  mediaError: MediaRuntimeError | null;
  onStartWatching: () => void;
  onRetry: () => void;
  onAddMedia?: () => void;
  onReconnect: () => void;
  reason?: string | null;
}) {
  const owner = snapshot.caller.is_owner;
  const playback = snapshot.playback;
  const empty = playback.status === "idle" || !snapshot.current_media;
  const blocked = status === "playback_blocked" || mediaError?.category === "autoplay_permission_blocked";
  const showBuffering = status === "buffering" && !mediaError;
  const showLoading = (status === "starting" || status === "synchronizing") && !empty;
  const showReconnect = !empty && (status === "synchronizing" && reason === "visibility_resume");
  const ended = playback.status === "ended";
  const fatalMediaError = mediaError && !blocked;

  return (
    <section className="tt-video-stage" aria-label="Tonight TV video player" aria-describedby="player-status">
      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        aria-label={snapshot.current_media?.title ?? "Room video"}
      />
      <span className="tt-video-label" aria-hidden="true">
        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 50, background: "currentColor", marginRight: 6, verticalAlign: "middle" }} />
        Private Room
      </span>
      <span id="player-status" className="tt-visually-hidden">
        Player is {status}.
      </span>

      {empty ? (
        <div className="tt-player-overlay">
          <div className="tt-player-overlay-inner">
            <Film size={32} aria-hidden />
            <h2>{owner ? "Nothing is playing yet." : "Waiting for the room owner to start something…"}</h2>
            {owner ? (
              <>
                <p>Add a direct MP4 or HLS source to start the room.</p>
                {onAddMedia ? (
                  <Button variant="primary" onClick={onAddMedia}>
                    Add Media
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {!empty && showLoading ? (
        <div className="tt-player-overlay">
          <div className="tt-player-overlay-inner">
            <Loader2 size={32} aria-hidden style={{ animation: "tt-spin 1s linear infinite" }} />
            <h2>{status === "starting" ? "Loading media…" : "Joining live…"}</h2>
          </div>
        </div>
      ) : null}

      {!empty && showReconnect ? (
        <div className="tt-player-overlay" role="status">
          <div className="tt-player-overlay-inner">
            <Wifi size={28} aria-hidden />
            <h2>Rejoining live…</h2>
            <p>Your connection took a break. The room is still live.</p>
            <Button onClick={onReconnect}>Retry</Button>
          </div>
        </div>
      ) : null}

      {!empty && showBuffering ? (
        <div className="tt-player-overlay" role="status">
          <div className="tt-player-overlay-inner">
            <Loader2 size={32} aria-hidden style={{ animation: "tt-spin 1s linear infinite" }} />
            <h2>Buffering…</h2>
            <p>Room is still live.</p>
          </div>
        </div>
      ) : null}

      {!empty && blocked ? (
        <div className="tt-player-overlay">
          <div className="tt-player-overlay-inner">
            <Play size={32} aria-hidden />
            <h2>Playback needs your permission.</h2>
            <p>The room is live. Press start watching to join the moment.</p>
            <Button variant="primary" onClick={onStartWatching}>
              <Play size={18} aria-hidden />
              <span className="tt-button-label">START WATCHING</span>
            </Button>
          </div>
        </div>
      ) : null}

      {!empty && fatalMediaError ? (
        <div className="tt-player-overlay" role="alert">
          <div className="tt-player-overlay-inner">
            <AlertTriangle size={30} aria-hidden />
            <h2>{mediaErrorCopy(mediaError).title}</h2>
            <p>{mediaErrorCopy(mediaError).body}</p>
            <p className="tt-muted" style={{ fontSize: 12 }}>
              {owner ? "Replace the source if retrying does not help." : "The room is still live. The owner may need to update the source."}
            </p>
            <div className="tt-form-actions">
              <Button onClick={onRetry}>Retry</Button>
              {owner && onAddMedia ? (
                <Button variant="primary" onClick={onAddMedia}>
                  Replace source
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {!empty && ended ? (
        <div className="tt-player-overlay" role="status">
          <div className="tt-player-overlay-inner">
            <CheckCircle2 size={30} aria-hidden />
            <h2>Program ended.</h2>
            <p>{owner ? "Restart or choose the next program." : "Waiting for the next program…"}</p>
            {owner ? (
              <p className="tt-muted" style={{ fontSize: 12 }}>Use the controls below to restart or play the next item.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function NowPlaying({
  snapshot,
  status,
  currentTime,
  duration,
  behindSeconds,
}: {
  snapshot: RoomSnapshot;
  status: RoomSyncStatus;
  currentTime: number;
  duration: number | null;
  behindSeconds: number;
}) {
  const playback = snapshot.playback;
  const sync = syncStatusCopy(status, behindSeconds, playback.status);
  const showTime = playback.status !== "idle";
  return (
    <section className="tt-now-playing" aria-labelledby="now-playing-title">
      <div className="tt-now-playing-copy">
        <p className="tt-kicker">Now Playing</p>
        <h1 id="now-playing-title" className="tt-media-title">
          {snapshot.current_media?.title ?? "No program selected"}
        </h1>
        {showTime ? (
          <span className="tt-time tt-num" aria-label="Playback position">
            {formatPlaybackTime(currentTime)}
            {duration !== null ? (
              <>
                <span className="tt-muted" style={{ margin: "0 6px" }}>/</span>
                <span className="tt-muted">{formatPlaybackTime(duration)}</span>
              </>
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="tt-sync-copy" aria-live="polite" aria-atomic="true">
        <StatusBadge tone={sync.tone}>
          {sync.label}
        </StatusBadge>
        <span className="tt-muted">{sync.detail}</span>
      </div>
    </section>
  );
}

function LocalControls({
  muted,
  volume,
  subtitles,
  selectedSubtitleId,
  onMutedChange,
  onVolumeChange,
  onSubtitleChange,
  onPictureInPicture,
  onFullscreen,
  pipAvailable,
  fullscreenAvailable,
}: {
  muted: boolean;
  volume: number;
  subtitles: RoomSnapshot["subtitles"];
  selectedSubtitleId: string | null;
  onMutedChange: () => void;
  onVolumeChange: (volume: number) => void;
  onSubtitleChange: (id: string | null) => void;
  onPictureInPicture: () => void;
  onFullscreen: () => void;
  pipAvailable: boolean;
  fullscreenAvailable: boolean;
}) {
  return (
    <div className="tt-control-row tt-control-row-secondary">
      <div className="tt-volume-control">
        <IconButton variant="ghost" label={muted ? "Unmute" : "Mute"} onClick={onMutedChange}>
          {muted ? <VolumeX size={19} aria-hidden /> : <Volume2 size={19} aria-hidden />}
        </IconButton>
        <input
          aria-label="Volume"
          className="tt-range tt-num"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
        />
      </div>
      <label className="tt-button tt-button-ghost tt-button-sm">
        <Captions size={18} aria-hidden />
        <span className="tt-button-label">Subtitles</span>
        <select
          aria-label="Subtitle track"
          className="tt-select"
          style={{ minHeight: 32, width: 110, padding: "4px 7px" }}
          value={selectedSubtitleId ?? ""}
          onChange={(event) => onSubtitleChange(event.target.value || null)}
        >
          <option value="">Off</option>
          {subtitles.map((track) => (
            <option key={track.id} value={track.id}>
              {track.label}
            </option>
          ))}
        </select>
      </label>
      <span className="tt-control-spacer" />
      <IconButton
        variant="ghost"
        label="Picture in Picture"
        onClick={onPictureInPicture}
        disabled={!pipAvailable}
      >
        <PictureInPicture size={19} aria-hidden />
      </IconButton>
      <IconButton
        variant="ghost"
        label="Fullscreen"
        onClick={onFullscreen}
        disabled={!fullscreenAvailable}
      >
        <Maximize size={19} aria-hidden />
      </IconButton>
    </div>
  );
}

type LocalProps = Parameters<typeof LocalControls>[0];

export function ViewerControls(props: LocalProps & { status: RoomSyncStatus; behindSeconds: number; onGoLive: () => void }) {
  const live = props.status === "live" && props.behindSeconds < 2;
  const offline = props.status === "error" || props.status === "stopped";
  return (
    <section className="tt-controls" aria-label="Viewer controls">
      <div className="tt-control-heading">
        <div>
          <p className="tt-kicker">Local Controls</p>
          <span className="tt-secondary">These controls affect only this device.</span>
        </div>
        <Button variant={live ? "ghost" : "primary"} disabled={live || offline} onClick={props.onGoLive}>
          <Expand size={18} aria-hidden />
          <span className="tt-button-label">{live ? "In sync" : "GO LIVE"}</span>
        </Button>
      </div>
      <LocalControls {...props} />
    </section>
  );
}

export function AdminControls(
  props: LocalProps & {
    status: RoomSyncStatus;
    playbackStatus: RoomSnapshot["playback"]["status"];
    currentTime: number;
    duration: number | null;
    pending: boolean;
    onPlayPause: () => void;
    onRestart: () => void;
    onNext: () => void;
    onSeek: (seconds: number) => void;
    onAddMedia: () => void;
    onManageSubtitles: () => void;
  },
) {
  const [draft, setDraft] = useState<number | null>(null);
  const timelineValue = draft ?? props.currentTime;
  const max = props.duration && props.duration > 0 ? props.duration : Math.max(props.currentTime + 1, 1);
  const idle = props.playbackStatus === "idle";
  const ended = props.playbackStatus === "ended";

  function commitSeek() {
    if (draft === null) return;
    props.onSeek(draft);
    setDraft(null);
  }

  return (
    <section className="tt-controls" aria-label="Administrator playback controls">
      <div className="tt-control-heading">
        <div>
          <p className="tt-kicker">Admin Controls</p>
          <span className="tt-secondary">Shared playback for everyone in the room.</span>
        </div>
        <span className="tt-inline-cluster" style={{ gap: 6 }}>
          <UsersIcon size={14} aria-hidden style={{ color: "var(--tt-warning)" }} />
          <span className="tt-warning-text" style={{ fontSize: 12, fontWeight: 700 }}>Room owner</span>
        </span>
      </div>
      <div className="tt-control-row">
        <Button onClick={props.onRestart} disabled={props.pending || idle} aria-label="Restart program">
          <RotateCcw size={18} aria-hidden />
          <span className="tt-button-label">Restart</span>
        </Button>
        <Button
          variant="primary"
          onClick={props.onPlayPause}
          disabled={props.pending || idle || ended}
          aria-label={props.playbackStatus === "playing" ? "Pause for everyone" : "Play for everyone"}
        >
          {props.playbackStatus === "playing" ? <Pause size={19} aria-hidden /> : <Play size={19} aria-hidden />}
          <span className="tt-button-label">{props.playbackStatus === "playing" ? "Pause" : "Play"}</span>
        </Button>
        <Button onClick={props.onNext} disabled={props.pending} aria-label="Play next program">
          <FastForward size={18} aria-hidden />
          <span className="tt-button-label">Play Next</span>
        </Button>
        <Button variant="ghost" onClick={props.onAddMedia} aria-label="Add media to queue">
          <Film size={18} aria-hidden />
          <span className="tt-button-label">Add Media</span>
        </Button>
        <Button variant="ghost" onClick={props.onManageSubtitles} aria-label="Manage subtitles">
          <Captions size={18} aria-hidden />
          <span className="tt-button-label">Subtitles</span>
        </Button>
      </div>
      {!idle ? (
        <div className="tt-timeline">
          <time className="tt-num" aria-label="Current position">
            {formatPlaybackTime(timelineValue)}
          </time>
          <input
            className="tt-range"
            aria-label="Shared room timeline"
            type="range"
            min={0}
            max={max}
            step={0.1}
            value={Math.min(timelineValue, max)}
            onChange={(event) => setDraft(Number(event.target.value))}
            onPointerUp={commitSeek}
            onPointerCancel={() => setDraft(null)}
            onBlur={() => setDraft(null)}
            onKeyUp={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
                commitSeek();
              }
            }}
          />
          <time className="tt-num" aria-label="Duration">
            {props.duration !== null ? formatPlaybackTime(props.duration) : "--:--"}
          </time>
        </div>
      ) : null}
      {props.status === "buffering" ? (
        <ProgressMeter value={1} max={1} tone="warning" label="Buffering" />
      ) : null}
      <LocalControls {...props} />
    </section>
  );
}
