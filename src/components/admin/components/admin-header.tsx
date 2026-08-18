"use client";

import { LogOut, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode } from "react";

import { getBrowserAuthService } from "@/lib/auth/auth-service";
import { IconButton } from "@/components/primitives";
import { avatarInitials, avatarToneClass } from "@/lib/room/avatars";
import { Brand } from "@/components/app/brand";
import { HelpLauncher } from "@/components/app/help";
import { LocaleSwitcher, useTranslations } from "@/i18n";

export function AdminHeader({
  accountName,
  accountEmail,
}: {
  accountName: string;
  accountEmail: string | null;
}) {
  const router = useRouter();
  const t = useTranslations("admin");
  const tone = avatarToneClass(accountName);
  const initial = avatarInitials(accountName);

  async function signOut() {
    await getBrowserAuthService().signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <header className="tt-admin-header">
      <Brand compact />
      <div className="tt-admin-header-meta">
        <span className={`tt-avatar ${tone}`} aria-hidden>
          {initial}
        </span>
        <div className="tt-admin-header-name tt-account-menu-name" style={{ display: "grid", gap: 0, lineHeight: 1.2, minWidth: 0 }}>
          <span className="tt-account-name" style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {accountName}
          </span>
          {accountEmail ? (
            <span className="tt-muted tt-account-email" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {accountEmail}
            </span>
          ) : null}
        </div>
        <LocaleSwitcher variant="compact" />
        <HelpLauncher topic="admin" label={t("help")} />
        <IconButton variant="ghost" label={t("signOut")} onClick={() => void signOut()}>
          <LogOut size={18} aria-hidden className="tt-icon-mirror" />
        </IconButton>
      </div>
    </header>
  );
}

export function AdminSectionHeading({
  title,
  intro,
  tabs,
  action,
}: {
  title: string;
  intro: string;
  tabs: ReactNode;
  action: ReactNode;
}) {
  const t = useTranslations("admin");
  return (
    <div className="tt-admin-section-heading">
      <div>
        <p className="tt-kicker">{t("kicker")}</p>
        <h1 id="rooms-title" className="tt-title">
          {title}
        </h1>
        <p className="tt-secondary" style={{ marginTop: 6, maxWidth: "60ch" }}>
          {intro}
        </p>
      </div>
      <div className="tt-admin-section-heading-actions">
        {tabs}
        {action}
      </div>
    </div>
  );
}

export function AdminActionBar({
  query,
  onQueryChange,
  total,
  shown,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  total: number;
  shown: number;
}) {
  const t = useTranslations("admin.search");
  return (
    <div
      className="tt-admin-action-bar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "0 0 14px",
        flexWrap: "wrap",
      }}
    >
      <div className="tt-input-icon-wrap" style={{ position: "relative", flex: "1 1 240px", minWidth: 220, maxWidth: 360 }}>
        <Search size={15} aria-hidden className="tt-input-icon" />
        <input
          type="search"
          aria-label={t("label")}
          placeholder={t("placeholder")}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="tt-input"
          style={{ paddingInlineStart: 34 }}
        />
      </div>
      <span className="tt-muted tt-admin-action-bar-count" style={{ fontSize: 12.5 }}>
        {t("showing", { shown, total })}
      </span>
    </div>
  );
}
