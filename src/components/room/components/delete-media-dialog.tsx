"use client";

import { Trash2 } from "lucide-react";
import { memo } from "react";

import { Button, Dialog } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import type { RoomSnapshot } from "@/lib/rooms/room-service";

type QueueItem = RoomSnapshot["queue"][number];

/**
 * Confirmation dialog for removing a media item from the room queue. The
 * host (URL/YouTube/torrent) is left untouched — only the queue row is
 * removed.
 */
export const DeleteMediaDialog = memo(function DeleteMediaDialog({
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
  const t = useTranslations("room.deleteMediaDialog");
  const tCommon = useTranslations("common");
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("title")}
      description={t("description")}
    >
      <div className="tt-form">
        <p className="tt-secondary">
          {t("body", { title: item?.title ?? "" })}
        </p>
        <div className="tt-form-actions">
          <Button variant="ghost" onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button variant="danger" loading={deleting} onClick={() => void onConfirm()}>
            <Trash2 size={17} aria-hidden />
            <span className="tt-button-label">{t("confirm")}</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
});
