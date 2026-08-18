"use client";

import { useId } from "react";

/**
 * Horizontal tab strip with keyboard navigation (ArrowLeft / ArrowRight).
 * `value` is the currently selected tab; `onChange` is called with the next
 * value when the user navigates.
 */
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
      {tabs.map((tab, index) => {
        const isSelected = tab.value === value;
        return (
          <button
            key={tab.value}
            id={`${id}-${tab.value}`}
            role="tab"
            className="tt-tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
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
            {tab.badge ? (
              <span className="tt-tab-badge" aria-hidden="true">
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
