"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { getBrowserAuthService } from "@/lib/auth/auth-service";
import {
  createHtmlMediaPlayerAdapter,
  type HtmlMediaPlayerAdapter,
} from "@/lib/media/html-media-adapter";
import {
  getBrowserMediaQueueService,
  type MediaItemInput,
} from "@/lib/media/media-queue-service";
import { MediaRuntimeError } from "@/lib/media/media-source";
import { getBrowserPlaybackCommandService } from "@/lib/playback/playback-command-service";
import {
  getBrowserRoomService,
  type RoomJoinPreview,
  type RoomSnapshot,
} from "@/lib/rooms/room-service";
import {
  createHtmlSubtitleRuntime,
  getBrowserSubtitleService,
  type HtmlSubtitleRuntime,
  type SubtitleMetadata,
} from "@/lib/subtitles/subtitle-service";
import {
  createBrowserRoomSyncCoordinator,
  type RoomSyncCoordinator,
  type RoomSyncState,
} from "@/lib/sync/room-sync-coordinator";
import {
  isStaleVersionConflict,
  isTransientNetworkLike,
  roomUiErrorFromUnknown,
} from "@/lib/room/domain-errors";
import { Button, LoadingBlock, Tabs, useToast } from "../ui/primitives";
import { AdminControls, NowPlaying, VideoStage, ViewerControls } from "./room-controls";
import {
  DeleteMediaDialog,
  MediaDialog,
  RoomSettingsDialog,
  SubtitleManagerDialog,
} from "./room-dialogs";
import {
  RoomJoinError,
  RoomJoinGate,
  RoomJoinLoading,
} from "./room-join-gate";
import { ChatPanel, PresenceStrip, UpNextPanel } from "./room-panels";
import { RoomTopBar } from "./room-topbar";

type JoinStage = "idle" | "preparing" | "authenticating" | "joining" | "connecting" | "live";
type JoinedIdentity = { userId: string; roomSessionId: string; displayName: string };
type QueueItem = RoomSnapshot["queue"][number];

function initialSyncState(): RoomSyncState {
  return {
    status: "idle",
    reason: null,
    canonicalPlayback: null,
    snapshot: null,
    channelStatus: "idle",
    watchers: [],
    chatMessages: [],
    error: null,
  };
}

function displayNameForOwner(email?: string | null): string {
  const name = email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return name?.slice(0, 40) || "Room owner";
}

function useCoordinatorBehindSeconds(
  coordinatorRef: MutableRefObject<RoomSyncCoordinator | null>,
  playerCurrentTimeVersion: number,
  isJoined: boolean,
): number {
  const [behind, setBehind] = useState(0);
  useEffect(() => {
    if (!isJoined) {
      return;
    }
    function read() {
      const value = coordinatorRef.current?.getBehindSeconds() ?? 0;
      setBehind((current) => (current === value ? current : value));
    }
    read();
    const id = window.setInterval(read, 1000);
    return () => window.clearInterval(id);
  }, [coordinatorRef, playerCurrentTimeVersion, isJoined]);
  if (!isJoined) return 0;
  return behind;
}

export function RoomClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const adapterRef = useRef<HtmlMediaPlayerAdapter | null>(null);
  const coordinatorRef = useRef<RoomSyncCoordinator | null>(null);
  const subtitleRuntimeRef = useRef<HtmlSubtitleRuntime | null>(null);
  const syncStateRef = useRef<RoomSyncState>(initialSyncState());
  const ownerRef = useRef(false);

  const [preview, setPreview] = useState<RoomJoinPreview | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"loading" | "ready" | "invalid" | "error">("loading");
  const [phase, setPhase] = useState<"preview" | "room">("preview");
  const [joinStage, setJoinStage] = useState<JoinStage>("idle");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [lastNickname, setLastNickname] = useState("");
  const [identity, setIdentity] = useState<JoinedIdentity | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [syncState, setSyncState] = useState<RoomSyncState>(initialSyncState);
  const [mediaError, setMediaError] = useState<MediaRuntimeError | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.82);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"chat" | "queue">("chat");
  const [pendingCommand, setPendingCommand] = useState(false);
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<QueueItem | null>(null);
  const [mediaSubmitting, setMediaSubmitting] = useState(false);
  const [mediaFormError, setMediaFormError] = useState<string | null>(null);
  const [deleteMedia, setDeleteMedia] = useState<QueueItem | null>(null);
  const [deletingMedia, setDeletingMedia] = useState(false);
  const [subtitleOpen, setSubtitleOpen] = useState(false);
  const [subtitleBusy, setSubtitleBusy] = useState(false);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const currentTimeVersion = Math.floor(currentTime * 2);
  const behindSeconds = useCoordinatorBehindSeconds(
    coordinatorRef,
    currentTimeVersion,
    phase === "room",
  );

  const adoptSnapshot = useCallback(
    async (nextSnapshot: RoomSnapshot, userEmail?: string | null) => {
      let joinedSnapshot = nextSnapshot;
      if (!nextSnapshot.caller.room_session_id) {
        const joined = await getBrowserRoomService().joinRoom(
          roomId,
          nextSnapshot.caller.display_name || displayNameForOwner(userEmail),
        );
        joinedSnapshot = await getBrowserRoomService().fetchSnapshot(roomId);
        setIdentity({
          userId: joined.user_id,
          roomSessionId: joined.session_id,
          displayName: joined.display_name,
        });
      } else {
        setIdentity({
          userId: nextSnapshot.caller.user_id,
          roomSessionId: nextSnapshot.caller.room_session_id,
          displayName:
            nextSnapshot.caller.display_name || displayNameForOwner(userEmail),
        });
      }
      ownerRef.current = joinedSnapshot.caller.is_owner;
      setSnapshot(joinedSnapshot);
      setPhase("room");
    },
    [roomId],
  );

  const inspectRoom = useCallback(async () => {
    try {
      const nextPreview = await getBrowserRoomService().getRoomJoinPreview(roomId);
      setPreview(nextPreview);
      setPreviewStatus("ready");
      const auth = await getBrowserAuthService().getCurrentAuth();
      if (auth.status === "authenticated") {
        try {
          const nextSnapshot = await getBrowserRoomService().fetchSnapshot(roomId);
          await adoptSnapshot(nextSnapshot, auth.user.email);
        } catch (error) {
          // Already a member may or may not exist; the friendly mapper handles the
          // "you are not a member of this private room" case explicitly.
          const friendly = roomUiErrorFromUnknown(
            error,
            "Tonight TV could not load this room. Check your connection and try again.",
          );
          if (friendly.kind !== "auth" && friendly.kind !== "membership") {
            throw error;
          }
        }
      }
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(
        error,
        "Tonight TV could not load this room. Check your connection and try again.",
      );
      if (friendly.kind === "not-found") {
        setPreviewStatus("invalid");
      } else {
        setPreviewStatus("error");
      }
      setJoinError(friendly.message);
    }
  }, [adoptSnapshot, roomId]);

  useEffect(() => {
    const inspectionId = window.setTimeout(() => {
      void inspectRoom();
    }, 0);
    return () => window.clearTimeout(inspectionId);
  }, [inspectRoom]);

  function retryRoomInspection() {
    setPreviewStatus("loading");
    setJoinError(null);
    void inspectRoom();
  }

  async function joinRoom(nickname: string) {
    if (nickname.length < 1 || nickname.length > 40) {
      setJoinError("Display name must contain between 1 and 40 characters.");
      return;
    }
    setLastNickname(nickname);
    setJoinError(null);
    setJoinStage("preparing");
    try {
      setJoinStage("authenticating");
      await getBrowserAuthService().ensureViewerIdentity();
      setJoinStage("joining");
      const joined = await getBrowserRoomService().joinRoom(roomId, nickname);
      setJoinStage("connecting");
      const nextSnapshot = await getBrowserRoomService().fetchSnapshot(roomId);
      setIdentity({
        userId: joined.user_id,
        roomSessionId: joined.session_id,
        displayName: joined.display_name,
      });
      ownerRef.current = nextSnapshot.caller.is_owner;
      setSnapshot(nextSnapshot);
      setPhase("room");
      setJoinStage("live");
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(
        error,
        "Tonight TV could not load this room. Check your connection and try again.",
      );
      setJoinError(friendly.message);
      setJoinStage("idle");
    }
  }

  useEffect(() => {
    if (phase !== "room" || !identity || !videoRef.current) return;
    const video = videoRef.current;
    let disposed = false;
    const adapter = createHtmlMediaPlayerAdapter(video, {
      events: {
        onBufferingChange: (buffering) => {
          void coordinatorRef.current?.handleBufferingChange(buffering);
        },
        onError: (error) => setMediaError(error),
        onReady: () => {
          setMediaError(null);
          setDuration(adapter.getDuration());
        },
        onEnded: async () => {
          const state = syncStateRef.current.canonicalPlayback;
          if (!ownerRef.current || !state || state.status !== "playing") return;
          try {
            await getBrowserPlaybackCommandService().markEnded(roomId, state.state_version);
            await coordinatorRef.current?.goLive();
          } catch {
            toast.push("Could not mark the program ended", "danger");
          }
        },
      },
    });
    const subtitleRuntime = createHtmlSubtitleRuntime(video, getBrowserSubtitleService());
    const coordinator = createBrowserRoomSyncCoordinator(adapter);
    adapterRef.current = adapter;
    subtitleRuntimeRef.current = subtitleRuntime;
    coordinatorRef.current = coordinator;

    const updatePlayerTime = () => {
      setCurrentTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : null);
    };
    const visibility = () => {
      void coordinator.handleVisibilityChange(document.visibilityState === "visible");
    };
    const online = () => {
      void coordinator.goLive();
    };

    video.addEventListener("timeupdate", updatePlayerTime);
    video.addEventListener("durationchange", updatePlayerTime);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", online);
    const tickId = window.setInterval(() => {
      updatePlayerTime();
      void coordinator.tick();
    }, 2000);

    void coordinator
      .start({
        roomId,
        identity,
        handlers: {
          onStateChanged: (state) => {
            if (disposed) return;
            syncStateRef.current = state;
            setSyncState(state);
            if (state.snapshot) {
              ownerRef.current = state.snapshot.caller.is_owner;
              setSnapshot(state.snapshot);
            }
            if (state.snapshot?.room.name) {
              document.title = `${state.snapshot.room.name} · Tonight TV`;
            }
          },
        },
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      window.clearInterval(tickId);
      video.removeEventListener("timeupdate", updatePlayerTime);
      video.removeEventListener("durationchange", updatePlayerTime);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", online);
      void coordinator.stop().catch(() => undefined);
      subtitleRuntime.destroy();
      adapter.destroy();
      adapterRef.current = null;
      subtitleRuntimeRef.current = null;
      coordinatorRef.current = null;
    };
  }, [identity, phase, roomId, toast]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = muted;
      video.volume = volume;
    }
  }, [muted, volume]);

  async function runCommand(operation: () => Promise<unknown>, success: string) {
    setPendingCommand(true);
    try {
      await operation();
      await coordinatorRef.current?.goLive();
      toast.push(success);
    } catch (error) {
      if (isStaleVersionConflict(error)) {
        toast.push("Room state changed in another tab. Synced to the latest state.", "danger");
        await coordinatorRef.current?.goLive();
      } else {
        const friendly = roomUiErrorFromUnknown(
          error,
          "The shared playback command could not be applied.",
        );
        toast.push(friendly.message, "danger");
      }
    } finally {
      setPendingCommand(false);
    }
  }

  const currentSnapshot = syncState.snapshot ?? snapshot;
  const playback = syncState.canonicalPlayback ?? currentSnapshot?.playback ?? null;

  async function submitMedia(input: MediaItemInput, playNow: boolean) {
    if (!currentSnapshot || !playback) return;
    setMediaSubmitting(true);
    setMediaFormError(null);
    try {
      const service = getBrowserMediaQueueService();
      const item = editingMedia
        ? await service.editMedia(roomId, editingMedia.id, input)
        : await service.addMedia(roomId, input);
      if (playNow && !editingMedia) {
        await getBrowserPlaybackCommandService().selectMedia(
          roomId,
          playback.state_version,
          item.id,
          true,
        );
      }
      await coordinatorRef.current?.goLive();
      toast.push(
        editingMedia ? "Media updated" : playNow ? "Playing media" : "Media added to queue",
      );
      setMediaDialogOpen(false);
      setEditingMedia(null);
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(
        error,
        "The media request could not be completed. Try again.",
      );
      setMediaFormError(friendly.message);
    } finally {
      setMediaSubmitting(false);
    }
  }

  async function playNow(item: QueueItem) {
    if (playback) {
      await runCommand(
        () =>
          getBrowserPlaybackCommandService().selectMedia(
            roomId,
            playback.state_version,
            item.id,
            true,
          ),
        `Playing ${item.title}`,
      );
    }
  }

  async function moveItem(item: QueueItem, direction: -1 | 1) {
    if (!currentSnapshot) return;
    const ids = currentSnapshot.queue.map((entry) => entry.id);
    const index = ids.indexOf(item.id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    try {
      await getBrowserMediaQueueService().reorderMedia(roomId, ids);
      await coordinatorRef.current?.goLive();
      toast.push("Queue order updated");
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(
        error,
        "The queue could not be reordered right now.",
      );
      toast.push(friendly.message, "danger");
    }
  }

  async function confirmDelete() {
    if (!deleteMedia) return;
    setDeletingMedia(true);
    try {
      await getBrowserMediaQueueService().removeMedia(roomId, deleteMedia.id);
      await coordinatorRef.current?.goLive();
      toast.push("Media removed");
      setDeleteMedia(null);
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(
        error,
        "The media item could not be removed right now.",
      );
      toast.push(friendly.message, "danger");
    } finally {
      setDeletingMedia(false);
    }
  }

  async function selectSubtitle(id: string | null) {
    if (!currentSnapshot) return;
    setSubtitleError(null);
    if (!id) {
      subtitleRuntimeRef.current?.disable();
      setSelectedSubtitleId(null);
      return;
    }
    const subtitle = currentSnapshot.subtitles.find((track) => track.id === id);
    if (!subtitle) return;
    const metadata: SubtitleMetadata = {
      ...subtitle,
      room_id: roomId,
      created_by: currentSnapshot.room.owner_user_id,
    };
    try {
      await subtitleRuntimeRef.current?.select(metadata);
      setSelectedSubtitleId(id);
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(
        error,
        "Could not load this subtitle track. Playback is continuing.",
      );
      setSubtitleError(friendly.message);
      toast.push("Could not load subtitle", "danger");
    }
  }

  async function uploadSubtitle(input: { label: string; languageCode: string; file: File }) {
    if (!currentSnapshot?.current_media) return;
    setSubtitleBusy(true);
    setSubtitleError(null);
    try {
      await getBrowserSubtitleService().uploadSubtitle({
        roomId,
        mediaId: currentSnapshot.current_media.id,
        label: input.label,
        languageCode: input.languageCode,
        fileName: input.file.name,
        text: await input.file.text(),
      });
      await coordinatorRef.current?.goLive();
      toast.push("Subtitle uploaded");
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(
        error,
        "Subtitle upload failed.",
      );
      setSubtitleError(friendly.message);
    } finally {
      setSubtitleBusy(false);
    }
  }

  async function removeSubtitle(subtitle: SubtitleMetadata) {
    setSubtitleBusy(true);
    setSubtitleError(null);
    try {
      if (selectedSubtitleId === subtitle.id) {
        subtitleRuntimeRef.current?.disable();
        setSelectedSubtitleId(null);
      }
      await getBrowserSubtitleService().deleteSubtitle(subtitle);
      await coordinatorRef.current?.goLive();
      toast.push("Subtitle deleted");
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(
        error,
        "Subtitle deletion failed.",
      );
      setSubtitleError(friendly.message);
    } finally {
      setSubtitleBusy(false);
    }
  }

  async function copyRoomLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${roomId}`);
      toast.push("Room link copied");
    } catch {
      toast.push("Could not copy the room link", "danger");
    }
  }

  async function renameRoom(name: string) {
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const updated = await getBrowserRoomService().renameRoom(roomId, name);
      // Apply canonical rename without a full snapshot refetch.
      if (currentSnapshot) {
        const next = {
          ...currentSnapshot,
          room: { ...currentSnapshot.room, name: updated.name, updated_at: updated.updated_at },
        };
        setSnapshot(next);
        // Also update the coordinator-driven snapshot mirror so Realtime and
        // any future `goLive` will continue to use the canonical name.
        if (coordinatorRef.current) {
          const merged = (coordinatorRef.current.getState().snapshot ?? next);
          const mergedRoom = { ...merged.room, name: updated.name, updated_at: updated.updated_at };
          const mirrored = { ...merged, room: mergedRoom };
          // Push the canonical room name into the sync state so other listeners
          // (top bar, page title) pick it up immediately.
          syncStateRef.current = {
            ...syncStateRef.current,
            snapshot: mirrored,
          };
          setSyncState(syncStateRef.current);
        }
      }
      toast.push("Room name updated");
      setSettingsOpen(false);
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(
        error,
        "Tonight TV could not rename the room right now.",
      );
      setSettingsError(friendly.message);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function signOut() {
    await getBrowserAuthService().signOut();
    router.replace("/");
    router.refresh();
  }

  async function startWatching() {
    try {
      await adapterRef.current?.startWatching();
      await coordinatorRef.current?.goLive();
      setMediaError(null);
    } catch (error) {
      if (error instanceof MediaRuntimeError) setMediaError(error);
    }
  }

  async function pictureInPicture() {
    const video = videoRef.current;
    if (!video || !("requestPictureInPicture" in video)) {
      toast.push("Picture in Picture is not available in this browser", "danger");
      return;
    }
    try {
      await video.requestPictureInPicture();
    } catch {
      toast.push("Picture in Picture could not start", "danger");
    }
  }

  async function fullscreen() {
    try {
      await videoRef.current?.parentElement?.requestFullscreen();
    } catch {
      toast.push("Fullscreen could not start", "danger");
    }
  }

  // ----- pre-membership view -----
  if (phase === "preview") {
    if (previewStatus === "loading") return <RoomJoinLoading />;
    if (previewStatus === "invalid" || previewStatus === "error") {
      return (
        <RoomJoinError
          error={joinError ?? "This room link is invalid or no longer available."}
          onRetry={previewStatus === "error" ? retryRoomInspection : undefined}
          onBack={() => router.push("/")}
        />
      );
    }
    return (
      <RoomJoinGate
        preview={preview}
        joinStage={joinStage}
        error={joinError}
        initialNickname={lastNickname}
        onJoin={(name) => void joinRoom(name)}
      />
    );
  }

  if (!currentSnapshot || !identity) {
    return (
      <main className="tt-entry">
        <LoadingBlock label="Joining live…" />
      </main>
    );
  }

  const owner = currentSnapshot.caller.is_owner;
  const connected = syncState.channelStatus === "subscribed";
  const displayedBehindSeconds = currentSnapshot.playback.status === "playing" ? behindSeconds : 0;
  const watchersCount = syncState.watchers.length;
  const pipAvailable = typeof document !== "undefined" && "pictureInPictureEnabled" in document;
  const fullscreenAvailable = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const channelNotice = !connected && syncState.channelStatus !== "idle";
  const transientLike = syncState.error && isTransientNetworkLike(syncState.error);

  return (
    <main className="tt-app">
      <div className="tt-shell tt-room-shell">
        <RoomTopBar
          room={currentSnapshot.room}
          channelStatus={syncState.channelStatus}
          watcherCount={watchersCount}
          owner={owner}
          onShare={() => void copyRoomLink()}
          onOpenSettings={() => setSettingsOpen(true)}
          onLeave={() => void signOut()}
        />
        {channelNotice ? (
          <div
            className={syncState.channelStatus === "error" ? "tt-inline-error" : "tt-inline-warning"}
            role="status"
          >
            {syncState.channelStatus === "error"
              ? transientLike
                ? "Connection lost. Reconnecting…"
                : "The room connection could not recover. Retry synchronization."
              : syncState.reason === "visibility_resume"
                ? "Rejoining live…"
                : "Connection lost. Reconnecting…"}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void coordinatorRef.current?.goLive()}
            >
              Retry
            </Button>
          </div>
        ) : null}
        {subtitleError && !subtitleOpen ? (
          <div className="tt-inline-warning" role="status">
            {subtitleError}{" "}
            <Button size="sm" variant="ghost" onClick={() => setSubtitleError(null)}>
              Dismiss
            </Button>
          </div>
        ) : null}
        <div className="tt-room-layout">
          <div className="tt-room-main">
            <VideoStage
              videoRef={videoRef}
              snapshot={currentSnapshot}
              status={syncState.status}
              mediaError={mediaError}
              reason={syncState.reason}
              onStartWatching={() => void startWatching()}
              onRetry={() => void coordinatorRef.current?.goLive()}
              onReconnect={() => void coordinatorRef.current?.goLive()}
              onAddMedia={
                owner
                  ? () => {
                      setEditingMedia(null);
                      setMediaDialogOpen(true);
                    }
                  : undefined
              }
            />
            <NowPlaying
              snapshot={currentSnapshot}
              status={syncState.status}
              currentTime={currentTime}
              duration={duration}
              behindSeconds={displayedBehindSeconds}
            />
            {owner ? (
              <AdminControls
                muted={muted}
                volume={volume}
                subtitles={currentSnapshot.subtitles}
                selectedSubtitleId={selectedSubtitleId}
                onMutedChange={() => setMuted((v) => !v)}
                onVolumeChange={(v) => {
                  setVolume(v);
                  if (v > 0) setMuted(false);
                }}
                onSubtitleChange={(id) => void selectSubtitle(id)}
                onPictureInPicture={() => void pictureInPicture()}
                onFullscreen={() => void fullscreen()}
                pipAvailable={pipAvailable}
                fullscreenAvailable={fullscreenAvailable}
                status={syncState.status}
                playbackStatus={currentSnapshot.playback.status}
                currentTime={currentTime}
                duration={duration}
                pending={pendingCommand}
                onPlayPause={() =>
                  playback &&
                  void runCommand(
                    () =>
                      playback.status === "playing"
                        ? getBrowserPlaybackCommandService().pause(roomId, playback.state_version)
                        : getBrowserPlaybackCommandService().play(roomId, playback.state_version),
                    playback.status === "playing" ? "Paused for everyone" : "Playing for everyone",
                  )
                }
                onRestart={() =>
                  playback &&
                  void runCommand(
                    () => getBrowserPlaybackCommandService().restart(roomId, playback.state_version),
                    "Restarted for everyone",
                  )
                }
                onNext={() =>
                  playback &&
                  void runCommand(
                    () => getBrowserPlaybackCommandService().playNext(roomId, playback.state_version),
                    "Playing next item",
                  )
                }
                onSeek={(seconds) =>
                  playback &&
                  void runCommand(
                    () => getBrowserPlaybackCommandService().seek(roomId, playback.state_version, seconds),
                    "Room timeline updated",
                  )
                }
                onAddMedia={() => {
                  setEditingMedia(null);
                  setMediaDialogOpen(true);
                }}
                onManageSubtitles={() => setSubtitleOpen(true)}
              />
            ) : (
              <ViewerControls
                muted={muted}
                volume={volume}
                subtitles={currentSnapshot.subtitles}
                selectedSubtitleId={selectedSubtitleId}
                onMutedChange={() => setMuted((v) => !v)}
                onVolumeChange={(v) => {
                  setVolume(v);
                  if (v > 0) setMuted(false);
                }}
                onSubtitleChange={(id) => void selectSubtitle(id)}
                onPictureInPicture={() => void pictureInPicture()}
                onFullscreen={() => void fullscreen()}
                pipAvailable={pipAvailable}
                fullscreenAvailable={fullscreenAvailable}
                status={syncState.status}
                behindSeconds={displayedBehindSeconds}
                onGoLive={() => void coordinatorRef.current?.goLive()}
              />
            )}
            <div className="tt-mobile-tabs">
              <Tabs
                value={sidebarTab}
                onChange={setSidebarTab}
                label="Room sidebar"
                tabs={[
                  { value: "chat", label: "Chat" },
                  { value: "queue", label: "Up Next" },
                ]}
              />
            </div>
            <PresenceStrip
              watchers={syncState.watchers}
              ownerUserId={currentSnapshot.room.owner_user_id}
            />
          </div>
          <aside className="tt-sidebar" aria-label="Room conversation and queue">
            <Tabs
              value={sidebarTab}
              onChange={setSidebarTab}
              label="Room sidebar"
              tabs={[
                {
                  value: "chat",
                  label: "Chat",
                  badge: String(syncState.chatMessages.length || undefined),
                },
                {
                  value: "queue",
                  label: "Up Next",
                  badge: String(currentSnapshot.queue.length || undefined),
                },
              ]}
            />
            <div className="tt-sidebar-body">
              {sidebarTab === "chat" ? (
                <ChatPanel
                  messages={syncState.chatMessages}
                  currentUserId={identity.userId}
                  connected={connected}
                  onSend={async (body) => {
                    await coordinatorRef.current?.sendChatMessage(body);
                  }}
                />
              ) : (
                <UpNextPanel
                  snapshot={currentSnapshot}
                  onAdd={() => {
                    setEditingMedia(null);
                    setMediaDialogOpen(true);
                  }}
                  onEdit={(item) => {
                    setEditingMedia(item);
                    setMediaDialogOpen(true);
                  }}
                  onRemove={setDeleteMedia}
                  onPlayNow={(item) => void playNow(item)}
                  onMove={(item, direction) => void moveItem(item, direction)}
                />
              )}
            </div>
          </aside>
        </div>
        <MediaDialog
          open={mediaDialogOpen}
          onOpenChange={(open) => {
            setMediaDialogOpen(open);
            if (!open) {
              setEditingMedia(null);
              setMediaFormError(null);
            }
          }}
          item={editingMedia}
          submitting={mediaSubmitting}
          error={mediaFormError}
          onSubmit={submitMedia}
        />
        <DeleteMediaDialog
          item={deleteMedia}
          onClose={() => setDeleteMedia(null)}
          deleting={deletingMedia}
          onConfirm={confirmDelete}
        />
        <SubtitleManagerDialog
          open={subtitleOpen}
          onOpenChange={setSubtitleOpen}
          snapshot={currentSnapshot}
          uploading={subtitleBusy}
          error={subtitleError}
          onUpload={uploadSubtitle}
          onDelete={removeSubtitle}
        />
        {owner ? (
          <RoomSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            snapshot={currentSnapshot}
            saving={settingsBusy}
            error={settingsError}
            onRename={renameRoom}
            onCopy={copyRoomLink}
          />
        ) : null}
      </div>
    </main>
  );
}
