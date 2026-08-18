"use client";

import { Copy } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button, Dialog, Field, Input } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import type { RoomSnapshot } from "@/lib/rooms/room-service";

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
  const t = useTranslations("room.settingsDialog");
  const tCommon = useTranslations("common");
  const [name, setName] = useState(snapshot.room.name);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onRename(name);
  }

  const roomLink =
    typeof window === "undefined"
      ? `/r/${snapshot.room.id}`
      : `${window.location.origin}/r/${snapshot.room.id}`;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
    >
      <form className="tt-form" onSubmit={submit}>
        <Field label={t("name")} htmlFor="settings-room-name">
          <Input
            id="settings-room-name"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        <Field label={t("link")} htmlFor="settings-room-link" help={t("linkHelp")}>
          <div className="tt-inline-cluster" style={{ gap: 6 }}>
            <Input id="settings-room-link" value={roomLink} readOnly />
            <Button type="button" variant="primary" onClick={() => void onCopy()}>
              <Copy size={17} aria-hidden />
              <span className="tt-button-label">{t("copyLink")}</span>
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
            {tCommon("cancel")}
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {tCommon("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
