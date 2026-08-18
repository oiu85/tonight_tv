"use client";

import {
  AlertTriangle,
  Captions,
  CheckCircle2,
  Film,
  Loader2,
  Maximize,
  Pause,
  PictureInPicture,
  Play,
  Plus,
  RadioTower,
  Volume2,
  VolumeX,
  Wifi,
} from "lucide-react";
import { memo, type CSSProperties, type RefObject } from "react";

import { Button, IconButton } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import type { MediaRuntimeError } from "@/lib/media/media-source";
import type { LocalP2pState } from "@/lib/p2p/local-p2p-contracts";
import { posterForTitle } from "@/lib/room/posters";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
import type { RoomSyncStatus } from "@/lib/sync/room-sync-coordinator";
import { mediaErrorCopy } from "./playback-helpers";

export const LocalVideoTransport = memo(function LocalVideoTransport({
  currentTime,
  duration,
  onMuteToggle,
  muted,
  onCaptionsToggle,
  captionsActive,
  captionsAvailable,
  onPipToggle,
  onFullscreenToggle,
  pipAvailable,
  fullscreenAvailable,
}: {
  currentTime: number;
  duration: number | null;
  onMuteToggle: () => void;
  muted: boolean;
  onCaptionsToggle: () => void;
  captionsActive: boolean;
  captionsAvailable: boolean;
  onPipToggle: () => void;
  onFullscreenToggle: () => void;
  pipAvailable: boolean;
  fullscreenAvailable: boolean;
}) {
  const t = useTranslations("room.transport");
  return (
    <div
      className="tt-video-transport"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
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
      aria-label={t("transportAria")}
    >
      <span className="tt-transport-time tt-num">
        {formatTransportTime(currentTime)} / {duration !== null ? formatTransportTime(duration) : "--:--"}
      </span>
      <IconButton
        variant="ghost"
        size="sm"
        className="tt-transport-button"
        label={muted ? t("unmute") : t("mute")}
        onClick={onMuteToggle}
      >
        {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
      </IconButton>
      <IconButton
        variant="ghost"
        size="sm"
        className="tt-transport-button"
        label={captionsActive ? t("hideCaptions") : t("captions")}
        onClick={onCaptionsToggle}
        disabled={!captionsAvailable}
      >
        <Captions size={16} aria-hidden />
      </IconButton>
      <IconButton
        variant="ghost"
        size="sm"
        className="tt-transport-button"
        label={t("pip")}
        onClick={onPipToggle}
        disabled={!pipAvailable}
      >
        <PictureInPicture size={16} aria-hidden />
      </IconButton>
      <IconButton
        variant="ghost"
        size="sm"
        className="tt-transport-button"
        label={t("fullscreen")}
        onClick={onFullscreenToggle}
        disabled={!fullscreenAvailable}
      >
        <Maximize size={16} aria-hidden />
      </IconButton>
    </div>
  );
});

function formatTransportTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remaining = whole % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

export const VideoStage = memo(function VideoStage({
  stageRef,
  videoRef,
  youtubeMountRef,
  webtorMountRef,
  snapshot,
  status,
  mediaError,
  localP2pState,
  reason,
  currentTime,
  duration,
  onStartWatching,
  onRetry,
  onAddMedia,
  onReconnect,
  onReselectLocalFile,
  onMuteToggle,
  muted,
  onCaptionsToggle,
  captionsActive,
  captionsAvailable,
  onPipToggle,
  onFullscreenToggle,
  pipAvailable,
  fullscreenAvailable,
}: {
  stageRef: RefObject<HTMLElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  youtubeMountRef: RefObject<HTMLDivElement | null>;
  webtorMountRef?: RefObject<HTMLDivElement | null>;
  snapshot: RoomSnapshot;
  status: RoomSyncStatus;
  mediaError: MediaRuntimeError | null;
  localP2pState: LocalP2pState;
  reason: string | null;
  currentTime: number;
  duration: number | null;
  onStartWatching: () => void;
  onRetry: () => void;
  onAddMedia?: () => void;
  onReconnect: () => void;
  onReselectLocalFile?: () => void;
  onMuteToggle: () => void;
  muted: boolean;
  onCaptionsToggle: () => void;
  captionsActive: boolean;
  captionsAvailable: boolean;
  onPipToggle: () => void;
  onFullscreenToggle: () => void;
  pipAvailable: boolean;
  fullscreenAvailable: boolean;
}) {
  const t = useTranslations("room.video");
  const tErrors = useTranslations("room.errors");
  const tCommon = useTranslations("common");
  const owner = snapshot.caller.is_owner;
  const youtubeActive = snapshot.current_media?.source_type === "youtube";
  const localP2pActive = snapshot.current_media?.source_type === "local_p2p";
  const playback = snapshot.playback;
  const empty = playback.status === "idle" || !snapshot.current_media;
  const blocked = status === "playback_blocked" || mediaError?.category === "autoplay_permission_blocked";
  const showReconnect =
    !empty &&
    status === "synchronizing" &&
    (reason === "visibility_resume" || reason === "realtime_reconnected");
  const showLoading =
    !empty &&
    !showReconnect &&
    (status === "starting" || status === "aligning" || status === "seeking" || status === "synchronizing");
  const showCatchingUp = status === "catching_up" && !mediaError;
  const showBuffering = status === "buffering" && !mediaError;
  const ended = playback.status === "ended";
  const paused = playback.status === "paused";
  const fatalMediaError = mediaError !== null && mediaError.fatal && !blocked ? mediaError : null;
  const waitingForPeers = localP2pActive && localP2pState.status === "no_peers" && !fatalMediaError;
  const connectingP2p = localP2pActive && (localP2pState.status === "connecting" || localP2pState.status === "preparing" || localP2pState.status === "hashing");
  const showTransport = !empty && !blocked && !ended && !fatalMediaError;
  const heroUrl = posterForTitle(snapshot.current_media?.title).hero;
  const heroStyle = { ["--tt-hero-url" as string]: `url(${heroUrl})` } as CSSProperties;

  return (
    <section
      ref={stageRef}
      className="tt-video-stage"
      aria-label={t("ariaStage")}
      aria-describedby="player-status"
    >
      <video
        ref={videoRef}
        playsInline
        preload="auto"
        aria-label={snapshot.current_media?.title ?? t("label")}
        className={youtubeActive ? "tt-media-layer--inactive" : undefined}
      />
      <div
        ref={youtubeMountRef}
        className={
          youtubeActive ? "tt-youtube-mount" : "tt-youtube-mount tt-media-layer--inactive"
        }
        aria-hidden={!youtubeActive}
        aria-label={youtubeActive ? snapshot.current_media?.title : undefined}
      />
      <div
        ref={webtorMountRef}
        className={
          snapshot.current_media?.source_type === "torrent"
            ? "tt-webtor-mount"
            : "tt-webtor-mount tt-media-layer--inactive"
        }
        aria-hidden={snapshot.current_media?.source_type !== "torrent"}
        aria-label={
          snapshot.current_media?.source_type === "torrent"
            ? snapshot.current_media.title
            : undefined
        }
      />
      <span className="tt-video-label" aria-hidden="true">
        <span className="tt-video-label-dot" />
        {t("label")}
      </span>
      <span id="player-status" className="tt-visually-hidden">
        Player is {status}.
      </span>

      {empty ? (
        <div className="tt-player-overlay tt-player-overlay--hero" style={heroStyle}>
          <div className="tt-player-overlay-inner">
            <Film size={36} aria-hidden style={{ color: "var(--tt-accent)" }} />
            <h2>{owner ? t("emptyOwnerTitle") : t("emptyViewerTitle")}</h2>
            {owner ? (
              <>
                <p>{t("emptyOwnerBody")}</p>
                {onAddMedia ? (
                  <div className="tt-player-overlay-actions">
                    <Button variant="primary" onClick={onAddMedia}>
                      <Plus size={18} aria-hidden />
                      <span className="tt-button-label">{t("addMedia")}</span>
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {!empty && showLoading && !waitingForPeers ? (
        <div className="tt-player-overlay">
          <div className="tt-player-overlay-inner">
            <Loader2 size={36} aria-hidden className="tt-anim-orbit" style={{ color: "var(--tt-accent)" }} />
            <h2>
              {connectingP2p
                ? t("p2pConnecting")
                : status === "starting"
                  ? t("loading")
                : status === "seeking"
                  ? t("seeking")
                  : t("joining")}
            </h2>
          </div>
        </div>
      ) : null}

      {!empty && waitingForPeers ? (
        <div className="tt-player-overlay" role="status">
          <div className="tt-player-overlay-inner">
            <RadioTower size={30} aria-hidden style={{ color: "var(--tt-warning)" }} />
            <h2>{t("p2pNoPeersTitle")}</h2>
            <p>{t("p2pNoPeersBody")}</p>
          </div>
        </div>
      ) : null}

      {!empty && showReconnect ? (
        <div className="tt-player-overlay" role="status">
          <div className="tt-player-overlay-inner">
            <Wifi size={28} aria-hidden style={{ color: "var(--tt-accent)" }} />
            <h2>{t("rejoiningTitle")}</h2>
            <p>{t("rejoiningBody")}</p>
            <div className="tt-player-overlay-actions">
              <Button onClick={onReconnect}>{tCommon("retry")}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {!empty && showBuffering ? (
        <div className="tt-player-overlay" role="status">
          <div className="tt-player-overlay-inner">
            <Loader2 size={36} aria-hidden className="tt-anim-orbit" style={{ color: "var(--tt-accent)" }} />
            <h2>{t("buffering")}</h2>
            <p>{t("bufferingBody")}</p>
          </div>
        </div>
      ) : null}

      {!empty && showCatchingUp ? (
        <div className="tt-player-overlay" role="status">
          <div className="tt-player-overlay-inner">
            <RadioTower size={30} aria-hidden style={{ color: "var(--tt-accent)" }} />
            <h2>{t("catchingUp")}</h2>
          </div>
        </div>
      ) : null}

      {!empty && blocked ? (
        <div className="tt-player-overlay">
          <div className="tt-player-overlay-inner">
            <Play size={36} aria-hidden style={{ color: "var(--tt-accent)" }} />
            <h2>{t("blockedTitle")}</h2>
            <p>{t("blockedBody")}</p>
            <div className="tt-player-overlay-actions">
              <Button variant="primary" onClick={onStartWatching}>
                <Play size={18} aria-hidden />
                <span className="tt-button-label">{t("startWatching")}</span>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {!empty && fatalMediaError ? (
        <div className="tt-player-overlay" role="alert">
          <div className="tt-player-overlay-inner">
            <AlertTriangle size={32} aria-hidden style={{ color: "var(--tt-danger)" }} />
            <h2>{mediaErrorCopy(fatalMediaError, t, tErrors).title}</h2>
            <p>{mediaErrorCopy(fatalMediaError, t, tErrors).body}</p>
            <p className="tt-muted" style={{ fontSize: 12 }}>
              {owner ? t("fatalReplaceHint") : t("fatalViewerHint")}
            </p>
            <div className="tt-player-overlay-actions">
              {owner && fatalMediaError.category === "p2p_file_required" && onReselectLocalFile ? (
                <Button variant="primary" onClick={onReselectLocalFile}>{t("chooseVideo")}</Button>
              ) : (
                <Button onClick={onRetry}>{tCommon("retry")}</Button>
              )}
              {owner && onAddMedia ? (
                <Button variant="primary" onClick={onAddMedia}>
                  {t("replaceSource")}
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
            <h2>{t("endedTitle")}</h2>
            <p>{owner ? t("endedOwnerBody") : t("endedViewerBody")}</p>
            {owner ? (
              <p className="tt-muted" style={{ fontSize: 12 }}>{t("endedOwnerHint")}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!empty &&
      paused &&
      !blocked &&
      !fatalMediaError &&
      !showLoading &&
      !showReconnect ? (
        <div className="tt-player-overlay" role="status">
          <div className="tt-player-overlay-inner">
            <Pause size={30} aria-hidden style={{ color: "var(--tt-warning)" }} />
            <h2>{t("pausedTitle")}</h2>
          </div>
        </div>
      ) : null}

      {showTransport ? (
        <LocalVideoTransport
          currentTime={currentTime}
          duration={duration}
          onMuteToggle={onMuteToggle}
          muted={muted}
          onCaptionsToggle={onCaptionsToggle}
          captionsActive={captionsActive}
          captionsAvailable={captionsAvailable}
          onPipToggle={onPipToggle}
          onFullscreenToggle={onFullscreenToggle}
          pipAvailable={pipAvailable}
          fullscreenAvailable={fullscreenAvailable}
        />
      ) : null}
      {localP2pActive && !empty && localP2pState.peerCount > 0 ? (
        <div className="tt-p2p-health" role="status">
          <RadioTower size={14} aria-hidden />
          {owner
            ? t("p2pStreamingPeers", { count: localP2pState.peerCount })
            : t("p2pConnectedPeers", { count: localP2pState.peerCount })}
        </div>
      ) : null}
    </section>
  );
});
