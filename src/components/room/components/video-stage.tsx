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
import { memo, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

import { Button, IconButton, cx } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import type { MediaRuntimeError } from "@/lib/media/media-source";
import type { LocalP2pState } from "@/lib/p2p/local-p2p-contracts";
import { posterForTitle } from "@/lib/room/posters";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
import type { RoomSyncStatus } from "@/lib/sync/room-sync-coordinator";
import { usePlayerClock } from "../hooks/use-room-session";
import { mediaErrorCopy, isPlaybackPresentationHeld } from "./playback-helpers";

function useHeldFlag(active: boolean, appearAfterMs: number, minVisibleMs: number): boolean {
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    if (active) {
      if (visibleRef.current) {
        return;
      }
      timer = window.setTimeout(() => {
        visibleRef.current = true;
        shownAtRef.current = performance.now();
        setVisible(true);
      }, appearAfterMs);
    } else if (visibleRef.current) {
      const elapsed = shownAtRef.current === null ? minVisibleMs : performance.now() - shownAtRef.current;
      timer = window.setTimeout(() => {
        visibleRef.current = false;
        shownAtRef.current = null;
        setVisible(false);
      }, Math.max(0, minVisibleMs - elapsed));
    }
    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [active, appearAfterMs, minVisibleMs]);

  return visible;
}

export const LocalVideoTransport = memo(function LocalVideoTransport({
  currentTime: currentTimeProp,
  duration: durationProp,
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
  currentTime?: number;
  duration?: number | null;
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
  const clock = usePlayerClock();
  const currentTime = currentTimeProp ?? clock.currentTime;
  const duration = durationProp ?? clock.duration;
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
      <span className="tt-transport-time tt-num" dir="ltr">
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
  reason?: string | null;
  currentTime?: number;
  duration?: number | null;
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
  const tLive = useTranslations("room.liveRegion");
  const owner = snapshot.caller.is_owner;
  const youtubeActive = snapshot.current_media?.source_type === "youtube";
  const torrentActive = snapshot.current_media?.source_type === "torrent";
  const htmlVideoActive = !youtubeActive && !torrentActive;
  const localP2pActive = snapshot.current_media?.source_type === "local_p2p";
  const playback = snapshot.playback;
  const empty = playback.status === "idle" || !snapshot.current_media;
  const blocked = status === "playback_blocked" || mediaError?.category === "autoplay_permission_blocked";
  const connectingP2p = localP2pActive && (
    localP2pState.status === "connecting"
    || localP2pState.status === "preparing"
    || localP2pState.status === "hashing"
    || localP2pState.status === "buffering"
  );
  const reconnecting =
    !empty &&
    (reason === "visibility_resume" || reason === "realtime_reconnected") &&
    (status === "synchronizing" || status === "starting");
  const presentationHeld =
    !empty &&
    !blocked &&
    (connectingP2p || isPlaybackPresentationHeld(status));
  const showCatchingUp = status === "catching_up" && !mediaError && !blocked && !presentationHeld;
  const showBuffering = status === "buffering" && !mediaError && !blocked && !presentationHeld;
  const ended = playback.status === "ended";
  const paused = status === "paused";
  const fatalMediaError = mediaError !== null && mediaError.fatal && !blocked ? mediaError : null;
  const waitingForPeers = localP2pActive && localP2pState.status === "no_peers" && !fatalMediaError;
  const ownerWatchingRemoteHost = owner && localP2pActive && !localP2pState.hosting && !fatalMediaError && (localP2pState.status === "ready" || localP2pState.status === "no_peers" || localP2pState.status === "seeding");
  const heldBuffering = useHeldFlag(showBuffering && !waitingForPeers, 220, 420);
  const heldCatchingUp = useHeldFlag(showCatchingUp && !heldBuffering && !waitingForPeers, 120, 360);
  const holdTitle =
    status === "starting" || connectingP2p
      ? connectingP2p
        ? t("p2pConnecting")
        : t("loading")
      : status === "aligning" || status === "synchronizing"
        ? t("joining")
        : t("seeking");
  const showTransport = !empty && !blocked && !ended && !fatalMediaError && !presentationHeld;
  const [isNarrow, setIsNarrow] = useState(false);
  const canHideChrome = isNarrow && showTransport && playback.status === "playing" && !heldBuffering && !presentationHeld;
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideChromeTimer = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (hideChromeTimer.current !== null) {
      window.clearTimeout(hideChromeTimer.current);
      hideChromeTimer.current = null;
    }
    if (!canHideChrome) {
      hideChromeTimer.current = window.setTimeout(() => {
        setChromeVisible(true);
        hideChromeTimer.current = null;
      }, 0);
      return () => {
        if (hideChromeTimer.current !== null) {
          window.clearTimeout(hideChromeTimer.current);
          hideChromeTimer.current = null;
        }
      };
    }
    hideChromeTimer.current = window.setTimeout(() => setChromeVisible(false), 2600);
    return () => {
      if (hideChromeTimer.current !== null) {
        window.clearTimeout(hideChromeTimer.current);
        hideChromeTimer.current = null;
      }
    };
  }, [canHideChrome]);

  function revealChrome() {
    setChromeVisible(true);
    if (!canHideChrome) return;
    if (hideChromeTimer.current !== null) {
      window.clearTimeout(hideChromeTimer.current);
    }
    hideChromeTimer.current = window.setTimeout(() => setChromeVisible(false), 2600);
  }

  const heroUrl = posterForTitle(snapshot.current_media?.title).hero;
  const heroStyle = { ["--tt-hero-url" as string]: `url(${heroUrl})` } as CSSProperties;
  const announcement = blocked
    ? tLive("permissionNeeded")
    : reconnecting
      ? tLive("rejoining")
      : heldBuffering
        ? tLive("buffering")
        : paused
          ? tLive("paused")
          : status === "live"
            ? tLive("synced")
            : "";

  return (
    <section
      ref={stageRef}
      className={cx(
        "tt-video-stage",
        canHideChrome && !chromeVisible && "tt-video-stage--chrome-hidden",
        presentationHeld && "tt-video-stage--held",
      )}
      aria-label={t("ariaStage")}
      aria-describedby="player-status"
      onPointerMove={revealChrome}
      onPointerDown={revealChrome}
      onFocus={revealChrome}
    >
      <video
        ref={videoRef}
        playsInline
        preload="auto"
        aria-label={snapshot.current_media?.title ?? t("label")}
        className={htmlVideoActive ? undefined : "tt-media-layer--inactive"}
      />
      <div
        ref={youtubeMountRef}
        className={
          youtubeActive ? "tt-youtube-mount" : "tt-youtube-mount tt-media-layer--inactive"
        }
        aria-hidden={!youtubeActive}
        aria-label={youtubeActive ? snapshot.current_media?.title : undefined}
      />
      {youtubeActive ? <div className="tt-youtube-click-shield" aria-hidden="true" /> : null}
      <div
        ref={webtorMountRef}
        className={
          torrentActive ? "tt-webtor-mount" : "tt-webtor-mount tt-media-layer--inactive"
        }
        aria-hidden={!torrentActive}
        aria-label={torrentActive ? snapshot.current_media?.title : undefined}
      />
      <span
        className={empty ? "tt-video-label" : "tt-video-label tt-video-label--title"}
        aria-hidden="true"
      >
        <span className="tt-video-label-dot" />
        <span className="tt-video-label-text">{empty ? t("label") : snapshot.current_media?.title}</span>
      </span>
      <span id="player-status" className="tt-visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      {reconnecting ? (
        <div className="tt-player-chip" role="status">
          <Wifi size={14} aria-hidden />
          <span>{reason === "visibility_resume" ? t("rejoiningTitle") : t("reconnectingTitle")}</span>
          <button type="button" className="tt-link" onClick={onReconnect}>
            {tCommon("retry")}
          </button>
        </div>
      ) : null}

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

      {!empty && presentationHeld && !waitingForPeers ? (
        <div className="tt-player-overlay tt-player-overlay--hold" role="status">
          <div className="tt-player-overlay-inner">
            <Loader2 size={36} aria-hidden className="tt-anim-orbit" style={{ color: "var(--tt-accent)" }} />
            <h2>{holdTitle}</h2>
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

      {!empty && heldBuffering ? (
        <div className="tt-player-overlay tt-player-overlay--quiet" role="status">
          <div className="tt-player-overlay-inner">
            <Loader2 size={36} aria-hidden className="tt-anim-orbit" style={{ color: "var(--tt-accent)" }} />
            <h2>{t("buffering")}</h2>
            <p>{t("bufferingBody")}</p>
          </div>
        </div>
      ) : null}

      {!empty && heldCatchingUp ? (
        <div className="tt-player-overlay tt-player-overlay--quiet" role="status">
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
      !presentationHeld &&
      !reconnecting ? (
        <div
          className={cx(
            "tt-player-overlay",
            youtubeActive ? "tt-player-overlay--hold" : "tt-player-overlay--quiet",
          )}
          role="status"
        >
          <div className="tt-player-overlay-inner">
            <Pause size={16} aria-hidden style={{ color: "var(--tt-warning)" }} />
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
      {ownerWatchingRemoteHost && onReselectLocalFile ? (
        <div className="tt-p2p-health" role="status">
          <RadioTower size={14} aria-hidden />
          <span>{t("p2pHostElsewhereTitle")}</span>
          <Button variant="ghost" onClick={onReselectLocalFile}>{t("chooseVideo")}</Button>
        </div>
      ) : null}
    </section>
  );
});
