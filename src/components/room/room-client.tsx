"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { getBrowserAuthService } from "@/lib/auth/auth-service";
import {
  createMediaEndedCoordinator,
} from "@/lib/media/html-media-adapter";
import {
  createRoomMediaPlayerAdapter,
  type RoomMediaPlayerAdapter,
} from "@/lib/media/room-media-adapter";
import {
  getBrowserMediaQueueService,
  type MediaItemInput,
} from "@/lib/media/media-queue-service";
import { MediaRuntimeError } from "@/lib/media/media-source";
import type { LocalP2pState } from "@/lib/p2p/local-p2p-contracts";
import {
  destroyBrowserLocalP2pRuntime,
  getBrowserLocalP2pRuntime,
} from "@/lib/p2p/local-p2p-runtime";
import {
  getBrowserLocalP2pSourceService,
  resetBrowserLocalP2pSourceService,
} from "@/lib/p2p/local-p2p-source-service";
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
import type { CanonicalPlaybackState } from "@/lib/sync/sync-core";
import {
  fetchTorrentSubtitle,
} from "@/lib/torrent/torrent-client";
import type { SubtitleCandidate } from "@/lib/torrent/torrent-manifest";
import {
  isStaleVersionConflict,
  isTransientNetworkLike,
  roomUiErrorFromUnknown,
} from "@/lib/room/domain-errors";
import { settlePostMutationPlayback } from "@/lib/room/post-mutation-playback";
import { avatarInitials, avatarToneClass } from "@/lib/room/avatars";
import { Button, LoadingBlock, Tabs, useToast } from "@/components/primitives";
import { AdminControls } from "./components/admin-controls";
import { NowPlaying } from "./components/now-playing";
import { VideoStage } from "./components/video-stage";
import { ViewerControls } from "./components/viewer-controls";
import { MediaDialog } from "./components/media-dialog";
import { DeleteMediaDialog } from "./components/delete-media-dialog";
import { RoomSettingsDialog } from "./components/settings-dialog";
import { SubtitleManagerDialog } from "./components/subtitle-manager-dialog";
import {
  RoomJoinError,
  RoomJoinGate,
  RoomJoinLoading,
} from "./room-join-gate";
import { ChatPanel } from "./components/chat-panel";
import { PresenceStrip } from "./components/presence-strip";
import { UpNextPanel } from "./components/queue-panel";
import { RoomTopBar } from "./components/room-topbar";

type JoinStage = "idle" | "preparing" | "authenticating" | "joining" | "connecting" | "live";
type JoinedIdentity = { userId: string; roomSessionId: string; displayName: string };
type QueueItem = RoomSnapshot["queue"][number];
type PendingPlaybackCommand = "play_pause" | "restart" | "next" | "seek" | "select";

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
  const youtubeMountRef = useRef<HTMLDivElement>(null);
  const webtorMountRef = useRef<HTMLDivElement>(null);
  const localP2pFileRef = useRef<HTMLInputElement>(null);
  const videoStageRef = useRef<HTMLElement>(null);
  const adapterRef = useRef<RoomMediaPlayerAdapter | null>(null);
  const coordinatorRef = useRef<RoomSyncCoordinator | null>(null);
  const subtitleRuntimeRef = useRef<HtmlSubtitleRuntime | null>(null);
  const syncStateRef = useRef<RoomSyncState>(initialSyncState());
  const ownerRef = useRef(false);
  const pendingCommandRef = useRef<PendingPlaybackCommand | null>(null);

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
  const [canonicalTime, setCanonicalTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.82);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"chat" | "queue">("chat");
  const [pendingCommand, setPendingCommand] =
    useState<PendingPlaybackCommand | null>(null);
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
  const [playerCapabilities, setPlayerCapabilities] = useState({
    supportsFinePlaybackRateCorrection: true,
    supportsPictureInPicture: true,
    supportsNativeTextTracks: true,
  });
  const [localP2pState, setLocalP2pState] = useState<LocalP2pState>({
    status: "idle",
    infoHash: null,
    peerCount: 0,
    uploadSpeed: 0,
    downloadSpeed: 0,
    progress: 0,
    error: null,
  });

  const currentTimeVersion = Math.floor(currentTime * 2);
  const behindSeconds = useCoordinatorBehindSeconds(
    coordinatorRef,
    currentTimeVersion,
    phase === "room",
  );

  async function reconcileCoordinator(
    fallback = "Playback is still synchronizing. Use Retry to reconnect the room.",
  ): Promise<boolean> {
    try {
      await coordinatorRef.current?.goLive();
      return true;
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(error, fallback);
      toast.push(friendly.message, "danger");
      return false;
    }
  }

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
    if (
      phase !== "room" ||
      !identity ||
      !videoRef.current ||
      !youtubeMountRef.current ||
      !webtorMountRef.current
    ) return;
    const video = videoRef.current;
    const youtubeMount = youtubeMountRef.current;
    const webtorMount = webtorMountRef.current;
    let disposed = false;
    const reportCoordinatorError = (error: unknown, fallback: string) => {
      if (disposed) return;
      const friendly = roomUiErrorFromUnknown(error, fallback);
      toast.push(friendly.message, "danger");
    };
    const adapter = createRoomMediaPlayerAdapter(video, youtubeMount, webtorMount, {
        onBufferingChange: (buffering) => {
          void coordinatorRef.current?.handleBufferingChange(buffering).catch((error) => {
            reportCoordinatorError(error, "Playback buffering could not be synchronized.");
          });
        },
        onError: (error) => {
          if (error.fatal || error.category === "autoplay_permission_blocked") {
            setMediaError(error);
          }
          coordinatorRef.current?.handleMediaError(error);
        },
        onDurationChange: (nextDuration) => {
          setDuration(nextDuration);
        },
        onProgress: () => {
          const coordinator = coordinatorRef.current;
          const playerStatus = syncStateRef.current.status;
          if (
            coordinator &&
            (playerStatus === "starting" ||
              playerStatus === "aligning" ||
              playerStatus === "seeking")
          ) {
            void coordinator.tick().catch((error) => {
              reportCoordinatorError(error, "Playback drift could not be corrected.");
            });
          }
        },
        onReady: () => {
          setMediaError(null);
          setDuration(adapter.getDuration());
          setPlayerCapabilities(adapter.getCapabilities());
          void coordinatorRef.current?.tick().catch((error) => {
            reportCoordinatorError(error, "Playback could not be synchronized after loading media.");
          });
        },
        onEnded: async () => {
          try {
            const result = await endedCoordinator.handleEnded();
            if (result) await coordinatorRef.current?.applyCommandResult(result);
          } catch {
            toast.push("Could not mark the program ended", "danger");
          }
        },
    }, { roomId, isOwner: ownerRef.current });
    const endedCoordinator = createMediaEndedCoordinator({
      isOwner: ownerRef.current,
      roomId,
      player: adapter,
      getCanonicalPlayback: () => syncStateRef.current.canonicalPlayback,
      playbackCommands: getBrowserPlaybackCommandService(),
    });
    const subtitleRuntime = createHtmlSubtitleRuntime(video, getBrowserSubtitleService());
    const coordinator = createBrowserRoomSyncCoordinator(adapter);
    adapterRef.current = adapter;
    subtitleRuntimeRef.current = subtitleRuntime;
    coordinatorRef.current = coordinator;

    const updatePlayerTime = () => {
      const current = adapter.getCurrentTime();
      setCurrentTime(Number.isFinite(current) ? current : 0);
      setDuration(adapter.getDuration());
      setCanonicalTime(coordinator.getExpectedPosition());
    };
    const visibility = () => {
      void coordinator
        .handleVisibilityChange(document.visibilityState === "visible")
        .catch((error) => {
          if (!disposed) {
            const friendly = roomUiErrorFromUnknown(
              error,
              "The room could not resynchronize after returning to the tab.",
            );
            toast.push(friendly.message, "danger");
          }
        });
    };
    const online = () => {
      void coordinator.goLive().catch((error) => {
        if (!disposed) {
          const friendly = roomUiErrorFromUnknown(
            error,
            "The room connection is back, but playback is still synchronizing.",
          );
          toast.push(friendly.message, "danger");
        }
      });
    };

    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", online);
    const progressId = window.setInterval(updatePlayerTime, 500);
    const tickId = window.setInterval(() => {
      void coordinator.tick().catch((error) => {
        if (!disposed) {
          const friendly = roomUiErrorFromUnknown(
            error,
            "Playback could not be synchronized. Use Retry to reconnect the room.",
          );
          toast.push(friendly.message, "danger");
        }
      });
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
            if (state.status === "starting") {
              setMediaError(null);
            }
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
      window.clearInterval(progressId);
      window.clearInterval(tickId);
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

  useEffect(() => () => {
    resetBrowserLocalP2pSourceService();
    void destroyBrowserLocalP2pRuntime().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (phase !== "room") return;
    const runtime = getBrowserLocalP2pRuntime();
    return runtime.subscribe(setLocalP2pState);
  }, [phase]);

  useEffect(() => {
    adapterRef.current?.setMuted(muted);
    adapterRef.current?.setVolume(volume);
  }, [muted, volume]);

  async function runCommand(
    command: PendingPlaybackCommand,
    operation: () => Promise<CanonicalPlaybackState>,
    success: string,
  ) {
    if (pendingCommandRef.current !== null) {
      return;
    }
    pendingCommandRef.current = command;
    setPendingCommand(command);
    try {
      const result = await operation();
      toast.push(success);
      try {
        await coordinatorRef.current?.applyCommandResult(result);
      } catch {
        await reconcileCoordinator(
          "The playback command was saved, but this browser is still synchronizing the player.",
        );
      }
    } catch (error) {
      if (isStaleVersionConflict(error)) {
        toast.push("Room state changed in another tab. Synced to the latest state.", "danger");
        await reconcileCoordinator();
      } else {
        const friendly = roomUiErrorFromUnknown(
          error,
          "The shared playback command could not be applied.",
        );
        toast.push(friendly.message, "danger");
      }
    } finally {
      pendingCommandRef.current = null;
      setPendingCommand(null);
    }
  }

  const currentSnapshot = syncState.snapshot ?? snapshot;
  const playback = syncState.canonicalPlayback ?? currentSnapshot?.playback ?? null;

  async function importTorrentSubtitles(
    mediaId: string,
    subtitles: readonly SubtitleCandidate[],
  ): Promise<number> {
    let failures = 0;
    for (const subtitle of subtitles) {
      try {
        const source = await fetchTorrentSubtitle(roomId, mediaId, {
          index: subtitle.file.index,
          path: subtitle.file.path,
        });
        await getBrowserSubtitleService().uploadSubtitle({
          roomId,
          mediaId,
          label: subtitle.label,
          languageCode: subtitle.languageCode,
          fileName: source.name,
          text: source.text,
        });
      } catch {
        failures += 1;
      }
    }
    return failures;
  }

  async function submitMedia(
    input: MediaItemInput,
    playNow: boolean,
    subtitles: readonly SubtitleCandidate[],
  ) {
    if (!currentSnapshot || !playback) return;
    setMediaSubmitting(true);
    setMediaFormError(null);
    try {
      const service = getBrowserMediaQueueService();
      const item = editingMedia
        ? await service.editMedia(roomId, editingMedia.id, input)
        : await service.addMedia(roomId, input);
      const subtitleFailures = input.sourceType === "torrent"
        ? await importTorrentSubtitles(item.id, subtitles)
        : 0;

      const postMutation = await settlePostMutationPlayback({
        select: playNow && !editingMedia
          ? () => getBrowserPlaybackCommandService().selectMedia(
              roomId,
              playback.state_version,
              item.id,
              true,
            ).then(() => undefined)
          : undefined,
        reconcile: async () => {
          await coordinatorRef.current?.goLive();
        },
        selectionFailureMessage: "Media was added, but playback could not switch to it yet.",
        reconciliationFailureMessage: "Media was added, but the room is still synchronizing playback.",
      });
      const playbackStarted = playNow && !editingMedia && postMutation.selectionSucceeded;

      toast.push(
        subtitleFailures > 0
          ? `Media added. ${subtitleFailures} subtitle${subtitleFailures === 1 ? "" : "s"} could not be imported.`
            : editingMedia
              ? "Media updated"
            : playbackStarted
              ? "Playing media"
              : "Media added to queue",
        subtitleFailures > 0 ? "danger" : undefined,
      );
      if (postMutation.warning) toast.push(postMutation.warning, "danger");
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

  async function submitLocalP2p(title: string, file: File, playNow: boolean) {
    if (!currentSnapshot || !playback) return;
    setMediaSubmitting(true);
    setMediaFormError(null);
    try {
      const { media } = await getBrowserLocalP2pSourceService().startDeviceStream(
        roomId,
        title,
        file,
      );
      const postMutation = await settlePostMutationPlayback({
        select: playNow
          ? () => getBrowserPlaybackCommandService().selectMedia(
              roomId,
              playback.state_version,
              media.id,
              true,
            ).then(() => undefined)
          : undefined,
        reconcile: async () => {
          await coordinatorRef.current?.goLive();
        },
        selectionFailureMessage: "The device stream was added, but playback could not switch to it yet.",
        reconciliationFailureMessage: "The device stream was added, but the room is still synchronizing playback.",
      });
      const playbackStarted = playNow && postMutation.selectionSucceeded;

      toast.push(playbackStarted ? "Device stream started" : "Device stream added to queue");
      if (postMutation.warning) toast.push(postMutation.warning, "danger");
      setMediaDialogOpen(false);
      setEditingMedia(null);
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(
        error,
        "The device stream could not be prepared. Try another video file.",
      );
      setMediaFormError(friendly.message);
    } finally {
      setMediaSubmitting(false);
    }
  }

  async function resumeLocalP2p(file: File) {
    if (!currentSnapshot?.current_media || currentSnapshot.current_media.source_type !== "local_p2p") {
      return;
    }
    setMediaError(null);
    try {
      const service = getBrowserLocalP2pSourceService();
      const descriptor = await service.resolveSource(roomId, currentSnapshot.current_media.id);
      await service.resumeDeviceStream(descriptor, file);
      toast.push("Device stream resumed");
      await reconcileCoordinator(
        "The device stream resumed, but the room is still synchronizing playback.",
      );
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "The selected file could not resume this device stream.";
      setMediaError(new MediaRuntimeError("p2p_file_required", message, { cause: error }));
    } finally {
      if (localP2pFileRef.current) localP2pFileRef.current.value = "";
    }
  }

  async function playNow(item: QueueItem) {
    if (playback) {
      await runCommand(
        "select",
        async () => {
          return getBrowserPlaybackCommandService().selectMedia(
            roomId,
            playback.state_version,
            item.id,
            true,
          );
        },
        `Playing ${item.title}`,
      );
    }
  }

  async function playNextPrepared() {
    if (!playback || !currentSnapshot) return;
    await runCommand(
      "next",
      async () => {
        return getBrowserPlaybackCommandService().playNext(roomId, playback.state_version);
      },
      "Playing next item",
    );
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
      toast.push("Queue order updated");
      await reconcileCoordinator("The queue order was saved, but the room is still synchronizing.");
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
      if (deleteMedia.source_type === "local_p2p" && deleteMedia.torrent_info_hash) {
        await getBrowserLocalP2pRuntime()
          .leaveLocalStream(deleteMedia.torrent_info_hash)
          .catch(() => undefined);
      }
      toast.push("Media removed");
      await reconcileCoordinator("Media was removed, but the room is still synchronizing.");
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
    if (!adapterRef.current?.getCapabilities().supportsNativeTextTracks) {
      subtitleRuntimeRef.current?.disable();
      setSelectedSubtitleId(null);
      return;
    }
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
      toast.push("Subtitle uploaded");
      await reconcileCoordinator("Subtitle uploaded, but the room is still synchronizing.");
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(error, "Subtitle upload failed.");
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
      toast.push("Subtitle deleted");
      await reconcileCoordinator("Subtitle deleted, but the room is still synchronizing.");
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(error, "Subtitle deletion failed.");
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
      if (currentSnapshot) {
        const next = {
          ...currentSnapshot,
          room: { ...currentSnapshot.room, name: updated.name, updated_at: updated.updated_at },
        };
        setSnapshot(next);
        if (coordinatorRef.current) {
          const merged = coordinatorRef.current.getState().snapshot ?? next;
          const mergedRoom = { ...merged.room, name: updated.name, updated_at: updated.updated_at };
          const mirrored = { ...merged, room: mergedRoom };
          syncStateRef.current = { ...syncStateRef.current, snapshot: mirrored };
          setSyncState(syncStateRef.current);
        }
      }
      toast.push("Room name updated");
      setSettingsOpen(false);
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(error, "Tonight TV could not rename the room right now.");
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
      setMediaError(null);
      await reconcileCoordinator("Playback started, but the room is still synchronizing.");
    } catch (error) {
      if (error instanceof MediaRuntimeError) setMediaError(error);
    }
  }

  async function pictureInPicture() {
    if (!adapterRef.current?.getCapabilities().supportsPictureInPicture) {
      toast.push("Picture in Picture is not available for this source", "danger");
      return;
    }
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
      await videoStageRef.current?.requestFullscreen();
    } catch {
      toast.push("Fullscreen could not start", "danger");
    }
  }

  function toggleMute() {
    setMuted((value) => !value);
  }

  function toggleCaptions() {
    const nextSubtitleId = selectedSubtitleId
      ? null
      : (currentSnapshot?.subtitles[0]?.id ?? null);
    void selectSubtitle(nextSubtitleId);
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
  const sourceSupportsPip = playerCapabilities.supportsPictureInPicture;
  const sourceSupportsSubtitles = playerCapabilities.supportsNativeTextTracks;
  const fullscreenAvailable = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const channelNotice = !connected && syncState.channelStatus !== "idle";
  const transientLike = syncState.error && isTransientNetworkLike(syncState.error);
  const ownerDisplayName = currentSnapshot.caller.display_name || displayNameForOwner();
  const ownerTone = avatarToneClass(ownerDisplayName);

  return (
    <main className="tt-app">
      <div className="tt-shell tt-shell-room tt-room-shell">
        <RoomTopBar
          room={currentSnapshot.room}
          channelStatus={syncState.channelStatus}
          watcherCount={watchersCount}
          owner={owner}
          ownerDisplayName={ownerDisplayName}
          onShare={() => void copyRoomLink()}
          onOpenSettings={() => setSettingsOpen(true)}
          onLeave={() => void signOut()}
          onOpenAccountMenu={() => void signOut()}
        />
        <input
          ref={localP2pFileRef}
          type="file"
          accept="video/*,.mp4,.m4v,.webm,.mov,.mkv,.ogv"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void resumeLocalP2p(file);
          }}
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
              onClick={() => void reconcileCoordinator()}
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
              stageRef={videoStageRef}
              videoRef={videoRef}
                youtubeMountRef={youtubeMountRef}
                webtorMountRef={webtorMountRef}
              snapshot={currentSnapshot}
              status={syncState.status}
              mediaError={mediaError}
              localP2pState={localP2pState}
              reason={syncState.reason}
              currentTime={currentTime}
              duration={duration}
              onStartWatching={() => void startWatching()}
              onRetry={() => void reconcileCoordinator()}
              onReconnect={() => void reconcileCoordinator()}
              onReselectLocalFile={owner ? () => localP2pFileRef.current?.click() : undefined}
              onMuteToggle={toggleMute}
              muted={muted}
              onCaptionsToggle={toggleCaptions}
              captionsActive={sourceSupportsSubtitles && Boolean(selectedSubtitleId)}
              captionsAvailable={sourceSupportsSubtitles}
              onPipToggle={() => void pictureInPicture()}
              onFullscreenToggle={() => void fullscreen()}
              pipAvailable={pipAvailable && sourceSupportsPip}
              fullscreenAvailable={fullscreenAvailable}
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
              isOwner={owner}
            />
            {owner ? (
              <AdminControls
                muted={muted}
                volume={volume}
                subtitles={sourceSupportsSubtitles ? currentSnapshot.subtitles : []}
                subtitlesAvailable={sourceSupportsSubtitles}
                selectedSubtitleId={selectedSubtitleId}
                onMutedChange={() => setMuted((v) => !v)}
                onVolumeChange={(v) => {
                  setVolume(v);
                  if (v > 0) setMuted(false);
                }}
                onSubtitleChange={(id) => void selectSubtitle(id)}
                onPictureInPicture={() => void pictureInPicture()}
                onFullscreen={() => void fullscreen()}
                pipAvailable={pipAvailable && sourceSupportsPip}
                fullscreenAvailable={fullscreenAvailable}
                status={syncState.status}
                playbackStatus={currentSnapshot.playback.status}
                currentTime={canonicalTime}
                duration={duration}
                pending={pendingCommand}
                playbackVersion={playback?.state_version ?? currentSnapshot.playback.state_version}
                onPlayPause={() =>
                  playback &&
                  void runCommand(
                    "play_pause",
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
                    "restart",
                    () => getBrowserPlaybackCommandService().restart(roomId, playback.state_version),
                    "Restarted for everyone",
                  )
                }
                onNext={() => playback && void playNextPrepared()}
                onSeek={(seconds, expectedVersion) => {
                  if (!playback || playback.state_version !== expectedVersion) {
                    toast.push(
                      "Room state changed while you were seeking. Synced to the latest state.",
                      "danger",
                    );
                    void reconcileCoordinator();
                    return;
                  }
                  void runCommand(
                    "seek",
                    () =>
                      getBrowserPlaybackCommandService().seek(
                        roomId,
                        expectedVersion,
                        seconds,
                      ),
                    "Room timeline updated",
                  );
                }}
                onScrubConflict={() => {
                  toast.push(
                    "Room state changed while you were seeking. Preview reset.",
                    "danger",
                  );
                }}
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
                subtitles={sourceSupportsSubtitles ? currentSnapshot.subtitles : []}
                subtitlesAvailable={sourceSupportsSubtitles}
                selectedSubtitleId={selectedSubtitleId}
                onMutedChange={() => setMuted((v) => !v)}
                onVolumeChange={(v) => {
                  setVolume(v);
                  if (v > 0) setMuted(false);
                }}
                onSubtitleChange={(id) => void selectSubtitle(id)}
                onPictureInPicture={() => void pictureInPicture()}
                onFullscreen={() => void fullscreen()}
                pipAvailable={pipAvailable && sourceSupportsPip}
                fullscreenAvailable={fullscreenAvailable}
                status={syncState.status}
                behindSeconds={displayedBehindSeconds}
                onGoLive={() => void reconcileCoordinator()}
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
              currentUserId={identity.userId}
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
        <div className="tt-room-footer" aria-label="Room metadata">
          <span className="tt-room-footer-meta">
            Room ID: <code style={{ color: "var(--tt-text-secondary)" }}>{currentSnapshot.room.id.slice(0, 8)}</code>
          </span>
          <span className="tt-room-footer-meta" style={{ color: "var(--tt-live)" }}>
            <span className="tt-status-dot tt-dot-live" /> Private room
          </span>
          <span className="tt-room-footer-spacer" />
          {displayedBehindSeconds >= 2 ? (
            <span className="tt-room-footer-meta" style={{ color: "var(--tt-warning)" }}>
              Behind live? <button
                className="tt-link tt-room-footer-link"
                type="button"
                onClick={() => void reconcileCoordinator()}
                style={{ background: "transparent", border: 0, cursor: "pointer" }}
              >
                Go live
              </button> to catch up or refresh.
            </span>
          ) : null}
          <span className="tt-room-footer-meta">
            <span className="tt-status-dot tt-dot-live" /> {connected ? "Connected" : "Reconnecting…"}
          </span>
          <span className="tt-room-footer-meta">
            <span className={`tt-avatar ${ownerTone}`} style={{ width: 24, height: 24, fontSize: 10 }} aria-hidden>
              {avatarInitials(ownerDisplayName)}
            </span>
            {owner ? "Admin present" : "Viewer"}
          </span>
        </div>
        <MediaDialog
          open={mediaDialogOpen}
          roomId={roomId}
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
          localP2pState={localP2pState}
          onSubmit={submitMedia}
          onSubmitLocalP2p={submitLocalP2p}
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
