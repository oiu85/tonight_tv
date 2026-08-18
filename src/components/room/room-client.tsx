"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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
import { parseLocalP2pSignal, type LocalP2pState } from "@/lib/p2p/local-p2p-contracts";
import {
  destroyBrowserLocalP2pRuntime,
  getBrowserLocalP2pRuntime,
} from "@/lib/p2p/local-p2p-runtime";
import {
  getBrowserLocalP2pSourceService,
  resetBrowserLocalP2pSourceService,
} from "@/lib/p2p/local-p2p-source-service";
import { getBrowserPlaybackCommandService } from "@/lib/playback/playback-command-service";
import { getBrowserRoomChannelService } from "@/lib/realtime/room-channel-service";
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
import { isPlaybackPresentationHeld } from "./components/playback-helpers";
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
  roomUiErrorFromUnknown,
} from "@/lib/room/domain-errors";
import { settlePostMutationPlayback } from "@/lib/room/post-mutation-playback";
import { createRoomSessionStore } from "@/lib/room/room-session-store";
import { Button, LoadingBlock, useToast } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import {
  RoomJoinError,
  RoomJoinGate,
  RoomJoinLoading,
} from "./room-join-gate";
import { RoomSessionProvider } from "./hooks/use-room-session";
import { RoomLiveView } from "./room-live-view";

const MediaDialog = dynamic(
  () => import("./components/media-dialog").then((mod) => mod.MediaDialog),
);
const DeleteMediaDialog = dynamic(
  () => import("./components/delete-media-dialog").then((mod) => mod.DeleteMediaDialog),
);
const RoomSettingsDialog = dynamic(
  () => import("./components/settings-dialog").then((mod) => mod.RoomSettingsDialog),
);
const SubtitleManagerDialog = dynamic(
  () => import("./components/subtitle-manager-dialog").then((mod) => mod.SubtitleManagerDialog),
);

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

export function RoomClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("room");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("room.toasts");
  const tErrors = useTranslations("room.errors");
  const tJoin = useTranslations("room.join");
  const videoRef = useRef<HTMLVideoElement>(null);
  const youtubeMountRef = useRef<HTMLDivElement>(null);
  const webtorMountRef = useRef<HTMLDivElement>(null);
  const localP2pFileRef = useRef<HTMLInputElement>(null);
  const videoStageRef = useRef<HTMLElement>(null);
  const adapterRef = useRef<RoomMediaPlayerAdapter | null>(null);
  const coordinatorRef = useRef<RoomSyncCoordinator | null>(null);
  const subtitleRuntimeRef = useRef<HtmlSubtitleRuntime | null>(null);
  const syncStateRef = useRef<RoomSyncState>(initialSyncState());
  const [sessionStore] = useState(() => createRoomSessionStore());
  const toastRef = useRef(toast);
  const tToastsRef = useRef(tToasts);
  const tErrorsRef = useRef(tErrors);
  const ownerRef = useRef(false);
  const pendingCommandRef = useRef<PendingPlaybackCommand | null>(null);

  useEffect(() => {
    toastRef.current = toast;
    tToastsRef.current = tToasts;
    tErrorsRef.current = tErrors;
  }, [toast, tToasts, tErrors]);

  const [preview, setPreview] = useState<RoomJoinPreview | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"loading" | "ready" | "invalid" | "error">("loading");
  const [phase, setPhase] = useState<"preview" | "room">("preview");
  const [joinStage, setJoinStage] = useState<JoinStage>("idle");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [lastNickname, setLastNickname] = useState("");
  const [identity, setIdentity] = useState<JoinedIdentity | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [mediaError, setMediaError] = useState<MediaRuntimeError | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
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
    hosting: false,
    error: null,
  });

  const identityKey = identity ? `${identity.userId}:${identity.roomSessionId}` : "";

  async function reconcileCoordinator(
    fallback = tToasts("stillSyncing"),
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
      sessionStore.applyCoordinatorState({
        ...initialSyncState(),
        snapshot: joinedSnapshot,
      });
      setSnapshot(joinedSnapshot);
      setPhase("room");
    },
    [roomId, sessionStore],
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
            tErrorsRef.current("joinFailed"),
          );
          if (friendly.kind !== "auth" && friendly.kind !== "membership") {
            throw error;
          }
        }
      }
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(
        error,
        tErrorsRef.current("joinFailed"),
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
      setJoinError(tJoin("nameLength"));
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
      sessionStore.applyCoordinatorState({
        ...initialSyncState(),
        snapshot: nextSnapshot,
      });
      setSnapshot(nextSnapshot);
      setPhase("room");
      setJoinStage("live");
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(
        error,
        tErrorsRef.current("joinFailed"),
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
    const store = sessionStore;
    let disposed = false;
    let progressId: number | null = null;
    let tickId: number | null = null;
    const reportCoordinatorError = (error: unknown, fallback: string) => {
      if (disposed) return;
      const friendly = roomUiErrorFromUnknown(error, fallback);
      toastRef.current.push(friendly.message, "danger");
    };
    const adapter = createRoomMediaPlayerAdapter(video, youtubeMount, webtorMount, {
        onBufferingChange: (buffering) => {
          void coordinatorRef.current?.handleBufferingChange(buffering).catch((error) => {
            reportCoordinatorError(error, tToastsRef.current("bufferingSyncFailed"));
          });
        },
        onError: (error) => {
          if (error.fatal || error.category === "autoplay_permission_blocked") {
            setMediaError(error);
          }
          coordinatorRef.current?.handleMediaError(error);
        },
        onDurationChange: (nextDuration) => {
          const clock = store.getClock();
          store.setClock({ ...clock, duration: nextDuration });
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
              reportCoordinatorError(error, tToastsRef.current("driftFailed"));
            });
          }
        },
        onReady: () => {
          setMediaError(null);
          const clock = store.getClock();
          store.setClock({ ...clock, duration: adapter.getDuration() });
          setPlayerCapabilities(adapter.getCapabilities());
          void coordinatorRef.current?.tick().catch((error) => {
            reportCoordinatorError(error, tToastsRef.current("syncAfterLoadFailed"));
          });
        },
        onEnded: async () => {
          try {
            const result = await endedCoordinator.handleEnded();
            if (result) await coordinatorRef.current?.applyCommandResult(result);
          } catch {
            toastRef.current.push(tToastsRef.current("markEndedFailed"), "danger");
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
      if (document.visibilityState !== "visible") {
        return;
      }
      const current = adapter.getCurrentTime();
      store.setClock({
        currentTime: Number.isFinite(current) ? current : 0,
        duration: adapter.getDuration(),
        canonicalTime: coordinator.getExpectedPosition(),
        behindSeconds: coordinator.getBehindSeconds(),
      });
    };
    const stopTimers = () => {
      if (progressId !== null) {
        window.clearInterval(progressId);
        progressId = null;
      }
      if (tickId !== null) {
        window.clearInterval(tickId);
        tickId = null;
      }
    };
    const startTimers = () => {
      if (disposed || document.visibilityState !== "visible") {
        return;
      }
      if (progressId === null) {
        progressId = window.setInterval(updatePlayerTime, 500);
      }
      if (tickId === null) {
        tickId = window.setInterval(() => {
          void coordinator.tick().catch((error) => {
            if (!disposed) {
              reportCoordinatorError(error, tToastsRef.current("stillSyncing"));
            }
          });
        }, 2000);
      }
    };
    const visibility = () => {
      if (document.visibilityState === "visible") {
        startTimers();
        updatePlayerTime();
      } else {
        stopTimers();
      }
      void coordinator
        .handleVisibilityChange(document.visibilityState === "visible")
        .catch((error) => {
          if (!disposed) {
            reportCoordinatorError(error, tErrorsRef.current("visibilityResumeFailed"));
          }
        });
    };
    const online = () => {
      void coordinator.goLive().catch((error) => {
        if (!disposed) {
          reportCoordinatorError(error, tToastsRef.current("onlineStillSyncing"));
        }
      });
    };

    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", online);
    startTimers();

    void coordinator
      .start({
        roomId,
        identity,
        handlers: {
          onStateChanged: (state) => {
            if (disposed) return;
            syncStateRef.current = state;
            store.applyCoordinatorState(state);
            adapter.setMuted(
              mutedRef.current || isPlaybackPresentationHeld(state.status),
            );
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
      stopTimers();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", online);
      void coordinator.stop().catch(() => undefined);
      subtitleRuntime.destroy();
      adapter.destroy();
      adapterRef.current = null;
      subtitleRuntimeRef.current = null;
      coordinatorRef.current = null;
    };
    // Locale translators stay on refs so language changes do not tear the player down.
  }, [identity, identityKey, phase, roomId, sessionStore]);

  useEffect(() => () => {
    resetBrowserLocalP2pSourceService();
    void destroyBrowserLocalP2pRuntime().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (phase !== "room") return;
    const runtime = getBrowserLocalP2pRuntime();
    return runtime.subscribe((next) => {
      setLocalP2pState((current) => {
        if (
          current.status === next.status &&
          current.infoHash === next.infoHash &&
          current.peerCount === next.peerCount &&
          current.hosting === next.hosting &&
          (current.error?.message ?? null) === (next.error?.message ?? null)
        ) {
          return current;
        }
        return next;
      });
    });
  }, [phase]);

  useEffect(() => {
    if (phase !== "room" || !identity) return;
    const runtime = getBrowserLocalP2pRuntime();
    const channel = getBrowserRoomChannelService();
    runtime.setSignalTransport({
      sessionId: identity.roomSessionId,
      send: (message) => channel.sendP2pSignal(message),
      subscribe: (listener) =>
        channel.subscribeP2pSignal((payload) => {
          const parsed = parseLocalP2pSignal(payload);
          if (parsed) listener(parsed);
        }),
    });
    return () => runtime.setSignalTransport(null);
  }, [identity, phase]);

  useEffect(() => {
    mutedRef.current = muted;
    adapterRef.current?.setMuted(
      muted || isPlaybackPresentationHeld(syncStateRef.current.status),
    );
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
        await reconcileCoordinator(tToasts("commandSavedStillSyncing"));
      }
    } catch (error) {
      if (isStaleVersionConflict(error)) {
        toast.push(tErrors("staleVersionGeneric"), "danger");
        await reconcileCoordinator();
      } else {
        const friendly = roomUiErrorFromUnknown(error, tErrors("commandFailed"));
        toast.push(friendly.message, "danger");
      }
    } finally {
      pendingCommandRef.current = null;
      setPendingCommand(null);
    }
  }

  const currentSnapshot = snapshot;
  function getPlayback() {
    return syncStateRef.current.canonicalPlayback ?? currentSnapshot?.playback ?? null;
  }

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
    const playback = getPlayback();
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
        selectionFailureMessage: tToasts("selectionFailed"),
        reconciliationFailureMessage: tToasts("reconciliationFailed"),
      });
      const playbackStarted = playNow && !editingMedia && postMutation.selectionSucceeded;

      toast.push(
        subtitleFailures > 0
          ? tToasts("mediaAddedSubtitlesFailed", { count: subtitleFailures })
          : editingMedia
            ? tToasts("mediaUpdated")
            : playbackStarted
              ? tToasts("playingMedia")
              : tToasts("mediaAdded"),
        subtitleFailures > 0 ? "danger" : undefined,
      );
      if (postMutation.warning) toast.push(postMutation.warning, "danger");
      setMediaDialogOpen(false);
      setEditingMedia(null);
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(error, tErrors("mediaAddFailed"));
      setMediaFormError(friendly.message);
    } finally {
      setMediaSubmitting(false);
    }
  }

  async function submitLocalP2p(title: string, file: File, playNow: boolean) {
    const playback = getPlayback();
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
        selectionFailureMessage: tToasts("deviceSelectionFailed"),
        reconciliationFailureMessage: tToasts("deviceReconciliationFailed"),
      });
      const playbackStarted = playNow && postMutation.selectionSucceeded;

      toast.push(playbackStarted ? tToasts("deviceStarted") : tToasts("deviceQueued"));
      if (postMutation.warning) toast.push(postMutation.warning, "danger");
      setMediaDialogOpen(false);
      setEditingMedia(null);
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(error, tToasts("devicePrepareFailed"));
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
      toast.push(tToasts("deviceResumed"));
      await reconcileCoordinator(tToasts("deviceResumeStillSyncing"));
    } catch (error) {
      setMediaError(
        new MediaRuntimeError("p2p_file_required", tToasts("deviceResumeFailed"), { cause: error }),
      );
    } finally {
      if (localP2pFileRef.current) localP2pFileRef.current.value = "";
    }
  }

  async function playNow(item: QueueItem) {
    const playback = getPlayback();
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
        tToasts("playingTitle", { title: item.title }),
      );
    }
  }

  async function playNextPrepared() {
    const playback = getPlayback();
    if (!playback || !currentSnapshot) return;
    await runCommand(
      "next",
      async () => {
        return getBrowserPlaybackCommandService().playNext(roomId, playback.state_version);
      },
      tToasts("playingNext"),
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
      toast.push(tToasts("queueUpdated"));
      await reconcileCoordinator(tToasts("queueStillSyncing"));
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(error, tToasts("queueReorderFailed"));
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
      toast.push(tToasts("mediaRemoved"));
      await reconcileCoordinator(tToasts("mediaRemovedStillSyncing"));
      setDeleteMedia(null);
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(error, tErrors("mediaRemoveFailed"));
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
      const friendly = roomUiErrorFromUnknown(error, tErrors("subtitleLoadFailed"));
      setSubtitleError(friendly.message);
      toast.push(tToasts("subtitleLoadFailed"), "danger");
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
      toast.push(tToasts("subtitleUploaded"));
      await reconcileCoordinator(tToasts("subtitleUploadedStillSyncing"));
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(error, tErrors("subtitleUploadFailed"));
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
      toast.push(tToasts("subtitleDeleted"));
      await reconcileCoordinator(tToasts("subtitleDeletedStillSyncing"));
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(error, tErrors("subtitleDeleteFailed"));
      setSubtitleError(friendly.message);
    } finally {
      setSubtitleBusy(false);
    }
  }

  async function copyRoomLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${roomId}`);
      toast.push(tToasts("roomLinkCopied"));
    } catch {
      toast.push(tErrors("copyFailed"), "danger");
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
          sessionStore.applyCoordinatorState(syncStateRef.current);
        }
      }
      toast.push(tToasts("roomRenamed"));
      setSettingsOpen(false);
    } catch (error) {
      const friendly = roomUiErrorFromUnknown(error, tErrors("renameFailed"));
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
      await reconcileCoordinator(tToasts("playbackStartedStillSyncing"));
    } catch (error) {
      if (error instanceof MediaRuntimeError) setMediaError(error);
    }
  }

  async function pictureInPicture() {
    if (!adapterRef.current?.getCapabilities().supportsPictureInPicture) {
      toast.push(tToasts("pipSourceUnavailable"), "danger");
      return;
    }
    const video = videoRef.current;
    if (!video || !("requestPictureInPicture" in video)) {
      toast.push(tToasts("pipBrowserUnavailable"), "danger");
      return;
    }
    try {
      await video.requestPictureInPicture();
    } catch {
      toast.push(tToasts("pipFailed"), "danger");
    }
  }

  async function fullscreen() {
    try {
      await videoStageRef.current?.requestFullscreen();
    } catch {
      toast.push(tToasts("fullscreenFailed"), "danger");
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
          error={joinError ?? tErrors("noRoom")}
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
        <LoadingBlock label={t("join.lifecycle.live.label")} />
      </main>
    );
  }

  const owner = currentSnapshot.caller.is_owner;

  return (
    <main className="tt-app">
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
      {subtitleError && !subtitleOpen ? (
        <div className="tt-inline-warning" role="status" style={{ margin: "0 var(--space-6)" }}>
          {subtitleError}{" "}
          <Button size="sm" variant="ghost" onClick={() => setSubtitleError(null)}>
            {tCommon("dismiss")}
          </Button>
        </div>
      ) : null}
      <RoomSessionProvider store={sessionStore}>
        <RoomLiveView
          bootSnapshot={currentSnapshot}
          identity={identity}
          mediaError={mediaError}
          localP2pState={localP2pState}
          muted={muted}
          volume={volume}
          selectedSubtitleId={selectedSubtitleId}
          sidebarTab={sidebarTab}
          pendingCommand={pendingCommand}
          playerCapabilities={playerCapabilities}
          videoRef={videoRef}
          youtubeMountRef={youtubeMountRef}
          webtorMountRef={webtorMountRef}
          videoStageRef={videoStageRef}
          onShare={() => void copyRoomLink()}
          onOpenSettings={() => setSettingsOpen(true)}
          onLeave={() => void signOut()}
          onSidebarTabChange={setSidebarTab}
          onStartWatching={() => void startWatching()}
          onRetry={() => void reconcileCoordinator()}
          onReselectLocalFile={owner ? () => localP2pFileRef.current?.click() : undefined}
          onMuteToggle={toggleMute}
          onCaptionsToggle={toggleCaptions}
          onPictureInPicture={() => void pictureInPicture()}
          onFullscreen={() => void fullscreen()}
          onAddMedia={() => {
            setEditingMedia(null);
            setMediaDialogOpen(true);
          }}
          onVolumeChange={(nextVolume) => {
            setVolume(nextVolume);
            if (nextVolume > 0) setMuted(false);
          }}
          onSubtitleChange={(id) => void selectSubtitle(id)}
          onPlayPause={() => {
            const playback = getPlayback();
            if (!playback) return;
            void runCommand(
              "play_pause",
              () =>
                playback.status === "playing"
                  ? getBrowserPlaybackCommandService().pause(roomId, playback.state_version)
                  : getBrowserPlaybackCommandService().play(roomId, playback.state_version),
              playback.status === "playing" ? tToasts("pausedEveryone") : tToasts("playingEveryone"),
            );
          }}
          onRestart={() => {
            const playback = getPlayback();
            if (!playback) return;
            void runCommand(
              "restart",
              () => getBrowserPlaybackCommandService().restart(roomId, playback.state_version),
              tToasts("restartedEveryone"),
            );
          }}
          onNext={() => {
            if (!getPlayback()) return;
            void playNextPrepared();
          }}
          onSeek={(seconds, expectedVersion) => {
            const playback = getPlayback();
            if (!playback || playback.state_version !== expectedVersion) {
              toast.push(tErrors("staleVersionSeek"), "danger");
              void reconcileCoordinator();
              return;
            }
            void runCommand(
              "seek",
              () => getBrowserPlaybackCommandService().seek(roomId, expectedVersion, seconds),
              tToasts("timelineUpdated"),
            );
          }}
          onScrubConflict={() => toast.push(tErrors("staleVersionSeek"), "danger")}
          onManageSubtitles={() => setSubtitleOpen(true)}
          onEditMedia={(item) => {
            setEditingMedia(item);
            setMediaDialogOpen(true);
          }}
          onRemoveMedia={setDeleteMedia}
          onPlayNow={(item) => void playNow(item)}
          onMoveItem={(item, direction) => void moveItem(item, direction)}
          onSendChat={async (body) => {
            const sent = await coordinatorRef.current?.sendChatMessage(body);
            if (!sent) {
              throw new Error(tErrors("chatSendFailed"));
            }
            return sent;
          }}
        />
      </RoomSessionProvider>
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
    </main>
  );
}
