"use client";

import {
  ArchiveRestore,
  ArrowRight,
  CalendarClock,
  CircleDot,
  EllipsisVertical,
  Eye,
  EyeOff,
  Hash,
  Hourglass,
  Link2,
  PlayCircle,
  Plus,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { Button, cx } from "@/components/primitives";
import type { OwnedRoomListItem } from "@/lib/rooms/room-service";
import { useLocale, useTranslations } from "@/i18n";
import { formatDate, formatRelative, roomStatusLabel } from "./formatters";
import { RoomArtwork, pickRoomAccent } from "./room-artwork";

/* ---------- Action menu (per card) ---------- */

function RoomActionMenu({
  room,
  isActive,
  onClose,
  onCopy,
  onDeactivate,
  onReactivate,
  onDelete,
}: {
  room: OwnedRoomListItem;
  isActive: boolean;
  onClose: () => void;
  onCopy: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("admin.card");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="tt-room-card-menu-pop" role="menu" aria-label={t("manage", { name: room.name })}>
      <div className="tt-room-card-menu-label">{room.name}</div>
      <button
        type="button"
        role="menuitem"
        className="tt-room-card-menu-item"
        onClick={() => {
          onCopy();
          onClose();
        }}
      >
        <Link2 size={14} aria-hidden /> {t("copyLink")}
      </button>
      {isActive ? (
        <button
          type="button"
          role="menuitem"
          className="tt-room-card-menu-item"
          onClick={() => {
            onDeactivate();
            onClose();
          }}
        >
          <EyeOff size={14} aria-hidden /> {t("deactivate")}
        </button>
      ) : (
        <button
          type="button"
          role="menuitem"
          className="tt-room-card-menu-item"
          onClick={() => {
            onReactivate();
            onClose();
          }}
        >
          <Eye size={14} aria-hidden /> {t("reactivate")}
        </button>
      )}
      <div className="tt-room-card-menu-divider" aria-hidden />
      <button
        type="button"
        role="menuitem"
        className="tt-room-card-menu-item tt-room-card-menu-item-destructive"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        <ArchiveRestore size={14} aria-hidden /> {t("delete")}
      </button>
    </div>
  );
}

/* ---------- The card ---------- */

export type RoomCardProps = {
  room: OwnedRoomListItem;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onOpen: () => void;
  onCopy: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDelete: () => void;
};

/**
 * Single room card. Memoized so the grid only re-renders the cards that
 * actually changed when filters, the search query, or the room list mutates.
 */
export const RoomCard = memo(function RoomCard({
  room,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onOpen,
  onCopy,
  onDeactivate,
  onReactivate,
  onDelete,
}: RoomCardProps) {
  const t = useTranslations("admin.card");
  const { locale } = useLocale();
  const isActive = room.status === "active";
  const accent = pickRoomAccent(room.name);
  const [expanded, setExpanded] = useState(false);

  return (
    <article className={cx("tt-room-card", !isActive && "tt-room-card-deactivated")}>
      <div className="tt-room-card-head">
        <div className={cx("tt-room-card-art", accent)} aria-hidden>
          <RoomArtwork name={room.name} size={26} />
        </div>
        <div className="tt-room-card-title">
          <h3 title={room.name}>{room.name}</h3>
          <small>
            <Hash size={11} aria-hidden style={{ verticalAlign: -1, marginInlineEnd: 2 }} />
            <code>{room.id.slice(0, 8)}</code>
          </small>
        </div>
        <div className="tt-room-card-menu">
          <button
            type="button"
            className="tt-room-card-menu-trigger"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t("manage", { name: room.name })}
            onClick={onToggleMenu}
          >
            <EllipsisVertical size={18} aria-hidden />
          </button>
          {menuOpen ? (
            <RoomActionMenu
              room={room}
              isActive={isActive}
              onClose={onCloseMenu}
              onCopy={onCopy}
              onDeactivate={onDeactivate}
              onReactivate={onReactivate}
              onDelete={onDelete}
            />
          ) : null}
        </div>
      </div>

      <div className="tt-room-card-meta">
        <span title={formatDate(room.created_at, locale)}>
          <CalendarClock size={12} aria-hidden /> {t("created", { date: formatDate(room.created_at, locale) })}
        </span>
        <span title={new Date(room.updated_at).toLocaleString()}>
          <CircleDot size={12} aria-hidden /> {t("updated", { when: formatRelative(room.updated_at, locale) })}
        </span>
        <span
          className={cx(
            "tt-status-room",
            isActive ? "tt-status-room-active" : "tt-status-room-deactivated",
          )}
        >
          {roomStatusLabel(room.status)}
        </span>
        {!isActive && room.deactivated_at ? (
          <span title={new Date(room.deactivated_at).toLocaleString()}>
            <Hourglass size={12} aria-hidden /> {t("offSince", { date: formatDate(room.deactivated_at, locale) })}
          </span>
        ) : null}
      </div>

      {expanded ? (
        <div className="tt-room-card-meta" style={{ marginTop: -4 }}>
          <span className="tt-room-id-full" style={{ color: "var(--tt-text-muted)", fontFamily: "var(--tt-font, 'Inter'), ui-monospace, monospace", fontSize: 11 }}>
            <Hash size={11} aria-hidden style={{ verticalAlign: -1, marginInlineEnd: 2 }} />
            {room.id}
          </span>
        </div>
      ) : null}

      <div className="tt-room-card-actions">
        {isActive ? (
          <Button onClick={onOpen} variant="primary">
            <span className="tt-button-label">{t("open")}</span>
            <ArrowRight size={17} aria-hidden className="tt-icon-mirror" />
          </Button>
        ) : (
          <Button onClick={onReactivate} variant="primary">
            <ArchiveRestore size={17} aria-hidden />
            <span className="tt-button-label">{t("reactivate")}</span>
          </Button>
        )}
        <Button variant="ghost" onClick={onCopy} aria-label={t("copyLink")}>
          <Link2 size={17} aria-hidden />
          <span className="tt-button-label">{t("share")}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((value) => !value)}
          aria-label={t("expandedAria")}
        >
          <Hash size={14} aria-hidden />
        </Button>
      </div>

      {/* Hidden hook so callers can inject per-card overlays if needed later */}
      <span style={{ display: "none" }} data-room-status={room.status} data-room-accent={accent} />
    </article>
  );
});

/* ---------- Empty state ---------- */

export function AdminEmptyState({ onCreate }: { onCreate: () => void }) {
  const t = useTranslations("admin.empty");
  const tAdmin = useTranslations("admin");
  return (
    <div
      className="tt-section-card tt-anim-fade-pop"
      style={{ alignItems: "center", padding: 48, textAlign: "center" }}
    >
      <div className="tt-empty-illustration" aria-hidden>
        <Plus size={28} />
      </div>
      <p className="tt-empty-block-eyebrow">{t("eyebrow")}</p>
      <h2 className="tt-section-title">{t("title")}</h2>
      <p className="tt-secondary" style={{ maxWidth: 460 }}>
        {t("body")}
      </p>
      <div className="tt-inline-cluster" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <Button variant="primary" size="lg" onClick={onCreate}>
          <Plus size={18} aria-hidden />
          <span className="tt-button-label">{tAdmin("createFirstRoom")}</span>
        </Button>
      </div>
      <p className="tt-help" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 }}>
        <PlayCircle size={12} aria-hidden style={{ color: "var(--tt-accent)" }} />
        {t("hint")}
      </p>
    </div>
  );
}
