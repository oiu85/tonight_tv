"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./button";
import { cx } from "./cx";

/**
 * Native HTML <dialog> wrapped with a focus-managed API.
 *
 * The dialog portal is managed by the browser (top-layer). The component:
 *   - Opens / closes the dialog based on the `open` prop.
 *   - Restores focus to the trigger that opened it.
 *   - Auto-focuses the first focusable element when shown.
 *   - Routes backdrop clicks and Esc presses back to onOpenChange(false).
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastFocused = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      lastFocused.current = document.activeElement;
      dialog.showModal();
      // Defer focus to the next paint so the dialog has been promoted to the
      // top layer and autofocus candidates are actually focusable.
      requestAnimationFrame(() => {
        const focusable = dialog.querySelector<HTMLElement>(
          "input, select, textarea, button, [tabindex]:not([tabindex='-1'])",
        );
        focusable?.focus();
      });
    } else if (!open && dialog.open) {
      dialog.close();
      if (lastFocused.current instanceof HTMLElement) lastFocused.current.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={cx("tt-dialog", className)}
      aria-label={title}
      aria-describedby={description ? `${title}-desc` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClose={() => onOpenChange(false)}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="tt-dialog-header">
        <div>
          <h2>{title}</h2>
          {description ? (
            <p id={`${title}-desc`} className="tt-muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
              {description}
            </p>
          ) : null}
        </div>
        <IconButton variant="ghost" label="Close dialog" onClick={() => onOpenChange(false)}>
          <X size={19} />
        </IconButton>
      </div>
      <div className="tt-dialog-body">{children}</div>
    </dialog>
  );
}
