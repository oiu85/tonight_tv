"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cx } from "./cx";

type MenuContextValue = { close: () => void };
const MenuContext = createContext<MenuContextValue | null>(null);

/** Translate a logical or physical alignment into an inline style. */
function resolveAlignStyle(align: "right" | "left" | "end" | "start"): CSSProperties | undefined {
  if (align === "left" || align === "start") {
    return { insetInlineEnd: "auto", insetInlineStart: 0 };
  }
  if (align === "end") {
    return { insetInlineStart: "auto", insetInlineEnd: 0 };
  }
  return undefined;
}

/**
 * Floating menu with a render-prop trigger. The trigger is fully controlled
 * by the caller — `trigger({ open, toggle, isOpen })` — so the menu can
 * attach to any element (button, list item, etc.).
 *
 * Closes on outside pointer-down, Escape, or a click on any descendant
 * `button` (so menu items close themselves naturally).
 */
export function Menu({
  trigger,
  children,
  align = "right",
  label,
}: {
  trigger: (api: { open: () => void; toggle: () => void; isOpen: boolean }) => ReactNode;
  children: ReactNode;
  /** `right` / `left` (legacy) or `end` / `start` (logical, auto-mirrors in RTL). */
  align?: "right" | "left" | "end" | "start";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const value = useMemo(() => ({ close: () => setOpen(false) }), []);

  return (
    <MenuContext.Provider value={value}>
      <div className="tt-menu-wrap" ref={wrapRef}>
        {trigger({ open: () => setOpen(true), toggle: () => setOpen((v) => !v), isOpen: open })}
        {open ? (
          <div
            className="tt-menu"
            role="menu"
            aria-label={label}
            style={resolveAlignStyle(align)}
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest("button")) setOpen(false);
            }}
          >
            {children}
          </div>
        ) : null}
      </div>
    </MenuContext.Provider>
  );
}

export function MenuItem({
  children,
  onSelect,
  disabled,
  destructive,
}: {
  children: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const ctx = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      className={cx("tt-button", "tt-button-ghost", "tt-button-sm", destructive && "tt-button-danger")}
      onClick={() => {
        if (disabled) return;
        onSelect();
        ctx?.close();
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="tt-menu-title">{children}</div>;
}

export function MenuSeparator() {
  return <div className="tt-divider" style={{ margin: "6px 4px" }} />;
}
