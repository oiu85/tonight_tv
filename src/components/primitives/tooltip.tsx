"use client";

import { ChevronDown } from "lucide-react";
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { cx } from "./cx";

type TooltipContextValue = {
  show: (text: string, target: HTMLElement) => void;
  hide: () => void;
};
const TooltipContext = createContext<TooltipContextValue | null>(null);

type TooltipState = { text: string; x: number; y: number } | null;

/**
 * Global tooltip layer. A single floating tooltip is rendered at the top of
 * the tree; any element wired with `useTooltipProps` can publish a hint to
 * it on hover / focus. This avoids creating one portal per tooltip site.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TooltipState>(null);

  const value = useMemo<TooltipContextValue>(
    () => ({
      show: (text, target) => {
        const rect = target.getBoundingClientRect();
        setState({ text, x: rect.left + rect.width / 2, y: rect.top - 8 });
      },
      hide: () => setState(null),
    }),
    [],
  );

  return (
    <TooltipContext.Provider value={value}>
      {children}
      {state ? (
        <span
          className="tt-tooltip"
          role="tooltip"
          style={{ left: state.x, top: state.y, transform: "translate(-50%, -100%)" }}
        >
          {state.text}
        </span>
      ) : null}
    </TooltipContext.Provider>
  );
}

export function useTooltip(): TooltipContextValue {
  const ctx = useContext(TooltipContext);
  if (!ctx) return { show: () => undefined, hide: () => undefined };
  return ctx;
}

export function useTooltipProps(
  element: ReactElement<Record<string, unknown>>,
  text: string,
): ReactElement {
  const tooltip = useTooltip();
  if (!isValidElement(element)) return element;

  const props = element.props as Record<string, unknown>;
  const existingEnter = props["onPointerEnter"] as ((event: React.PointerEvent) => void) | undefined;
  const existingLeave = props["onPointerLeave"] as ((event: React.PointerEvent) => void) | undefined;
  const existingFocus = props["onFocus"] as ((event: React.FocusEvent) => void) | undefined;
  const existingBlur = props["onBlur"] as ((event: React.FocusEvent) => void) | undefined;

  return cloneElement(element, {
    onPointerEnter: (event: React.PointerEvent) => {
      existingEnter?.(event);
      tooltip.show(text, event.currentTarget as HTMLElement);
    },
    onPointerLeave: (event: React.PointerEvent) => {
      existingLeave?.(event);
      tooltip.hide();
    },
    onFocus: (event: React.FocusEvent) => {
      existingFocus?.(event);
      tooltip.show(text, event.currentTarget as HTMLElement);
    },
    onBlur: (event: React.FocusEvent) => {
      existingBlur?.(event);
      tooltip.hide();
    },
  });
}

/**
 * Inline disclosure / accordion used in the help dialog and admin
 * confirmation summaries.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      style={{ background: "var(--tt-surface-3)", borderRadius: "var(--tt-radius-md)" }}
    >
      <summary
        className="tt-button tt-button-ghost tt-button-sm"
        style={{ width: "100%", justifyContent: "space-between", cursor: "pointer" }}
      >
        <span>{summary}</span>
        <ChevronDown
          size={16}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
          aria-hidden
        />
      </summary>
      <div style={{ padding: "var(--space-3)" }}>{children}</div>
    </details>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="tt-visually-hidden">{children}</span>;
}

export { cx };
