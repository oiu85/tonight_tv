"use client";

import { History, PauseCircle, PlayCircle, type LucideIcon } from "lucide-react";
import { cx } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import type { RoomFilterTab } from "./formatters";

type TabSpec = { id: RoomFilterTab; icon: LucideIcon };

const TABS: readonly TabSpec[] = [
  { id: "active", icon: PlayCircle },
  { id: "deactivated", icon: PauseCircle },
  { id: "all", icon: History },
];

export function RoomFilterTabs({
  tab,
  counts,
  onChange,
}: {
  tab: RoomFilterTab;
  counts: Record<RoomFilterTab, number>;
  onChange: (next: RoomFilterTab) => void;
}) {
  const t = useTranslations("admin.tabs");
  return (
    <div className="tt-admin-section-tabs" role="tablist" aria-label="Filter rooms by status">
      {TABS.map((entry) => {
        const Icon = entry.icon;
        const isSelected = tab === entry.id;
        const label = t(entry.id);
        return (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            className={cx("tt-admin-section-tab", isSelected && "tt-admin-section-tab-selected")}
            onClick={() => onChange(entry.id)}
          >
            <Icon size={14} aria-hidden />
            {label}
            <span className="tt-admin-section-tab-count" aria-label={`${counts[entry.id]} ${label}`}>
              {counts[entry.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
