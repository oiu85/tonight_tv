"use client";

import { memo, useMemo, type RefObject } from "react";

import { Button, Tabs } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import type { ChatMessage } from "@/lib/chat/room-chat-service";
import type { MediaRuntimeError } from "@/lib/media/media-source";
import type { LocalP2pState } from "@/lib/p2p/local-p2p-contracts";
import { isTransientNetworkLike } from "@/lib/room/domain-errors";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
import { AdminControls } from "./components/admin-controls";
import { ChatPanel } from "./components/chat-panel";
import { NowPlaying } from "./components/now-playing";
import { PresenceStrip } from "./components/presence-strip";
import { UpNextPanel } from "./components/queue-panel";
import { RoomTopBar } from "./components/room-topbar";
import { VideoDock } from "./components/video-dock";
import { VideoStage } from "./components/video-stage";
import { ViewerControls } from "./components/viewer-controls";
import {
  usePlayerClock,
  useRoomChatMessages,
  useRoomSnapshot,
  useRoomSyncUi,
  useRoomWatchers,
} from "./hooks/use-room-session";

const BehindLiveHint = memo(function BehindLiveHint({ onGoLive }: { onGoLive: () => void }) {
  const t = useTranslations("room.footer");
  const clock = usePlayerClock();
  if (clock.behindSeconds < 2) {
    return null;
  }
  return (
    <span className="tt-room-footer-meta" style={{ color: "var(--tt-warning)" }}>
      {t("behind")}{" "}
      <button
        className="tt-link tt-room-footer-link"
        type="button"
        onClick={onGoLive}
        style={{ background: "transparent", border: 0, cursor: "pointer" }}
      >
        {t("goLive")}
      </button>
    </span>
  );
});
type QueueItem = RoomSnapshot["queue"][number];
type PendingPlaybackCommand = "play_pause" | "restart" | "next" | "seek" | "select";

const RoomChatHost = memo(function RoomChatHost({
  currentUserId,
  onSend,
}: {
  currentUserId: string;
  onSend: (body: string) => Promise<ChatMessage>;
}) {
  const messages = useRoomChatMessages();
  const syncUi = useRoomSyncUi();
  return (
    <ChatPanel
      messages={messages}
      currentUserId={currentUserId}
      connected={syncUi.channelStatus === "subscribed"}
      onSend={async (body) => {
        await onSend(body);
      }}
    />
  );
});

const RoomPresenceHost = memo(function RoomPresenceHost({
  ownerUserId,
  currentUserId,
}: {
  ownerUserId: string;
  currentUserId: string;
}) {
  const watchers = useRoomWatchers();
  return (
    <PresenceStrip
      watchers={watchers}
      ownerUserId={ownerUserId}
      currentUserId={currentUserId}
    />
  );
});

const RoomTopBarHost = memo(function RoomTopBarHost({
  room,
  owner,
  ownerDisplayName,
  onShare,
  onOpenSettings,
  onLeave,
}: {
  room: RoomSnapshot["room"];
  owner: boolean;
  ownerDisplayName: string;
  onShare: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
}) {
  const watchers = useRoomWatchers();
  const syncUi = useRoomSyncUi();
  return (
    <RoomTopBar
      room={room}
      channelStatus={syncUi.channelStatus}
      watcherCount={Math.max(watchers.length, 1)}
      owner={owner}
      ownerDisplayName={ownerDisplayName}
      onShare={onShare}
      onOpenSettings={onOpenSettings}
      onLeave={onLeave}
    />
  );
});

export function RoomLiveView({
  bootSnapshot,
  identity,
  mediaError,
  localP2pState,
  muted,
  volume,
  selectedSubtitleId,
  sidebarTab,
  pendingCommand,
  playerCapabilities,
  videoRef,
  youtubeMountRef,
  webtorMountRef,
  videoStageRef,
  onShare,
  onOpenSettings,
  onLeave,
  onSidebarTabChange,
  onStartWatching,
  onRetry,
  onReselectLocalFile,
  onMuteToggle,
  onCaptionsToggle,
  onPictureInPicture,
  onFullscreen,
  onAddMedia,
  onVolumeChange,
  onSubtitleChange,
  onPlayPause,
  onRestart,
  onNext,
  onSeek,
  onScrubConflict,
  onManageSubtitles,
  onEditMedia,
  onRemoveMedia,
  onPlayNow,
  onMoveItem,
  onSendChat,
}: {
  bootSnapshot: RoomSnapshot;
  identity: { userId: string; roomSessionId: string; displayName: string };
  mediaError: MediaRuntimeError | null;
  localP2pState: LocalP2pState;
  muted: boolean;
  volume: number;
  selectedSubtitleId: string | null;
  sidebarTab: "chat" | "queue";
  pendingCommand: PendingPlaybackCommand | null;
  playerCapabilities: {
    supportsFinePlaybackRateCorrection: boolean;
    supportsPictureInPicture: boolean;
    supportsNativeTextTracks: boolean;
  };
  videoRef: RefObject<HTMLVideoElement | null>;
  youtubeMountRef: RefObject<HTMLDivElement | null>;
  webtorMountRef: RefObject<HTMLDivElement | null>;
  videoStageRef: RefObject<HTMLElement | null>;
  onShare: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
  onSidebarTabChange: (tab: "chat" | "queue") => void;
  onStartWatching: () => void;
  onRetry: () => void;
  onReselectLocalFile?: () => void;
  onMuteToggle: () => void;
  onCaptionsToggle: () => void;
  onPictureInPicture: () => void;
  onFullscreen: () => void;
  onAddMedia: () => void;
  onVolumeChange: (volume: number) => void;
  onSubtitleChange: (id: string | null) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onNext: () => void;
  onSeek: (seconds: number, expectedVersion: number) => void;
  onScrubConflict: () => void;
  onManageSubtitles: () => void;
  onEditMedia: (item: QueueItem) => void;
  onRemoveMedia: (item: QueueItem) => void;
  onPlayNow: (item: QueueItem) => void;
  onMoveItem: (item: QueueItem, direction: -1 | 1) => void;
  onSendChat: (body: string) => Promise<ChatMessage>;
}) {
  const t = useTranslations("room");
  const tCommon = useTranslations("common");
  const snapshot = useRoomSnapshot() ?? bootSnapshot;
  const syncUi = useRoomSyncUi();
  const owner = snapshot.caller.is_owner;
  const connected = syncUi.channelStatus === "subscribed";
  const sourceSupportsPip = playerCapabilities.supportsPictureInPicture;
  const sourceSupportsSubtitles = playerCapabilities.supportsNativeTextTracks;
  const pipAvailable = typeof document !== "undefined" && "pictureInPictureEnabled" in document;
  const fullscreenAvailable = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const channelNotice = !connected && syncUi.channelStatus !== "idle";
  const transientLike = syncUi.error && isTransientNetworkLike(syncUi.error);
  const ownerDisplayName = snapshot.caller.display_name || identity.displayName;
  const playback = syncUi.canonicalPlayback ?? snapshot.playback;
  const tabs = useMemo(
    () => [
      { value: "chat" as const, label: t("sidebar.chat") },
      { value: "queue" as const, label: t("sidebar.queue") },
    ],
    [t],
  );

  return (
    <div className="tt-shell tt-shell-room tt-room-shell">
      <RoomTopBarHost
        room={snapshot.room}
        owner={owner}
        ownerDisplayName={ownerDisplayName}
        onShare={onShare}
        onOpenSettings={onOpenSettings}
        onLeave={onLeave}
      />
      {channelNotice ? (
        <div
          className={syncUi.channelStatus === "error" ? "tt-inline-error" : "tt-inline-warning"}
          role="status"
        >
          {syncUi.channelStatus === "error"
            ? transientLike
              ? t("errors.transient")
              : t("errors.fatal")
            : syncUi.reason === "visibility_resume"
              ? t("errors.visibility")
              : t("errors.transient")}
          <Button size="sm" variant="ghost" onClick={onRetry}>
            {tCommon("retry")}
          </Button>
        </div>
      ) : null}
      <div className="tt-room-layout">
        <div className="tt-room-main">
          <VideoDock>
            <VideoStage
              stageRef={videoStageRef}
              videoRef={videoRef}
              youtubeMountRef={youtubeMountRef}
              webtorMountRef={webtorMountRef}
              snapshot={snapshot}
              status={syncUi.status}
              mediaError={mediaError}
              localP2pState={localP2pState}
              reason={syncUi.reason}
              onStartWatching={onStartWatching}
              onRetry={onRetry}
              onReconnect={onRetry}
              onReselectLocalFile={onReselectLocalFile}
              onMuteToggle={onMuteToggle}
              muted={muted}
              onCaptionsToggle={onCaptionsToggle}
              captionsActive={sourceSupportsSubtitles && Boolean(selectedSubtitleId)}
              captionsAvailable={sourceSupportsSubtitles}
              onPipToggle={onPictureInPicture}
              onFullscreenToggle={onFullscreen}
              pipAvailable={pipAvailable && sourceSupportsPip}
              fullscreenAvailable={fullscreenAvailable}
              onAddMedia={owner ? onAddMedia : undefined}
            />
          </VideoDock>
        <NowPlaying
          snapshot={snapshot}
          status={syncUi.status}
          isOwner={owner}
        />
        {owner ? (
          <AdminControls
            muted={muted}
            volume={volume}
            subtitles={sourceSupportsSubtitles ? snapshot.subtitles : []}
            subtitlesAvailable={sourceSupportsSubtitles}
            selectedSubtitleId={selectedSubtitleId}
            onMutedChange={onMuteToggle}
            onVolumeChange={onVolumeChange}
            onSubtitleChange={onSubtitleChange}
            onPictureInPicture={onPictureInPicture}
            onFullscreen={onFullscreen}
            pipAvailable={pipAvailable && sourceSupportsPip}
            fullscreenAvailable={fullscreenAvailable}
            status={syncUi.status}
            playbackStatus={snapshot.playback.status}
            pending={pendingCommand}
            playbackVersion={playback.state_version}
            onPlayPause={onPlayPause}
            onRestart={onRestart}
            onNext={onNext}
            onSeek={onSeek}
            onScrubConflict={onScrubConflict}
            onAddMedia={onAddMedia}
            onManageSubtitles={onManageSubtitles}
          />
        ) : (
          <ViewerControls
            muted={muted}
            volume={volume}
            subtitles={sourceSupportsSubtitles ? snapshot.subtitles : []}
            subtitlesAvailable={sourceSupportsSubtitles}
            selectedSubtitleId={selectedSubtitleId}
            onMutedChange={onMuteToggle}
            onVolumeChange={onVolumeChange}
            onSubtitleChange={onSubtitleChange}
            onPictureInPicture={onPictureInPicture}
            onFullscreen={onFullscreen}
            pipAvailable={pipAvailable && sourceSupportsPip}
            fullscreenAvailable={fullscreenAvailable}
            status={syncUi.status}
            onGoLive={onRetry}
          />
        )}
        <div className="tt-mobile-tabs">
          <Tabs
            value={sidebarTab}
            onChange={onSidebarTabChange}
            label={t("sidebar.aria")}
            tabs={tabs}
          />
        </div>
          <RoomPresenceHost
            ownerUserId={snapshot.room.owner_user_id}
            currentUserId={identity.userId}
          />
        </div>
        <aside className="tt-sidebar" aria-label={t("sidebar.aria")}>
          <Tabs
            value={sidebarTab}
            onChange={onSidebarTabChange}
            label={t("sidebar.aria")}
            tabs={[
              {
                value: "chat",
                label: t("sidebar.chat"),
              },
              {
                value: "queue",
                label: t("sidebar.queue"),
                badge:
                  snapshot.queue.length > 0
                    ? String(snapshot.queue.length)
                    : undefined,
              },
            ]}
          />
          <div className="tt-sidebar-body">
            {sidebarTab === "chat" ? (
              <RoomChatHost currentUserId={identity.userId} onSend={onSendChat} />
            ) : (
              <UpNextPanel
                snapshot={snapshot}
                onAdd={onAddMedia}
                onEdit={onEditMedia}
                onRemove={onRemoveMedia}
                onPlayNow={onPlayNow}
                onMove={onMoveItem}
              />
            )}
          </div>
        </aside>
      </div>
      <div className="tt-room-footer" aria-label={t("footer.privateRoom")}>
        <BehindLiveHint onGoLive={onRetry} />
        <span className="tt-room-footer-spacer" />
        <span className="tt-room-footer-meta">
          <span className={`tt-status-dot ${connected ? "tt-dot-live" : "tt-dot-warning"}`} />
          {connected ? t("footer.connected") : t("footer.reconnecting")}
        </span>
      </div>
    </div>
  );
}
