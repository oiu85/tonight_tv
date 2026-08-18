"use client";

import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Film,
  Pencil,
  Play,
  Plus,
  Trash2,
  Tv2,
} from "lucide-react";
import { memo } from "react";

import { Button, IconButton } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import type { RoomSnapshot } from "@/lib/rooms/room-service";

type QueueItem = RoomSnapshot["queue"][number];

const QueueRow = memo(function QueueRow({
  item,
  isCurrent,
  label,
  isFirst,
  isLast,
  owner,
  onEdit,
  onRemove,
  onPlayNow,
  onMove,
  playNowLabel,
  moveUpLabel,
  moveDownLabel,
  editLabel,
  deleteLabel,
}: {
  item: QueueItem;
  isCurrent: boolean;
  label: string;
  isFirst: boolean;
  isLast: boolean;
  owner: boolean;
  onEdit: (item: QueueItem) => void;
  onRemove: (item: QueueItem) => void;
  onPlayNow: (item: QueueItem) => void;
  onMove: (item: QueueItem, direction: -1 | 1) => void;
  playNowLabel: string;
  moveUpLabel: string;
  moveDownLabel: string;
  editLabel: string;
  deleteLabel: string;
}) {
  return (
    <article className={`tt-queue-row ${isCurrent ? "tt-queue-row-current" : ""}`}>
      <span className="tt-media-fallback" aria-hidden>
        <Film size={20} />
      </span>
      <div className="tt-queue-copy">
        <strong title={item.title}>{item.title}</strong>
        <span>{label}</span>
      </div>
      {owner ? (
        <div className="tt-queue-actions">
          <IconButton size="sm" variant="ghost" label={playNowLabel} onClick={() => onPlayNow(item)}>
            <Play size={16} aria-hidden />
          </IconButton>
          <IconButton
            size="sm"
            variant="ghost"
            label={moveUpLabel}
            disabled={isFirst}
            onClick={() => onMove(item, -1)}
          >
            <ChevronUp size={16} aria-hidden />
          </IconButton>
          <IconButton
            size="sm"
            variant="ghost"
            label={moveDownLabel}
            disabled={isLast}
            onClick={() => onMove(item, 1)}
          >
            <ChevronDown size={16} aria-hidden />
          </IconButton>
          <IconButton size="sm" variant="ghost" label={editLabel} onClick={() => onEdit(item)}>
            <Pencil size={16} aria-hidden />
          </IconButton>
          <IconButton
            size="sm"
            variant="ghost"
            label={deleteLabel}
            disabled={isCurrent}
            onClick={() => onRemove(item)}
          >
            <Trash2 size={16} aria-hidden />
          </IconButton>
        </div>
      ) : null}
    </article>
  );
});

export const UpNextPanel = memo(function UpNextPanel({
  snapshot,
  onAdd,
  onEdit,
  onRemove,
  onPlayNow,
  onMove,
}: {
  snapshot: RoomSnapshot;
  onAdd: () => void;
  onEdit: (item: QueueItem) => void;
  onRemove: (item: QueueItem) => void;
  onPlayNow: (item: QueueItem) => void;
  onMove: (item: QueueItem, direction: -1 | 1) => void;
}) {
  const t = useTranslations("room.queue");
  const owner = snapshot.caller.is_owner;
  const queue = snapshot.queue;

  return (
    <section className="tt-queue" aria-label={t("title")}>
      <div className="tt-queue-toolbar">
        <div>
          <p className="tt-kicker">{t("kicker")}</p>
          <span className="tt-secondary" style={{ fontSize: 12 }}>
            {t("programs", { count: queue.length })}
          </span>
        </div>
        {owner ? (
          <Button size="sm" onClick={onAdd} aria-label={t("addMedia")}>
            <Plus size={16} aria-hidden />
            <span className="tt-button-label">{t("addMedia")}</span>
          </Button>
        ) : null}
      </div>

      <div className="tt-queue-list">
        {queue.length === 0 ? (
          <div className="tt-empty-block">
            <Tv2 size={28} aria-hidden />
            <p className="tt-empty-block-eyebrow">{t("emptyEyebrow")}</p>
            <h3 className="tt-section-title">{t("emptyTitle")}</h3>
            {owner ? (
              <Button variant="primary" onClick={onAdd}>
                <Plus size={16} aria-hidden />
                <span className="tt-button-label">{t("addMedia")}</span>
              </Button>
            ) : null}
          </div>
        ) : null}

        {queue.map((item, index) => {
          let label: string;
          if (item.id === snapshot.playback.current_media_id) {
            label = t("currentItem");
          } else if (index === 0 && !snapshot.current_media) {
            label = t("nextItem");
          } else {
            label = t("position", { position: index + 1 });
          }
          return (
            <QueueRow
              key={item.id}
              item={item}
              isCurrent={item.id === snapshot.playback.current_media_id}
              label={label}
              isFirst={index === 0}
              isLast={index === queue.length - 1}
              owner={owner}
              onEdit={onEdit}
              onRemove={onRemove}
              onPlayNow={onPlayNow}
              onMove={onMove}
              playNowLabel={t("playNow", { title: item.title })}
              moveUpLabel={t("moveUp", { title: item.title })}
              moveDownLabel={t("moveDown", { title: item.title })}
              editLabel={t("edit", { title: item.title })}
              deleteLabel={t("delete", { title: item.title })}
            />
          );
        })}
      </div>

      {owner && snapshot.playback.current_media_id ? (
        <div className="tt-queue-footer">
          <p className="tt-help" style={{ margin: 0, textAlign: "center" }}>
            {t("cannotDelete")}
            <ChevronRight size={12} style={{ verticalAlign: -1, marginInlineStart: 4 }} aria-hidden className="tt-icon-mirror" />
          </p>
        </div>
      ) : null}
    </section>
  );
});
