"use client";

import { LogOut, PauseCircle, Settings, Share2, Users } from "lucide-react";
import { memo } from "react";

import { IconButton, StatusBadge } from "@/components/primitives";
import { Brand } from "@/components/app/brand";
import { avatarInitials, avatarToneClass } from "@/lib/room/avatars";
import { LocaleSwitcher, useTranslations } from "@/i18n";
import { ThemeSwitcher } from "@/theme";
import type { RoomChannelStatus } from "@/lib/realtime/room-channel-service";
import type { RoomSnapshot } from "@/lib/rooms/room-service";

type ChannelStatus = RoomChannelStatus | "idle";

function useChannelLabel(status: ChannelStatus) {
  const t = useTranslations("room.channelStatus");
  switch (status) {
    case "subscribed":
      return { label: t("live"), tone: "live" as const };
    case "connecting":
      return { label: t("connecting"), tone: "warning" as const };
    case "reconnecting":
      return { label: t("reconnecting"), tone: "warning" as const };
    case "error":
      return { label: t("error"), tone: "danger" as const };
    case "closed":
      return { label: t("closed"), tone: "warning" as const };
    case "idle":
    default:
      return { label: t("connecting"), tone: "warning" as const };
  }
}

export type RoomTopBarProps = {
  room: RoomSnapshot["room"];
  channelStatus: ChannelStatus;
  watcherCount: number;
  owner: boolean;
  ownerDisplayName: string;
  onShare: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
};

export const RoomTopBar = memo(function RoomTopBar({
  room,
  channelStatus,
  watcherCount,
  owner,
  ownerDisplayName,
  onShare,
  onOpenSettings,
  onLeave,
}: RoomTopBarProps) {
  const t = useTranslations("room.topbar");
  const status = useChannelLabel(channelStatus);
  const ownerTone = avatarToneClass(ownerDisplayName);
  const ownerInitials = avatarInitials(ownerDisplayName);
  const isDeactivated = room.status === "deactivated";

  return (
    <header className="tt-room-topbar" role="banner">
      <div className="tt-room-topbar-primary">
        <Brand compact />
        <span className="tt-room-name" title={room.name}>
          <bdi>{room.name}</bdi>
        </span>
        {isDeactivated ? (
          <span
            className="tt-status-room tt-status-room-deactivated"
            title={t("deactivatedTitle")}
          >
            <PauseCircle size={12} aria-hidden /> {t("deactivatedBadge")}
          </span>
        ) : (
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        )}
        <span
          className="tt-topbar-watchers"
          aria-label={t("watchersAria", { count: watcherCount })}
          title={t("watchersAria", { count: watcherCount })}
        >
          <Users size={15} aria-hidden />
          <strong>{watcherCount}</strong>
          <span className="tt-muted tt-topbar-watchers-label">{t("watching")}</span>
        </span>
      </div>

      <div className="tt-room-topbar-actions">
        <IconButton variant="ghost" label={t("share")} onClick={onShare}>
          <Share2 size={15} aria-hidden />
        </IconButton>
        {owner ? (
          <IconButton variant="ghost" label={t("settings")} onClick={onOpenSettings}>
            <Settings size={15} aria-hidden />
          </IconButton>
        ) : null}
        <ThemeSwitcher />
        <LocaleSwitcher variant="compact" />
        <div
          className="tt-account-identity tt-hide-on-narrow"
          aria-label={t("account", { name: ownerDisplayName })}
        >
          <span className={`tt-avatar ${ownerTone}`} aria-hidden>
            {ownerInitials}
          </span>
          <span className="tt-button-label">{ownerDisplayName}</span>
        </div>
        <IconButton variant="ghost" label={t("leave")} onClick={onLeave}>
          <LogOut size={15} aria-hidden className="tt-icon-mirror" />
        </IconButton>
      </div>

      <span className="tt-visually-hidden">
        {t("statusAnnouncement", { name: room.name, status: status.label })}
      </span>

      {isDeactivated ? (
        <div className="tt-inline-warning" style={{ gridColumn: "1 / -1" }} role="status">
          <PauseCircle size={14} aria-hidden />
          <span>{t("deactivatedNotice")}</span>
        </div>
      ) : null}
    </header>
  );
});
