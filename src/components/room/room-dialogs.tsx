"use client";

import { Copy, FileText, Trash2, Upload } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { MediaItemInput, MediaSourceType } from "@/lib/media/media-queue-service";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
import type { SubtitleMetadata } from "@/lib/subtitles/subtitle-service";
import { Button, Dialog, Field, Input } from "../ui/primitives";

type QueueItem = RoomSnapshot["queue"][number];

export function MediaDialog({
  open,
  onOpenChange,
  item,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: QueueItem | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: MediaItemInput, playNow: boolean) => Promise<void>;
}) {
  if (!open) return null;
  return (
    <MediaDialogContent
      key={item?.id ?? "new"}
      open={open}
      onOpenChange={onOpenChange}
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
  item,
  submitting,
  error,
  onSubmit,
}: Parameters<typeof MediaDialog>[0]) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [sourceUrl, setSourceUrl] = useState(item?.source_url ?? "");
  const [sourceType, setSourceType] = useState<MediaSourceType>(item?.source_type ?? "auto");
  const [playNow, setPlayNow] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ title, sourceUrl, sourceType }, playNow);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "Edit Media" : "Add Media"}
      description="Tonight TV plays direct MP4 or HLS sources in your browser."
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
            required
          />
        </Field>
        <Field label="Source Type" htmlFor="media-source-type">
          <select
            id="media-source-type"
            className="tt-select"
            value={sourceType}
            onChange={(event) => setSourceType(event.target.value as MediaSourceType)}
          >
            <option value="auto">Auto</option>
            <option value="mp4">MP4</option>
            <option value="hls">HLS</option>
          </select>
        </Field>
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
          <div className="tt-inline-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="tt-form-actions">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
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
