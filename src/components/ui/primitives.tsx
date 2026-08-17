"use client";

import { ChevronDown, X } from "lucide-react";
import {
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type DialogHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "soft";
  size?: "default" | "sm" | "lg";
  loading?: boolean;
  label?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "default", loading, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        "tt-button",
        variant === "primary" && "tt-button-primary",
        variant === "ghost" && "tt-button-ghost",
        variant === "danger" && "tt-button-danger",
        variant === "soft" && "tt-button-soft",
        size === "sm" && "tt-button-sm",
        size === "lg" && "tt-button-lg",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="tt-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});

export function IconButton({ label, children, ...props }: ButtonProps & { label: string; children: ReactNode }) {
  return (
    <Button
      className={cx("tt-icon-button", props.className)}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  );
}

export function Field({
  label,
  error,
  help,
  children,
  htmlFor,
}: {
  label: string;
  error?: string | null;
  help?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="tt-field" htmlFor={htmlFor}>
      <span className="tt-label">{label}</span>
      {children}
      {help ? <span className="tt-help">{help}</span> : null}
      {error ? <span className="tt-error-text" role="alert">{error}</span> : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cx("tt-input", className)} {...props} />;
});

export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "live" | "warning" | "danger" | "neutral" | "accent";
  children: ReactNode;
}) {
  return (
    <span className={cx("tt-status", `tt-status-${tone}`)}>
      <span className="tt-visually-hidden">Status: </span>
      {children}
    </span>
  );
}

export function ProgressMeter({
  value,
  max,
  tone = "accent",
  label,
}: {
  value: number;
  max: number;
  tone?: "accent" | "warning" | "live";
  label: string;
}) {
  const safeMax = Math.max(max, 0.001);
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));
  return (
    <div className="tt-progress" role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(safeMax)} aria-valuenow={Math.round(value)} aria-label={label}>
      <div className="tt-progress-track">
        <div
          className={cx(
            "tt-progress-fill",
            tone === "warning" && "tt-progress-fill-warning",
            tone === "live" && "tt-progress-fill-live",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  ...props
}: Omit<DialogHTMLAttributes<HTMLDialogElement>, "open"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastFocused = useRef<Element | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      lastFocused.current = document.activeElement;
      dialog.showModal();
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
      {...props}
    >
      <div className="tt-dialog-header">
        <div>
          <h2>{title}</h2>
          {description ? <p id={`${title}-desc`} className="tt-muted" style={{ margin: "4px 0 0", fontSize: 12 }}>{description}</p> : null}
        </div>
        <IconButton variant="ghost" label="Close dialog" onClick={() => onOpenChange(false)}>
          <X size={19} />
        </IconButton>
      </div>
      <div className="tt-dialog-body">{children}</div>
    </dialog>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: readonly { value: T; label: string; badge?: string }[];
  label: string;
}) {
  const id = useId();
  return (
    <div className="tt-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.value}
          id={`${id}-${tab.value}`}
          role="tab"
          className="tt-tab"
          aria-selected={value === tab.value}
          tabIndex={value === tab.value ? 0 : -1}
          onClick={() => onChange(tab.value)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const direction = event.key === "ArrowRight" ? 1 : -1;
            const next = tabs[(index + direction + tabs.length) % tabs.length];
            onChange(next.value);
            requestAnimationFrame(() => {
              document.getElementById(`${id}-${next.value}`)?.focus();
            });
          }}
        >
          <span>{tab.label}</span>
          {tab.badge ? <span className="tt-tab-badge" aria-hidden="true">{tab.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

type Toast = { id: number; message: string; tone: "neutral" | "danger" };
type ToastApi = { push: (message: string, tone?: Toast["tone"]) => void };
const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const push = useCallback((message: string, tone: Toast["tone"] = "neutral") => {
    const id = ++counter.current;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3600);
  }, []);
  const api = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="tt-toast-region" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className="tt-toast">
            <p className={toast.tone === "danger" ? "tt-error-text" : "tt-secondary"}>{toast.message}</p>
            <IconButton variant="ghost" size="sm" label="Dismiss notification" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>
              <X size={16} />
            </IconButton>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside ToastProvider");
  return api;
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="tt-inline-cluster tt-secondary" role="status" aria-live="polite">
      <span className="tt-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/* --- Dropdown menu primitive --- */

type MenuContextValue = { close: () => void };
const MenuContext = createContext<MenuContextValue | null>(null);

export function Menu({
  trigger,
  children,
  align = "right",
  label,
}: {
  trigger: (api: { open: () => void; toggle: () => void; isOpen: boolean }) => ReactNode;
  children: ReactNode;
  align?: "right" | "left";
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
            style={align === "left" ? { right: "auto", left: 0 } : undefined}
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

/* --- Tooltip primitive --- */

type TooltipContextValue = { show: (text: string, target: HTMLElement) => void; hide: () => void };
const TooltipContext = createContext<TooltipContextValue | null>(null);

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ text: string; x: number; y: number } | null>(null);
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
      const target = event.currentTarget as HTMLElement;
      tooltip.show(text, target);
    },
    onPointerLeave: (event: React.PointerEvent) => {
      existingLeave?.(event);
      tooltip.hide();
    },
    onFocus: (event: React.FocusEvent) => {
      existingFocus?.(event);
      const target = event.currentTarget as HTMLElement;
      tooltip.show(text, target);
    },
    onBlur: (event: React.FocusEvent) => {
      existingBlur?.(event);
      tooltip.hide();
    },
  });
}

/* --- Disclosure (used in dialog sub-screens) --- */

export function Disclosure({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      style={{ background: "var(--tt-surface-3)", borderRadius: "var(--tt-radius-md)" }}
    >
      <summary className="tt-button tt-button-ghost tt-button-sm" style={{ width: "100%", justifyContent: "space-between", cursor: "pointer" }}>
        <span>{summary}</span>
        <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} aria-hidden />
      </summary>
      <div style={{ padding: "var(--space-3)" }}>{children}</div>
    </details>
  );
}


