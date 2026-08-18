"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import type { RoomFilterTab } from "./formatters";

/**
 * Shown when the user has rooms but the current filter has no matches.
 * Tells them exactly what is hiding the rooms and how to surface them.
 */
export function NoResults({
  query,
  tab,
  onClearQuery,
  onClearTab,
}: {
  query: string;
  tab: RoomFilterTab;
  onClearQuery: () => void;
  onClearTab: () => void;
}) {
  const t = useTranslations("admin.search");
  const isFilteringByName = query.trim().length > 0;
  return (
    <div
      className="tt-section-card tt-anim-fade-pop"
      style={{ alignItems: "center", padding: 36 }}
    >
      <div className="tt-empty-illustration" aria-hidden>
        <Search size={28} />
      </div>
      <p className="tt-empty-block-eyebrow">{t("noMatchTitle")}</p>
      <h2 className="tt-section-title">
        {isFilteringByName ? t("noMatchQuery", { query }) : t("noMatchTab")}
      </h2>
      <p className="tt-secondary" style={{ maxWidth: 380, textAlign: "center" }}>
        {t("noMatchBody")}
      </p>
      <div className="tt-inline-cluster" style={{ gap: 8 }}>
        {isFilteringByName ? (
          <Button variant="ghost" size="sm" onClick={onClearQuery}>
            {t("clearSearch")}
          </Button>
        ) : null}
        {tab !== "active" ? (
          <Button variant="primary" size="sm" onClick={onClearTab}>
            {t("showActive")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
