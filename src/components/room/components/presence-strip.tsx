"use client";

import { Crown, Users } from "lucide-react";
import { memo } from "react";

import { cx } from "@/components/primitives";
import { avatarInitials, avatarToneClass } from "@/lib/room/avatars";
import { useTranslations } from "@/i18n";
import type { RoomWatcher } from "@/lib/realtime/room-channel-service";

const WatcherRow = memo(function WatcherRow({
  watcher,
  isOwner,
  isYou,
  youLabel,
  ownerTag,
}: {
  watcher: RoomWatcher;
  isOwner: boolean;
  isYou: boolean;
  youLabel: string;
  ownerTag: string;
}) {
  const tone = avatarToneClass(watcher.display_name);
  const initials = avatarInitials(watcher.display_name);
  return (
    <div className="tt-presence-name">
      <span
        className={cx("tt-avatar", "tt-avatar-online", tone, isOwner && "tt-avatar-owner")}
        title={watcher.display_name}
        aria-label={watcher.display_name}
      >
        {isOwner ? <Crown size={14} aria-hidden /> : initials}
      </span>
      <span className="tt-presence-name-label">
        {isYou ? <strong>{youLabel}</strong> : watcher.display_name}
        {isOwner ? ownerTag : ""}
      </span>
    </div>
  );
});

export const PresenceStrip = memo(function PresenceStrip({
  watchers,
  ownerUserId,
  currentUserId,
}: {
  watchers: readonly RoomWatcher[];
  ownerUserId: string;
  currentUserId?: string;
}) {
  const t = useTranslations("room.presence");
  const sorted = [...watchers].sort((a, b) => a.user_id.localeCompare(b.user_id));
  const shown = sorted.slice(0, 6);
  const overflow = Math.max(0, sorted.length - shown.length);
  return (
    <section className="tt-presence-strip" aria-label={t("watchersAria", { count: sorted.length })}>
      <div className="tt-presence-meta">
        <span className="tt-presence-strip-kicker">{t("kicker")}</span>
        <span className="tt-secondary" style={{ fontSize: 12 }}>
          <Users size={12} aria-hidden style={{ marginInlineEnd: 4, verticalAlign: -1 }} />
          <strong>{sorted.length}</strong> {t("person", { count: sorted.length })}
        </span>
        {sorted.some((w) => w.user_id === ownerUserId) ? (
          <span
            className="tt-status tt-status-warning"
            style={{ transform: "scale(.92)", transformOrigin: "left center" }}
          >
            {t("ownerOnline")}
          </span>
        ) : null}
      </div>

      <div className="tt-presence-avatar-row" aria-label={t("ariaPeople")}>
        {shown.map((watcher) => (
          <WatcherRow
            key={watcher.user_id}
            watcher={watcher}
            isOwner={watcher.user_id === ownerUserId}
            isYou={currentUserId !== undefined && watcher.user_id === currentUserId}
            youLabel={t("you")}
            ownerTag={t("ownerTag")}
          />
        ))}
        {overflow > 0 ? (
          <div className="tt-presence-name">
            <span className="tt-avatar tt-avatar-overflow" aria-label={t("more", { count: overflow })}>
              +{overflow}
            </span>
            <span className="tt-presence-name-label">{t("more", { count: overflow })}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
});
