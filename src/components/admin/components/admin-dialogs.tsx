"use client";

import { ArchiveRestore, Eye, EyeOff, ShieldOff, Trash2, type LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button, Dialog, Field, Input } from "@/components/primitives";
import type { OwnedRoomListItem } from "@/lib/rooms/room-service";
import { useLocale, useTranslations } from "@/i18n";
import { formatDate } from "./formatters";
import { RoomArtwork, pickRoomAccent } from "./room-artwork";

type DialogTone = "accent" | "warning" | "danger";

function useToneCopy(tone: DialogTone) {
  const t = useTranslations("admin");
  if (tone === "warning") {
    return {
      title: t("deactivateDialog.summaryHeadsUp"),
      body: t("deactivateDialog.summaryWarningBody"),
    };
  }
  if (tone === "danger") {
    return {
      title: t("deleteDialog.warningTitle"),
      body: t("deleteDialog.warningBody"),
    };
  }
  return {
    title: t("reactivateDialog.summaryConfirm"),
    body: t("reactivateDialog.info"),
  };
}

/**
 * Reusable confirmation dialog used for every admin workflow that has a
 * chance of surprising the user. `tone` controls the colour cues and
 * which button variant we use for the primary action.
 */
export function AdminConfirmDialog({
  open,
  busy,
  title,
  description,
  confirmLabel,
  confirmIcon,
  tone = "warning",
  children,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmIcon: LucideIcon;
  tone?: DialogTone;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("common");
  const ConfirmIcon = confirmIcon;
  const summary = useToneCopy(tone);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => (!value ? onCancel() : undefined)}
      title={title}
      description={description}
    >
      <div className="tt-confirm">
        {children}
        <div
          className={
            "tt-confirm-summary " +
            (tone === "warning" ? "tt-confirm-warning " : tone === "danger" ? "tt-confirm-danger " : "")
          }
        >
          <strong>{summary.title}</strong>
          <span>{summary.body}</span>
        </div>
        <div className="tt-form-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "danger" : "primary"}
            loading={busy}
            onClick={onConfirm}
          >
            <ConfirmIcon size={17} aria-hidden />
            <span className="tt-button-label">{confirmLabel}</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Compact card-style summary of the room being acted on. Used inside
 * confirmation dialogs so the user always sees exactly which room the
 * action targets.
 */
export function RoomActionSummary({
  room,
  tone = "accent",
}: {
  room: OwnedRoomListItem;
  tone?: "accent" | "warning" | "danger";
}) {
  const { locale } = useLocale();
  const t = useTranslations("admin");
  const accent = pickRoomAccent(room.name);
  const created = formatDate(room.created_at, locale);
  const offSince = formatDate(room.deactivated_at ?? null, locale);
  return (
    <div className={"tt-confirm-summary " + accent}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="tt-room-card-art" style={{ width: 44, height: 44, borderRadius: 12 }} aria-hidden>
          <RoomArtwork name={room.name} size={20} />
        </div>
        <div>
          <strong style={{ fontSize: 14 }}>{room.name}</strong>
          {room.deactivated_at ? (
            <div style={{ fontSize: 12, color: "var(--tt-text-muted)" }}>
              {t("card.offSince", { date: offSince })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--tt-text-muted)" }}>
              {t("card.created", { date: created })}
            </div>
          )}
        </div>
      </div>
      {tone === "warning" ? (
        <span className="tt-muted" style={{ fontSize: 11.5 }}>
          {t("deactivateDialog.warning")}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Hard-delete confirmation. We require the user to type the room name to
 * enable the destructive action — a small friction that prevents
 * accidental deletes.
 */
export function DeleteRoomDialog({
  room,
  busy,
  onCancel,
  onConfirm,
}: {
  room: OwnedRoomListItem | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const [confirmText, setConfirmText] = useState("");
  const open = room !== null;
  const canDelete = room !== null && confirmText.trim() === room.name;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          onCancel();
          setConfirmText("");
        }
      }}
      title={t("deleteDialog.title")}
      description={t("deleteDialog.description")}
    >
      <div className="tt-confirm">
        {room ? <RoomActionSummary room={room} tone="danger" /> : null}
        <div className="tt-confirm-summary tt-confirm-danger">
          <strong>{t("deleteDialog.warningTitle")}</strong>
          <span>{t("deleteDialog.warningBody")}</span>
        </div>
        <Field
          label={
            <>
              {t("deleteDialog.typeNameToConfirm", { name: room?.name ?? "" })}
            </>
          }
          htmlFor="delete-confirm"
        >
          <Input
            id="delete-confirm"
            autoFocus
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={t("deleteDialog.placeholder")}
          />
        </Field>
        <span className="tt-help">{t("deleteDialog.typeToEnable")}</span>
        <div className="tt-form-actions">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onCancel();
              setConfirmText("");
            }}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={busy}
            disabled={!canDelete}
            onClick={() => {
              onConfirm();
              setConfirmText("");
            }}
          >
            <Trash2 size={17} aria-hidden />
            <span className="tt-button-label">{t("deleteDialog.confirm")}</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- Re-exports of the standard icon mappings ---------- */

export const LIFECYCLE_ICONS = {
  deactivate: ShieldOff,
  reactivate: ArchiveRestore,
  hide: EyeOff,
  show: Eye,
  delete: Trash2,
} as const;
