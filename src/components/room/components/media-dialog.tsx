"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { Button, Dialog, Field, Input } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import type { MediaItemInput, MediaSourceType } from "@/lib/media/media-queue-service";
import type { LocalP2pState } from "@/lib/p2p/local-p2p-contracts";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
import type { SubtitleCandidate } from "@/lib/torrent/torrent-manifest";
import { inspectTorrent } from "@/lib/torrent/torrent-client";
import {
  extractInfoHashFromTorrentInput,
  parseMagnetIdentity,
  isWebtorAutoselectPath,
  defaultSubtitleFileIndexes,
  rankSubtitleCandidates,
  rankVideoCandidates,
} from "@/lib/torrent/torrent-manifest";
import type {
  TorrentInspection,
  TorrentManifestFile,
} from "@/lib/torrent/torrent-contracts";

type QueueItem = RoomSnapshot["queue"][number];

export function MediaDialog({
  open,
  onOpenChange,
  roomId,
  item,
  submitting,
  error,
  onSubmit,
  onSubmitLocalP2p,
  localP2pState,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  item: QueueItem | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (
    input: MediaItemInput,
    playNow: boolean,
    subtitles: readonly SubtitleCandidate[],
  ) => Promise<void>;
  onSubmitLocalP2p: (title: string, file: File, playNow: boolean) => Promise<void>;
  localP2pState: LocalP2pState;
}) {
  // The dialog is heavy (torrent inspection, sub-forms). We only mount the
  // inner content when the dialog is open, and we remount on `item` change
  // so edit + add never share a form state.
  if (!open) return null;
  return (
    <MediaDialogContent
      key={item?.id ?? "new"}
      open={open}
      onOpenChange={onOpenChange}
      roomId={roomId}
      item={item}
      submitting={submitting}
      error={error}
      onSubmit={onSubmit}
      onSubmitLocalP2p={onSubmitLocalP2p}
      localP2pState={localP2pState}
    />
  );
}

function MediaDialogContent({
  open,
  onOpenChange,
  roomId,
  item,
  submitting,
  error,
  onSubmit,
  onSubmitLocalP2p,
  localP2pState,
}: Parameters<typeof MediaDialog>[0]) {
  const t = useTranslations("room.mediaDialog");
  const tCommon = useTranslations("common");
  const [title, setTitle] = useState(item?.title ?? "");
  const [sourceUrl, setSourceUrl] = useState(item?.source_url ?? "");
  const [youtubeVideoId, setYoutubeVideoId] = useState(item?.youtube_video_id ?? "");
  const [sourceType, setSourceType] = useState<MediaSourceType>(item?.source_type ?? "auto");
  const [playNow, setPlayNow] = useState(false);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localCompatibilityWarning, setLocalCompatibilityWarning] = useState<string | null>(null);
  const [torrentInputKind, setTorrentInputKind] = useState<"magnet" | "torrent_file">(
    item?.torrent_input_kind ?? "magnet",
  );
  const [magnetUri, setMagnetUri] = useState(item?.torrent_magnet_uri ?? "");
  const [torrentFile, setTorrentFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<TorrentInspection | null>(() =>
    item?.source_type === "torrent" &&
    item.torrent_info_hash &&
    item.torrent_file_index !== null &&
    item.torrent_file_path &&
    item.torrent_file_name &&
    item.torrent_file_size !== null
      ? {
          infoHash: item.torrent_info_hash,
          torrentName: null,
          status: "ready",
          files: [{
            index: item.torrent_file_index,
            path: item.torrent_file_path,
            name: item.torrent_file_name,
            sizeBytes: item.torrent_file_size,
            extension: item.torrent_file_name.split(".").pop()?.toLowerCase() ?? null,
            kind: "video",
            playableCandidate: true,
            candidateRank: item.torrent_file_size,
          }],
          totalFiles: 1,
          truncated: false,
        }
      : null,
  );
  const [selectedVideoIndex, setSelectedVideoIndex] = useState<number | null>(
    item?.torrent_file_index ?? null,
  );
  const [selectedSubtitleIndexes, setSelectedSubtitleIndexes] = useState<Set<number>>(
    () => new Set(),
  );
  const [inspectionStatus, setInspectionStatus] = useState<string | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [inspectionBusy, setInspectionBusy] = useState(false);
  const inspectionGeneration = useRef(0);
  const inspectionAbort = useRef<AbortController | null>(null);
  useEffect(() => () => inspectionAbort.current?.abort(), []);

  const videoCandidates = useMemo(
    () => rankVideoCandidates(inspection?.files ?? []),
    [inspection],
  );
  const selectedVideo = useMemo(
    () => inspection?.files.find((file) => file.index === selectedVideoIndex) ?? null,
    [inspection, selectedVideoIndex],
  );
  const subtitleCandidates = useMemo(
    () => (selectedVideo ? rankSubtitleCandidates(selectedVideo, inspection?.files ?? []) : []),
    [inspection, selectedVideo],
  );
  const magnetIdentityReady = Boolean(extractInfoHashFromTorrentInput(magnetUri));
  const autoselectInspection = Boolean(
    inspection && selectedVideo && isWebtorAutoselectPath(selectedVideo.path),
  );
  const torrentSubmitReady =
    sourceType !== "torrent" ||
    (torrentInputKind === "magnet" ? magnetIdentityReady : Boolean(inspection && selectedVideo));

  async function inspect() {
    const generation = ++inspectionGeneration.current;
    inspectionAbort.current?.abort();
    const abort = new AbortController();
    inspectionAbort.current = abort;
    setInspection(null);
    setSelectedVideoIndex(null);
    setSelectedSubtitleIndexes(new Set());
    setInspectionError(null);
    setInspectionStatus(null);
    setInspectionBusy(true);
    try {
      const result = await inspectTorrent(
        roomId,
        torrentInputKind === "magnet"
          ? { kind: "magnet", magnetUri }
          : { kind: "torrent_file", file: torrentFile as File },
        abort.signal,
      );
      if (generation !== inspectionGeneration.current) return;
      const candidates = rankVideoCandidates(result.files);
      setInspection(result);
      if (result.magnetUri) setMagnetUri(result.magnetUri);
      if (candidates.length === 0) {
        setInspectionError(t("noVideoFiles"));
      } else if (candidates.length === 1) {
        setSelectedVideoIndex(candidates[0].index);
        setSelectedSubtitleIndexes(defaultSubtitleFileIndexes(candidates[0], result.files));
      }
      setInspectionStatus(t("ready"));
    } catch (cause) {
      if (abort.signal.aborted || generation !== inspectionGeneration.current) return;
      setInspectionError(cause instanceof Error ? cause.message : "Torrent inspection failed.");
      setInspectionStatus(null);
    } finally {
      if (inspectionAbort.current === abort) inspectionAbort.current = null;
      if (generation === inspectionGeneration.current) setInspectionBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sourceType === "torrent") {
      let currentInspection = inspection;
      let currentVideo = selectedVideo;
      if (torrentInputKind === "magnet" && (!currentInspection || !currentVideo)) {
        // A Magnet has enough identity to queue immediately. Webtor selects the
        // playable file inside its own player, so adding must not wait for a
        // remote file manifest.
        try {
          const identity = await parseMagnetIdentity(magnetUri);
          currentInspection = {
            infoHash: identity.infoHash,
            torrentName: identity.name,
            status: "ready",
            files: [{
              index: 0,
              path: "__webtor_autoselect__.mp4",
              name: "video.mp4",
              sizeBytes: 0,
              extension: "mp4",
              kind: "video",
              playableCandidate: true,
              candidateRank: 0,
            }],
            totalFiles: 1,
            truncated: false,
            magnetUri: identity.magnetUri,
          };
          currentVideo = currentInspection.files[0];
        } catch (cause) {
          setInspectionError(cause instanceof Error ? cause.message : t("inspectFirst"));
          return;
        }
      }
      if (!currentInspection || !currentVideo) {
        setInspectionError(t("inspectFirst"));
        return;
      }
      await onSubmit(
        {
          title,
          sourceType: "torrent",
          torrent: {
            infoHash: currentInspection.infoHash,
            inputKind: torrentInputKind,
            magnetUri: currentInspection.magnetUri || magnetUri.trim() || null,
            metadataFile: torrentFile,
            torrentName: currentInspection.torrentName,
            fileIndex: currentVideo.index,
            filePath: currentVideo.path,
            fileName: currentVideo.name,
            fileSize: currentVideo.sizeBytes,
          },
        },
        playNow,
        subtitleCandidates.filter((candidate) => selectedSubtitleIndexes.has(candidate.file.index)),
      );
      return;
    }
    if (sourceType === "local_p2p") {
      if (!localFile) {
        setLocalCompatibilityWarning(t("localChooseFirst"));
        return;
      }
      await onSubmitLocalP2p(title, localFile, playNow);
      return;
    }
    await onSubmit(
      sourceType === "youtube"
        ? { title, sourceType, youtubeVideoId }
        : { title, sourceType, sourceUrl },
      playNow,
      [],
    );
  }

  function selectLocalFile(file: File | undefined): void {
    if (!file) return;
    setLocalFile(file);
    const probe = document.createElement("video");
    const supported = file.type ? probe.canPlayType(file.type) : "maybe";
    setLocalCompatibilityWarning(supported === "" ? t("localCompatibilityWarning") : null);
  }

  function localP2pStatusLabel(): string {
    if (!submitting) return t("localStates.idle");
    switch (localP2pState.status) {
      case "preparing":
        return t("localStates.preparing");
      case "hashing":
        return t("localStates.hashing");
      case "seeding":
      case "ready":
        return t("localStates.ready");
      case "error":
        return t("localStates.error");
      default:
        return t("localStates.idle");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? t("editTitle") : t("addTitle")}
      description={t("description")}
    >
      <form className="tt-form" onSubmit={submit}>
        <Field label={t("title")} htmlFor="media-title">
          <Input
            id="media-title"
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("titlePlaceholder")}
            required
          />
        </Field>
        <Field label={t("sourceType")} htmlFor="media-source-type">
          <select
            id="media-source-type"
            className="tt-select"
            value={sourceType}
            onChange={(event) => {
              const nextSourceType = event.target.value as MediaSourceType;
              setSourceType(nextSourceType);
              if (nextSourceType === "youtube" || nextSourceType === "torrent") setSourceUrl("");
              if (nextSourceType !== "youtube") setYoutubeVideoId("");
              if (nextSourceType !== "local_p2p") {
                setLocalFile(null);
                setLocalCompatibilityWarning(null);
              }
            }}
          >
            <option value="auto">{t("sourceTypes.auto")}</option>
            <option value="youtube">{t("sourceTypes.youtube")}</option>
            <option value="mp4">{t("sourceTypes.mp4")}</option>
            <option value="hls">{t("sourceTypes.hls")}</option>
            <option value="torrent">{t("sourceTypes.torrent")}</option>
            <option value="local_p2p">{t("sourceTypes.localP2p")}</option>
          </select>
        </Field>
        {sourceType === "local_p2p" ? (
          <div className="tt-p2p-picker">
            <p className="tt-secondary">{t("localHelp")}</p>
            <label className="tt-file-picker">
              <span>{t("chooseVideo")}</span>
              <input
                type="file"
                aria-label={t("chooseVideo")}
                accept="video/*,.mp4,.m4v,.webm,.mov,.mkv,.ogv"
                onChange={(event) => selectLocalFile(event.target.files?.[0])}
                required={!localFile}
              />
            </label>
            {localFile ? (
              <p className="tt-secondary">
                {localFile.name} · {(localFile.size / 1_048_576).toFixed(1)} MB
              </p>
            ) : null}
            {localCompatibilityWarning ? <p className="tt-inline-warning" role="status">{localCompatibilityWarning}</p> : null}
            <p className="tt-secondary" role="status">{localP2pStatusLabel()}</p>
          </div>
        ) : sourceType === "torrent" ? (
          <div className="tt-form" aria-label={t("torrentKind")}>
            <fieldset className="tt-fieldset">
              <legend>{t("torrentKind")}</legend>
              <label className="tt-inline-cluster">
                <input type="radio" name="torrent-kind" checked={torrentInputKind === "magnet"} onChange={() => { setTorrentInputKind("magnet"); setInspection(null); }} />
                <span>{t("torrentKinds.magnet")}</span>
              </label>
              <label className="tt-inline-cluster">
                <input type="radio" name="torrent-kind" checked={torrentInputKind === "torrent_file"} onChange={() => { setTorrentInputKind("torrent_file"); setInspection(null); }} />
                <span>{t("torrentKinds.file")}</span>
              </label>
            </fieldset>
            {torrentInputKind === "magnet" ? (
              <Field label={t("magnetLabel")} htmlFor="media-magnet-uri" help={t("magnetHelp")}>
                <textarea
                  id="media-magnet-uri"
                  className="tt-textarea"
                  dir="ltr"
                  spellCheck={false}
                  rows={3}
                  value={magnetUri}
                  onChange={(event) => {
                    setMagnetUri(event.target.value);
                    setInspection(null);
                    setSelectedVideoIndex(null);
                    setInspectionStatus(null);
                    setInspectionError(null);
                  }}
                  placeholder={t("magnetPlaceholder")}
                  required={!inspection}
                />
              </Field>
            ) : (
              <Field label={t("torrentFileLabel")} htmlFor="media-torrent-file" help={t("torrentFileHelp")}>
                <input id="media-torrent-file" type="file" accept=".torrent,application/x-bittorrent,application/octet-stream" onChange={(event) => { setTorrentFile(event.target.files?.[0] ?? null); setInspection(null); }} required={!inspection && item?.source_type !== "torrent"} />
              </Field>
            )}
            {torrentInputKind === "torrent_file" ? (
              <Button
                type="button"
                variant="secondary"
                loading={inspectionBusy}
                onClick={() => void inspect()}
                disabled={inspectionBusy || !torrentFile}
              >
                {t("inspect")}
              </Button>
            ) : null}
            {inspectionStatus ? <div className="tt-secondary" role="status">{inspectionStatus}</div> : null}
            {inspectionError ? <div className="tt-inline-error" role="alert">{inspectionError}</div> : null}
            {videoCandidates.length > 0 && !autoselectInspection ? (
              <fieldset className="tt-fieldset">
                <legend>{t("videoFile")}</legend>
                {videoCandidates.map((file: TorrentManifestFile) => (
                  <label key={file.index} className="tt-torrent-file-option">
                    <input type="radio" name="torrent-video" checked={selectedVideoIndex === file.index} onChange={() => { setSelectedVideoIndex(file.index); setSelectedSubtitleIndexes(defaultSubtitleFileIndexes(file, inspection?.files ?? [])); }} />
                    <span><strong>{file.name}</strong><small>{file.path} - {(file.sizeBytes / 1024 / 1024).toFixed(1)} MiB</small></span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            {selectedVideo && subtitleCandidates.length === 0 && !autoselectInspection ? <p className="tt-secondary">{t("noSubtitlesFound")}</p> : null}
            {subtitleCandidates.length > 0 ? (
              <fieldset className="tt-fieldset">
                <legend>{t("importSubtitles")}</legend>
                {subtitleCandidates.map((candidate) => (
                  <label key={candidate.file.index} className="tt-torrent-file-option">
                    <input type="checkbox" checked={selectedSubtitleIndexes.has(candidate.file.index)} onChange={(event) => setSelectedSubtitleIndexes((current) => { const next = new Set(current); if (event.target.checked) next.add(candidate.file.index); else next.delete(candidate.file.index); return next; })} />
                    <span><strong>{candidate.label}</strong><small>{candidate.file.path}</small></span>
                  </label>
                ))}
              </fieldset>
            ) : null}
          </div>
        ) : sourceType === "youtube" ? (
          <Field
            label={t("youtubeLabel")}
            htmlFor="media-youtube-id"
            help={t("youtubeHelp")}
          >
            <Input
              id="media-youtube-id"
              dir="ltr"
              spellCheck={false}
              value={youtubeVideoId}
              onChange={(event) => setYoutubeVideoId(event.target.value)}
              placeholder={t("youtubePlaceholder")}
              aria-describedby={error ? "media-form-error" : undefined}
              required
            />
          </Field>
        ) : (
          <Field
            label={t("urlLabel")}
            htmlFor="media-url"
            help={t("urlHelp")}
          >
            <Input
              id="media-url"
              type="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder={t("urlPlaceholder")}
              aria-describedby={error ? "media-form-error" : undefined}
              required
            />
          </Field>
        )}
        {!item ? (
          <label className="tt-inline-cluster" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={playNow}
              onChange={(event) => setPlayNow(event.target.checked)}
            />
            <span>{t("playImmediately")}</span>
          </label>
        ) : null}
        {error ? (
          <div id="media-form-error" className="tt-inline-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="tt-form-actions">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={
              (sourceType === "torrent" && !torrentSubmitReady) ||
              (sourceType === "local_p2p" && (!localFile || Boolean(item)))
            }
          >
            {sourceType === "local_p2p"
              ? t("startP2p")
              : item
                ? t("save")
                : playNow
                  ? t("playNow")
                  : t("addToQueue")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
