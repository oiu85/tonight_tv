"use client";

import { FileText, Trash2, Upload } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button, Dialog, Field, Input } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import type { SubtitleMetadata } from "@/lib/subtitles/subtitle-service";
import type { RoomSnapshot } from "@/lib/rooms/room-service";

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
  const t = useTranslations("room.subtitlesDialog");
  const tCommon = useTranslations("common");
  const [label, setLabel] = useState("");
  const [languageCode, setLanguageCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (!file) {
      setLocalError(t("noFile"));
      return;
    }
    if (file.size > 1024 * 1024) {
      setLocalError(t("tooLarge"));
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
      title={t("title")}
      description={t("description")}
    >
      {!snapshot.current_media ? (
        <div className="tt-inline-warning">{t("noCurrentMedia")}</div>
      ) : (
        <>
          <form className="tt-form" onSubmit={submit}>
            <Field label={t("label")} htmlFor="sub-label">
              <Input
                id="sub-label"
                value={label}
                maxLength={100}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t("labelPlaceholder")}
                required
              />
            </Field>
            <Field label={t("lang")} htmlFor="sub-lang">
              <Input
                id="sub-lang"
                dir="ltr"
                spellCheck={false}
                value={languageCode}
                maxLength={35}
                onChange={(event) => setLanguageCode(event.target.value)}
                placeholder={t("langPlaceholder")}
              />
            </Field>
            <Field
              label={t("file")}
              htmlFor="sub-file"
              help={t("fileHelp")}
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
                {t("reset")}
              </Button>
              <Button type="submit" variant="primary" loading={uploading} disabled={!file}>
                <Upload size={17} aria-hidden />
                <span className="tt-button-label">{t("upload")}</span>
              </Button>
            </div>
          </form>

          <div className="tt-subtitle-list">
            {snapshot.subtitles.length === 0 ? (
              <div className="tt-empty-block">
                <FileText size={24} aria-hidden />
                <h3 className="tt-section-title">{t("emptyTitle")}</h3>
                <p>{t("emptyBody")}</p>
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
                      <span>{subtitle.language_code || tCommon("none")}</span>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void onDelete(metadata)}
                      aria-label={`${t("delete")}: ${subtitle.label}`}
                    >
                      <Trash2 size={16} aria-hidden />
                      <span className="tt-button-label">{t("delete")}</span>
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
