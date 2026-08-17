"use client";

import { CircleHelp } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import type { HelpTopic } from "./help-dialog";
import { Button, IconButton } from "../ui/primitives";

// The help dialog pulls in dozens of icons and rich help content, so we load
// it lazily. The trigger stays eagerly rendered so the affordance is
// instantly interactive.
const HelpDialog = lazy(() =>
  import("./help-dialog").then((mod) => ({ default: mod.HelpDialog })),
);

function HelpDialogFallback() {
  // A non-blocking placeholder keeps the dialog portal reserved without
  // flashing layout. The portal only renders when open, so this is mostly
  // defensive for SSR consumers.
  return null;
}

export function HelpLauncher({
  topic = "welcome",
  variant = "icon",
  label = "Open help",
  size,
}: {
  topic?: HelpTopic;
  variant?: "icon" | "link";
  label?: string;
  size?: "sm" | "default" | "lg";
}) {
  const [open, setOpen] = useState(false);
  if (variant === "link") {
    return (
      <>
        <Button
          variant="ghost"
          size={size ?? "sm"}
          onClick={() => setOpen(true)}
          aria-label={label}
        >
          <CircleHelp size={15} aria-hidden />
          <span className="tt-button-label">{label}</span>
        </Button>
        {open ? (
          <Suspense fallback={<HelpDialogFallback />}>
            <HelpDialog open={open} onOpenChange={setOpen} initialPage={topic} />
          </Suspense>
        ) : null}
      </>
    );
  }
  return (
    <>
      <IconButton variant="ghost" label={label} onClick={() => setOpen(true)}>
        <CircleHelp size={18} aria-hidden />
      </IconButton>
      {open ? (
        <Suspense fallback={<HelpDialogFallback />}>
          <HelpDialog open={open} onOpenChange={setOpen} initialPage={topic} />
        </Suspense>
      ) : null}
    </>
  );
}
