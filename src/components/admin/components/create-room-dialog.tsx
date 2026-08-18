"use client";

import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button, Dialog, Field, Input } from "@/components/primitives";
import { useTranslations } from "@/i18n";

/**
 * The "Create a private room" dialog. Calls `onCreate(name)`; the parent
 * owns the navigation and the actual `createRoom` RPC. Submitting puts
 * the dialog into a busy state and surfaces server-side errors inline.
 */
export function CreateRoomDialog({
  open,
  busy,
  error,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<void> | void;
}) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const [name, setName] = useState("");

  function reset() {
    setName("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    await onCreate(name);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
      title={t("createDialog.title")}
      description={t("createDialog.description")}
    >
      <form className="tt-form" onSubmit={submit}>
        <Field
          label={t("createDialog.name")}
          htmlFor="create-room-name"
          help={t("createDialog.nameHelp")}
        >
          <Input
            id="create-room-name"
            autoFocus
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("createDialog.namePlaceholder")}
            required
          />
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
          <Button type="submit" variant="primary" loading={busy}>
            <Plus size={17} aria-hidden />
            <span className="tt-button-label">{t("createDialog.submit")}</span>
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
