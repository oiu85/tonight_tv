"use client";

import { type CSSProperties, type ReactNode } from "react";
import { cx } from "./cx";

/**
 * Small inline status pill with a colored dot prefix. Use for terse,
 * single-word labels like "Live", "Reconnecting", or "Error".
 */
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
    <div
      className="tt-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      aria-valuenow={Math.round(value)}
      aria-label={label}
    >
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

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="tt-inline-cluster tt-secondary" role="status" aria-live="polite">
      <span className="tt-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/**
 * Skeleton primitives. The `.tt-skeleton` class applies a shimmer mask;
 * children inherit sizing from the surrounding layout.
 */
export function Skeleton({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div className={cx("tt-skeleton", className)} style={style}>
      {children}
    </div>
  );
}

export function SkeletonLine({ width = "100%" }: { width?: string | number }) {
  return (
    <div
      className="tt-skeleton tt-skeleton-line"
      style={{ width: typeof width === "number" ? `${width}px` : width }}
    />
  );
}

export function SkeletonCircle({ size = 56 }: { size?: number }) {
  return (
    <div
      className="tt-skeleton tt-skeleton-circle"
      style={{ width: size, height: size }}
    />
  );
}
