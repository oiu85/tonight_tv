"use client";

import { CircleHelp } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Button, IconButton } from "@/components/primitives";
import { DEFAULT_HELP_TOPIC, type HelpTopic } from "./topics";

/**
 * Help trigger that lazy-loads the dialog. The dialog pulls in dozens of
 * icons and rich help content, so we keep the trigger eagerly rendered and
 * only load the rest on first open.
 */
const HelpDialog = lazy(() =>
  import("./dialog").then((mod) => ({ default: mod.HelpDialog })),
);

export function HelpLauncher({
  topic = DEFAULT_HELP_TOPIC,
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
          <Suspense fallback={null}>
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
        <Suspense fallback={null}>
          <HelpDialog open={open} onOpenChange={setOpen} initialPage={topic} />
        </Suspense>
      ) : null}
    </>
  );
}
