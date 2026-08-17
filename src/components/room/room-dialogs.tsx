"use client";

import { Copy, FileText, Trash2, Upload } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { MediaItemInput, MediaSourceType } from "@/lib/media/media-queue-service";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
import type { SubtitleMetadata } from "@/lib/subtitles/subtitle-service";
import { inspectTorrent } from "@/lib/torrent/torrent-client";
import {
  rankSubtitleCandidates,
  rankVideoCandidates,
  type SubtitleCandidate,
} from "@/lib/torrent/torrent-manifest";
import type {
  TorrentInspection,
  TorrentManifestFile,
} from "@/lib/torrent/torrent-contracts";
import { Button, Dialog, Field, Input } from "../ui/primitives";

type QueueItem = RoomSnapshot["queue"][number];

export function MediaDialog({
  open,
  onOpenChange,
  roomId,
  item,
  submitting,
  error,
  onSubmit,
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
}) {
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
}: Parameters<typeof MediaDialog>[0]) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [sourceUrl, setSourceUrl] = useState(item?.source_url ?? "");
  const [youtubeVideoId, setYoutubeVideoId] = useState(item?.youtube_video_id ?? "");
  const [sourceType, setSourceType] = useState<MediaSourceType>(item?.source_type ?? "auto");
  const [playNow, setPlayNow] = useState(false);
  const [torrentInputKind, setTorrentInputKind] = useState<"magnet" | "torrent_file">(
    item?.torrent_input_kind ?? "magnet",
  );
  const [magnetUri, setMagnetUri] = useState("");
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
    () => selectedVideo ? rankSubtitleCandidates(selectedVideo, inspection?.files ?? []) : [],
    [inspection, selectedVideo],
  );

  async function inspect() {
    const generation = ++inspectionGeneration.current;
    inspectionAbort.current?.abort();
    const abort = new AbortController();
    inspectionAbort.current = abort;
    setInspection(null);
    setSelectedVideoIndex(null);
    setSelectedSubtitleIndexes(new Set());
    setInspectionError(null);
    setInspectionStatus("Retrieving torrent metadata...");
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
      if (candidates.length === 0) {
        setInspectionError("No playable video files were found in this torrent.");
      } else if (candidates.length === 1) {
        setSelectedVideoIndex(candidates[0].index);
      }
      setInspectionStatus("Ready");
    } catch (cause) {
      if (abort.signal.aborted || generation !== inspectionGeneration.current) return;
      setInspectionError(cause instanceof Error ? cause.message : "Torrent inspection failed.");
      setInspectionStatus(null);
    } finally {
      if (inspectionAbort.current === abort) inspectionAbort.current = null;
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sourceType === "torrent") {
      if (!inspection || !selectedVideo) {
        setInspectionError("Inspect the torrent and select one video file first.");
        return;
      }
      await onSubmit({
        title,
        sourceType: "torrent",
        torrent: {
          infoHash: inspection.infoHash,
          inputKind: torrentInputKind,
          magnetUri: magnetUri || null,
          metadataFile: torrentFile,
          torrentName: inspection.torrentName,
          fileIndex: selectedVideo.index,
          filePath: selectedVideo.path,
          fileName: selectedVideo.name,
          fileSize: selectedVideo.sizeBytes,
        },
      }, playNow, subtitleCandidates.filter((candidate) => selectedSubtitleIndexes.has(candidate.file.index)));
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

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "Edit Media" : "Add Media"}
      description="Add a direct MP4/HLS source, YouTube Video ID, or inspected Torrent file."
    >
      <form className="tt-form" onSubmit={submit}>
        <Field label="Title" htmlFor="media-title">
          <Input
            id="media-title"
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Program title"
            required
          />
        </Field>
        <Field label="Source Type" htmlFor="media-source-type">
          <select
            id="media-source-type"
            className="tt-select"
            value={sourceType}
            onChange={(event) => {
              const nextSourceType = event.target.value as MediaSourceType;
              setSourceType(nextSourceType);
              if (nextSourceType === "youtube" || nextSourceType === "torrent") setSourceUrl("");
              if (nextSourceType !== "youtube") setYoutubeVideoId("");
            }}
          >
            <option value="auto">Auto</option>
            <option value="mp4">MP4</option>
            <option value="hls">HLS</option>
            <option value="youtube">YouTube</option>
            <option value="torrent">Torrent</option>
          </select>
        </Field>
        {sourceType === "torrent" ? (
          <div className="tt-form" aria-label="Torrent source">
            <fieldset className="tt-fieldset">
              <legend>Torrent source</legend>
              <label className="tt-inline-cluster">
                <input type="radio" name="torrent-kind" checked={torrentInputKind === "magnet"} onChange={() => { setTorrentInputKind("magnet"); setInspection(null); }} />
                <span>Magnet URI</span>
              </label>
              <label className="tt-inline-cluster">
                <input type="radio" name="torrent-kind" checked={torrentInputKind === "torrent_file"} onChange={() => { setTorrentInputKind("torrent_file"); setInspection(null); }} />
                <span>Upload .torrent</span>
              </label>
            </fieldset>
            {torrentInputKind === "magnet" ? (
              <Field label="Magnet URI" htmlFor="media-magnet-uri">
                <Input id="media-magnet-uri" value={magnetUri} onChange={(event) => { setMagnetUri(event.target.value); setInspection(null); }} placeholder="magnet:?xt=urn:btih:..." required={!inspection} />
              </Field>
            ) : (
              <Field label=".torrent file" htmlFor="media-torrent-file" help="Torrent metadata only, maximum 2 MiB.">
                <input id="media-torrent-file" type="file" accept=".torrent,application/x-bittorrent,application/octet-stream" onChange={(event) => { setTorrentFile(event.target.files?.[0] ?? null); setInspection(null); }} required={!inspection && item?.source_type !== "torrent"} />
              </Field>
            )}
            <Button type="button" variant="secondary" onClick={() => void inspect()} disabled={torrentInputKind === "magnet" ? magnetUri.trim().length === 0 : !torrentFile}>
              Inspect Torrent
            </Button>
            {inspectionStatus ? <div className="tt-secondary" role="status">{inspectionStatus}</div> : null}
            {inspectionError ? <div className="tt-inline-error" role="alert">{inspectionError}</div> : null}
            {videoCandidates.length > 0 ? (
              <fieldset className="tt-fieldset">
                <legend>Video file</legend>
                {videoCandidates.map((file: TorrentManifestFile) => (
                  <label key={file.index} className="tt-torrent-file-option">
                    <input type="radio" name="torrent-video" checked={selectedVideoIndex === file.index} onChange={() => { setSelectedVideoIndex(file.index); setSelectedSubtitleIndexes(new Set()); }} />
                    <span><strong>{file.name}</strong><small>{file.path} - {(file.sizeBytes / 1024 / 1024).toFixed(1)} MiB</small></span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            {selectedVideo && subtitleCandidates.length === 0 ? <p className="tt-secondary">No subtitle files found.</p> : null}
            {subtitleCandidates.length > 0 ? (
              <fieldset className="tt-fieldset">
                <legend>Import subtitles (optional)</legend>
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
            label="YouTube Video ID"
            htmlFor="media-youtube-id"
            help="Enter only the 11-character Video ID, for example dQw4w9WgXcQ."
          >
            <Input
              id="media-youtube-id"
              value={youtubeVideoId}
              onChange={(event) => setYoutubeVideoId(event.target.value)}
              placeholder="dQw4w9WgXcQ"
              minLength={11}
              maxLength={11}
              pattern="[A-Za-z0-9_-]{11}"
              aria-describedby={error ? "media-form-error" : undefined}
              required
            />
          </Field>
        ) : (
          <Field
            label="Video URL"
            htmlFor="media-url"
            help="Use a direct, browser-playable MP4 or HLS (.m3u8) URL. Watch-page links, protected sources, and DRM streams are not resolved by Tonight TV."
          >
            <Input
              id="media-url"
              type="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://media.example/program.mp4"
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
            <span>Play immediately after adding</span>
          </label>
        ) : null}
        {error ? (
          <div id="media-form-error" className="tt-inline-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="tt-form-actions">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} disabled={sourceType === "torrent" && (!inspection || !selectedVideo)}>
            {item ? "Save Changes" : playNow ? "Play Now" : "Add to Queue"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function SubtitleManagerDialog({
  open,
  onOpenChange,
  snapshot,
  uploading,
  error,
  onUpload,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: RoomSnapshot;
  uploading: boolean;
  error: string | null;
  onUpload: (input: { label: string; languageCode: string; file: File }) => Promise<void>;
  onDelete: (subtitle: SubtitleMetadata) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [languageCode, setLanguageCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (!file) {
      setLocalError("Choose an SRT or VTT file first.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setLocalError("Subtitle files must be 1 MiB or smaller.");
      return;
    }
    await onUpload({ label, languageCode, file });
    setLabel("");
    setLanguageCode("");
    setFile(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Subtitle Manager"
      description="Subtitle tracks are private to this room and only loaded for the user that picks them."
    >
      {!snapshot.current_media ? (
        <div className="tt-inline-warning">Select a current media item before managing subtitles.</div>
      ) : (
        <>
          <form className="tt-form" onSubmit={submit}>
            <Field label="Label" htmlFor="sub-label">
              <Input
                id="sub-label"
                value={label}
                maxLength={100}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Arabic"
                required
              />
            </Field>
            <Field label="Language code (optional)" htmlFor="sub-lang">
              <Input
                id="sub-lang"
                value={languageCode}
                maxLength={35}
                onChange={(event) => setLanguageCode(event.target.value)}
                placeholder="ar"
              />
            </Field>
            <Field
              label="SRT or VTT file"
              htmlFor="sub-file"
              help="SRT files are converted locally to WebVTT before private upload."
            >
              <input
                id="sub-file"
                className="tt-input"
                type="file"
                accept=".srt,.vtt,text/vtt,application/x-subrip"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
              />
            </Field>
            {localError ? (
              <div className="tt-inline-error" role="alert">
                {localError}
              </div>
            ) : null}
            {error ? (
              <div className="tt-inline-error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="tt-form-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFile(null);
                  setLabel("");
                  setLanguageCode("");
                  setLocalError(null);
                }}
              >
                Reset
              </Button>
              <Button type="submit" variant="primary" loading={uploading} disabled={!file}>
                <Upload size={17} aria-hidden />
                <span className="tt-button-label">Upload</span>
              </Button>
            </div>
          </form>
          <div className="tt-subtitle-list">
            {snapshot.subtitles.length === 0 ? (
              <div className="tt-empty-block">
                <FileText size={24} aria-hidden />
                <h3 className="tt-section-title">No subtitle tracks yet.</h3>
                <p>Upload an SRT or VTT file above.</p>
              </div>
            ) : (
              snapshot.subtitles.map((subtitle) => {
                const metadata: SubtitleMetadata = {
                  ...subtitle,
                  room_id: snapshot.room.id,
                  created_by: snapshot.room.owner_user_id,
                };
                return (
                  <div className="tt-subtitle-row" key={subtitle.id}>
                    <div>
                      <strong>{subtitle.label}</strong>
                      <span>{subtitle.language_code || "Language not specified"}</span>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void onDelete(metadata)}
                      aria-label={`Delete ${subtitle.label}`}
                    >
                      <Trash2 size={16} aria-hidden />
                      <span className="tt-button-label">Delete</span>
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}

export function RoomSettingsDialog({
  open,
  onOpenChange,
  snapshot,
  saving,
  error,
  onRename,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: RoomSnapshot;
  saving: boolean;
  error: string | null;
  onRename: (name: string) => Promise<void>;
  onCopy: () => Promise<void>;
}) {
  if (!open) return null;
  return (
    <RoomSettingsDialogContent
      open={open}
      onOpenChange={onOpenChange}
      snapshot={snapshot}
      saving={saving}
      error={error}
      onRename={onRename}
      onCopy={onCopy}
    />
  );
}

function RoomSettingsDialogContent({
  open,
  onOpenChange,
  snapshot,
  saving,
  error,
  onRename,
  onCopy,
}: Parameters<typeof RoomSettingsDialog>[0]) {
  const [name, setName] = useState(snapshot.room.name);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onRename(name);
  }

  const roomLink =
    typeof window === "undefined" ? `/r/${snapshot.room.id}` : `${window.location.origin}/r/${snapshot.room.id}`;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Room Settings"
      description="Tonight TV keeps rooms private. The link itself is the only invite."
    >
      <form className="tt-form" onSubmit={submit}>
        <Field label="Room name" htmlFor="settings-room-name">
          <Input
            id="settings-room-name"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        <Field label="Room link" htmlFor="settings-room-link" help="Share this link with friends to let them join live.">
          <div className="tt-inline-cluster" style={{ gap: 6 }}>
            <Input id="settings-room-link" value={roomLink} readOnly />
            <Button type="button" variant="primary" onClick={() => void onCopy()}>
              <Copy size={17} aria-hidden />
              <span className="tt-button-label">Copy link</span>
            </Button>
          </div>
        </Field>
        {error ? (
          <div className="tt-inline-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="tt-form-actions">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function DeleteMediaDialog({
  item,
  onClose,
  deleting,
  onConfirm,
}: {
  item: QueueItem | null;
  onClose: () => void;
  deleting: boolean;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Delete media"
      description="This removes the item from the queue. The file on the media host is not affected."
    >
      <div className="tt-form">
        <p className="tt-secondary">
          Delete <strong>{item?.title}</strong> from this room queue?
        </p>
        <div className="tt-form-actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={deleting} onClick={() => void onConfirm()}>
            <Trash2 size={17} aria-hidden />
            <span className="tt-button-label">Delete</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
