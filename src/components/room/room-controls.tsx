"use client";

import {
  AlertTriangle,
  Captions,
  CheckCircle2,
  Clock3,
  Cog,
  Film,
  Loader2,
  Maximize,
  Pause,
  PictureInPicture,
  Play,
  Plus,
  RadioTower,
  RotateCcw,
  SkipForward,
  Volume2,
  VolumeX,
  Wifi,
} from "lucide-react";
import { type RefObject, useState, type CSSProperties } from "react";

import type { MediaRuntimeError } from "@/lib/media/media-source";
import { posterForTitle } from "@/lib/room/posters";
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
      return {
        title: "Playback needs your permission.",
        body: "Press start watching to join live.",
      };
    case "authenticated_source_unsupported":
      return {
        title: "This source requires browser credentials that Tonight TV cannot use.",
        body: "Use a direct, public media URL.",
      };
    case "expired_url_suspected":
      return { title: "This media URL may have expired.", body: "Ask the owner to update the source." };
    case "encrypted_drm_source_unsupported":
      return {
        title: "Encrypted or DRM-protected sources are not supported.",
        body: "Replace the source with a direct, unencrypted URL.",
      };
    case "unsupported_codec_container":
      return {
        title: "This media format or codec cannot be played on this device.",
        body: "Try a different file or container.",
      };
    case "cors_referrer_origin_blocked":
      return {
        title: "This media host does not allow playback from Tonight TV.",
        body: "Use a host that permits Tonight TV as a referrer.",
      };
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

/**
 * Local-only video transport overlay. Mimics a native control strip without
 * using the platform's `<video controls>` so we keep one and only one
 * shared seek timeline inside `AdminControls`.
 */
export function LocalVideoTransport({
  playing,
  currentTime,
  duration,
  onPlayPause,
  onMuteToggle,
  muted,
  onCaptionsToggle,
  captionsActive,
  onPipToggle,
  onFullscreenToggle,
  pipAvailable,
  fullscreenAvailable,
}: {
  playing: boolean;
  currentTime: number;
  duration: number | null;
  onPlayPause: () => void;
  onMuteToggle: () => void;
  muted: boolean;
  onCaptionsToggle: () => void;
  captionsActive: boolean;
  onPipToggle: () => void;
  onFullscreenToggle: () => void;
  pipAvailable: boolean;
  fullscreenAvailable: boolean;
}) {
  return (
    <div
      className="tt-video-transport"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "k") {
          event.preventDefault();
          onPlayPause();
        }
        if (event.key === "m") {
          event.preventDefault();
          onMuteToggle();
        }
        if (event.key === "f" && fullscreenAvailable) {
          event.preventDefault();
          onFullscreenToggle();
        }
      }}
      role="toolbar"
      aria-label="Local video transport"
    >
      <IconButton
        variant="ghost"
        size="sm"
        className="tt-transport-button"
        label={playing ? "Pause" : "Play"}
        onClick={onPlayPause}
      >
        {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
      </IconButton>
      <span className="tt-transport-time">
        {formatPlaybackTime(currentTime)} / {duration !== null ? formatPlaybackTime(duration) : "--:--"}
      </span>
      <IconButton
        variant="ghost"
        size="sm"
        className="tt-transport-button"
        label={muted ? "Unmute" : "Mute"}
        onClick={onMuteToggle}
      >
        {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
      </IconButton>
      <IconButton
        variant="ghost"
        size="sm"
        className="tt-transport-button"
        label={captionsActive ? "Hide captions" : "Show captions"}
        onClick={onCaptionsToggle}
      >
        <Captions size={16} aria-hidden />
      </IconButton>
      <IconButton
        variant="ghost"
        size="sm"
        className="tt-transport-button"
        label="Picture in Picture"
        onClick={onPipToggle}
        disabled={!pipAvailable}
      >
        <PictureInPicture size={16} aria-hidden />
      </IconButton>
      <IconButton
        variant="ghost"
        size="sm"
        className="tt-transport-button"
        label="Fullscreen"
        onClick={onFullscreenToggle}
        disabled={!fullscreenAvailable}
      >
        <Maximize size={16} aria-hidden />
      </IconButton>
    </div>
  );
}

export function VideoStage({
  videoRef,
  snapshot,
  status,
  mediaError,
  reason,
  ownerPlaying,
  currentTime,
  duration,
  onStartWatching,
  onRetry,
  onAddMedia,
  onReconnect,
  onPlayPause,
  onMuteToggle,
  muted,
  onCaptionsToggle,
  captionsActive,
  onPipToggle,
  onFullscreenToggle,
  pipAvailable,
  fullscreenAvailable,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  snapshot: RoomSnapshot;
  status: RoomSyncStatus;
  mediaError: MediaRuntimeError | null;
  reason: string | null;
  ownerPlaying: boolean;
  currentTime: number;
  duration: number | null;
  onStartWatching: () => void;
  onRetry: () => void;
  onAddMedia?: () => void;
  onReconnect: () => void;
  onPlayPause: () => void;
  onMuteToggle: () => void;
  muted: boolean;
  onCaptionsToggle: () => void;
  captionsActive: boolean;
  onPipToggle: () => void;
  onFullscreenToggle: () => void;
  pipAvailable: boolean;
  fullscreenAvailable: boolean;
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
  const showTransport = !empty && !blocked && !ended && !fatalMediaError;
  const heroUrl = posterForTitle(snapshot.current_media?.title).hero;
  const heroStyle = { ["--tt-hero-url" as string]: `url(${heroUrl})` } as CSSProperties;

  return (
    <section
      className="tt-video-stage"
      aria-label="Tonight TV video player"
      aria-describedby="player-status"
    >
      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        aria-label={snapshot.current_media?.title ?? "Room video"}
        onClick={onPlayPause}
      />
      <span className="tt-video-label" aria-hidden="true">
        <span className="tt-video-label-dot" />
        Private Room
      </span>
      <span id="player-status" className="tt-visually-hidden">
        Player is {status}.
      </span>

      {empty ? (
        <div className="tt-player-overlay tt-player-overlay--hero" style={heroStyle}>
          <div className="tt-player-overlay-inner">
            <Film size={36} aria-hidden style={{ color: "var(--tt-accent)" }} />
            <h2>{owner ? "Nothing is playing yet." : "Waiting for the room owner to start something…"}</h2>
            {owner ? (
              <>
                <p>Add a direct MP4 or HLS source to start the room.</p>
                {onAddMedia ? (
                  <div className="tt-player-overlay-actions">
                    <Button variant="primary" onClick={onAddMedia}>
                      <Plus size={18} aria-hidden />
                      <span className="tt-button-label">Add Media</span>
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {!empty && showLoading ? (
        <div className="tt-player-overlay">
          <div className="tt-player-overlay-inner">
            <Loader2
              size={36}
              aria-hidden
              style={{ color: "var(--tt-accent)", animation: "tt-spin 1s linear infinite" }}
            />
            <h2>{status === "starting" ? "Loading media…" : "Joining live…"}</h2>
          </div>
        </div>
      ) : null}

      {!empty && showReconnect ? (
        <div className="tt-player-overlay" role="status">
          <div className="tt-player-overlay-inner">
            <Wifi size={28} aria-hidden style={{ color: "var(--tt-accent)" }} />
            <h2>Rejoining live…</h2>
            <p>Your connection took a break. The room is still live.</p>
            <div className="tt-player-overlay-actions">
              <Button onClick={onReconnect}>Retry</Button>
            </div>
          </div>
        </div>
      ) : null}

      {!empty && showBuffering ? (
        <div className="tt-player-overlay" role="status">
          <div className="tt-player-overlay-inner">
            <Loader2
              size={36}
              aria-hidden
              style={{ color: "var(--tt-accent)", animation: "tt-spin 1s linear infinite" }}
            />
            <h2>Buffering…</h2>
            <p>Room is still live.</p>
          </div>
        </div>
      ) : null}

      {!empty && blocked ? (
        <div className="tt-player-overlay">
          <div className="tt-player-overlay-inner">
            <Play size={36} aria-hidden style={{ color: "var(--tt-accent)" }} />
            <h2>Playback needs your permission.</h2>
            <p>The room is live. Press start watching to join the moment.</p>
            <div className="tt-player-overlay-actions">
              <Button variant="primary" onClick={onStartWatching}>
                <Play size={18} aria-hidden />
                <span className="tt-button-label">START WATCHING</span>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {!empty && fatalMediaError ? (
        <div className="tt-player-overlay" role="alert">
          <div className="tt-player-overlay-inner">
            <AlertTriangle size={32} aria-hidden style={{ color: "var(--tt-danger)" }} />
            <h2>{mediaErrorCopy(mediaError).title}</h2>
            <p>{mediaErrorCopy(mediaError).body}</p>
            <p className="tt-muted" style={{ fontSize: 12 }}>
              {owner
                ? "Replace the source if retrying does not help."
                : "The room is still live. The owner may need to update the source."}
            </p>
            <div className="tt-player-overlay-actions">
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
            <CheckCircle2 size={32} aria-hidden style={{ color: "var(--tt-warning)" }} />
            <h2>Program ended.</h2>
            <p>{owner ? "Restart or choose the next program." : "Waiting for the next program…"}</p>
            {owner ? (
              <p className="tt-muted" style={{ fontSize: 12 }}>Use the controls below.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {showTransport ? (
        <LocalVideoTransport
          playing={ownerPlaying}
          currentTime={currentTime}
          duration={duration}
          onPlayPause={onPlayPause}
          onMuteToggle={onMuteToggle}
          muted={muted}
          onCaptionsToggle={onCaptionsToggle}
          captionsActive={captionsActive}
          onPipToggle={onPipToggle}
          onFullscreenToggle={onFullscreenToggle}
          pipAvailable={pipAvailable}
          fullscreenAvailable={fullscreenAvailable}
        />
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
  isOwner,
}: {
  snapshot: RoomSnapshot;
  status: RoomSyncStatus;
  currentTime: number;
  duration: number | null;
  behindSeconds: number;
  isOwner: boolean;
}) {
  const playback = snapshot.playback;
  const sync = syncStatusCopy(status, behindSeconds, playback.status);
  const showTime = playback.status !== "idle";
  const behind = behindSeconds >= 2;
  const { poster: posterSrc } = posterForTitle(snapshot.current_media?.title);
  return (
    <section className="tt-now-playing" aria-labelledby="now-playing-title">
      <div className="tt-now-playing-poster" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- static demo asset */}
        <img
          src={posterSrc}
          alt=""
          className="tt-now-playing-poster-img"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="tt-now-playing-copy">
        <p className="tt-kicker">Now Playing</p>
        <h1 id="now-playing-title" className="tt-media-title">
          {snapshot.current_media?.title ?? "No program selected"}
        </h1>
        <div className="tt-now-playing-meta">
          <span className="tt-status tt-status-pill tt-status-live">
            <span>{isOwner ? "Live" : "Synced"}</span>
          </span>
          {isOwner ? (
            <span style={{ color: "var(--tt-text-muted)" }}>
              <RadioTower size={11} aria-hidden style={{ marginRight: 4, verticalAlign: 0 }} /> Started by{" "}
              {snapshot.room.name}
            </span>
          ) : null}
          {behind ? (
            <span style={{ color: "var(--tt-warning)" }}>
              <Clock3 size={11} aria-hidden style={{ marginRight: 4, verticalAlign: 0 }} />
              Behind live by {Math.round(behindSeconds)}s
            </span>
          ) : null}
        </div>
      </div>
      <div className="tt-now-playing-side" aria-live="polite" aria-atomic="true">
        <StatusBadge tone={sync.tone}>{sync.label}</StatusBadge>
        <span className="tt-muted" style={{ fontSize: 12 }}>{sync.detail}</span>
        {showTime ? (
          <span className="tt-now-playing-time tt-num" aria-label="Playback position">
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
    </section>
  );
}

type LocalProps = {
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
};

function LocalControls(props: LocalProps) {
  return (
    <div className="tt-control-row tt-control-row-secondary">
      <div className="tt-volume-control" aria-label="Volume">
        <IconButton variant="ghost" label={props.muted ? "Unmute" : "Mute"} onClick={props.onMutedChange}>
          {props.muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
        </IconButton>
        <input
          aria-label="Volume"
          className="tt-range tt-num"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={props.muted ? 0 : props.volume}
          onChange={(event) => props.onVolumeChange(Number(event.target.value))}
        />
        <span className="tt-volume-value">{Math.round((props.muted ? 0 : props.volume) * 100)}%</span>
      </div>
      <label className="tt-local-control">
        <Captions size={16} aria-hidden />
        <span className="tt-button-label">Subtitles</span>
        <select
          aria-label="Subtitle track"
          className="tt-select"
          style={{ minHeight: 30, width: 120, padding: "4px 8px", fontSize: 13, background: "transparent", border: "none", color: "var(--tt-text-primary)" }}
          value={props.selectedSubtitleId ?? ""}
          onChange={(event) => props.onSubtitleChange(event.target.value || null)}
        >
          <option value="">Off</option>
          {props.subtitles.map((track) => (
            <option key={track.id} value={track.id}>
              {track.label}
            </option>
          ))}
        </select>
      </label>
      <IconButton
        variant="ghost"
        className="tt-local-control"
        label="Picture in Picture"
        onClick={props.onPictureInPicture}
        disabled={!props.pipAvailable}
      >
        <PictureInPicture size={16} aria-hidden />
        <span className="tt-button-label">PiP</span>
      </IconButton>
      <IconButton
        variant="ghost"
        className="tt-local-control"
        label="Fullscreen"
        onClick={props.onFullscreen}
        disabled={!props.fullscreenAvailable}
      >
        <Maximize size={16} aria-hidden />
        <span className="tt-button-label">Fullscreen</span>
      </IconButton>
    </div>
  );
}

export function ViewerControls(
  props: LocalProps & { status: RoomSyncStatus; behindSeconds: number; onGoLive: () => void },
) {
  const live = props.status === "live" && props.behindSeconds < 2;
  const offline = props.status === "error" || props.status === "stopped";
  return (
    <section className="tt-controls" aria-label="Viewer controls">
      <div className="tt-controls-head">
        <div>
          <p className="tt-kicker">Your controls</p>
          <h3>Viewer controls</h3>
        </div>
        <Button
          variant={live ? "soft" : "primary"}
          disabled={live || offline}
          onClick={props.onGoLive}
        >
          <span className="tt-button-label">{live ? "In sync" : "GO LIVE"}</span>
        </Button>
      </div>
      <p className="tt-secondary" style={{ fontSize: 12, margin: 0 }}>
        These are local controls only and do not affect other viewers.
      </p>
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

  const playing = props.playbackStatus === "playing";

  return (
    <section className="tt-controls" aria-label="Administrator playback controls">
      <div className="tt-controls-head">
        <div>
          <p className="tt-kicker">Admin Controls</p>
          <h3>Shared playback</h3>
        </div>
        <span className="tt-status tt-status-pill tt-status-warning">
          <span>Room owner</span>
        </span>
      </div>
      <p className="tt-secondary" style={{ fontSize: 12, margin: 0 }}>
        <Cog size={11} aria-hidden style={{ marginRight: 4, verticalAlign: 0 }} />
        All changes affect everyone in the room.
      </p>
      <div className="tt-control-row">
        <button
          type="button"
          className="tt-control-large-button"
          onClick={props.onRestart}
          disabled={props.pending || idle}
          aria-label="Restart program"
        >
          <RotateCcw size={18} aria-hidden />
          <span>Restart</span>
        </button>
        <button
          type="button"
          className={`tt-control-large-button ${playing ? "tt-control-primary" : ""}`}
          onClick={props.onPlayPause}
          disabled={props.pending || idle || ended}
          aria-label={playing ? "Pause for everyone" : "Play for everyone"}
          aria-pressed={playing}
        >
          {playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
          <span>{playing ? "Pause" : "Play"}</span>
        </button>
        <button
          type="button"
          className="tt-control-large-button"
          onClick={props.onNext}
          disabled={props.pending}
          aria-label="Play next program"
        >
          <SkipForward size={18} aria-hidden />
          <span>Play Next</span>
        </button>
        <button
          type="button"
          className="tt-control-large-button"
          onClick={props.onAddMedia}
          aria-label="Add media to queue"
        >
          <Film size={18} aria-hidden />
          <span>Add Media</span>
        </button>
        <button
          type="button"
          className="tt-control-large-button"
          onClick={props.onManageSubtitles}
          aria-label="Manage subtitles"
        >
          <Captions size={18} aria-hidden />
          <span>Subtitles</span>
        </button>
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
      {props.status === "buffering" ? <ProgressMeter value={1} max={1} tone="warning" label="Buffering" /> : null}
      <p className="tt-secondary" style={{ fontSize: 12, margin: 0 }}>
        These are local controls and will not affect others.
      </p>
      <LocalControls {...props} />
    </section>
  );
}
