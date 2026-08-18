"use client";

import { ChevronDown, LogOut, PauseCircle, Settings, Share2, Tv2, Users } from "lucide-react";
import { memo } from "react";

import { Button, IconButton, StatusBadge } from "@/components/primitives";
import { HelpLauncher } from "@/components/app/help";
import { Brand } from "@/components/app/brand";
import { avatarInitials, avatarToneClass } from "@/lib/room/avatars";
import { LocaleSwitcher, useTranslations } from "@/i18n";
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
      return { label: t("idle"), tone: "neutral" as const };
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
  onOpenAccountMenu: () => void;
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
  onOpenAccountMenu,
}: RoomTopBarProps) {
  const t = useTranslations("room.topbar");
  const tCommon = useTranslations("common");
  const status = useChannelLabel(channelStatus);
  const ownerTone = avatarToneClass(ownerDisplayName);
  const ownerInitials = avatarInitials(ownerDisplayName);
  const isDeactivated = room.status === "deactivated";

  return (
    <header className="tt-room-topbar" role="banner">
      <div className="tt-room-topbar-primary">
        <Brand compact />
        <span className="tt-room-name" title={room.name}>
          {room.name}
          <ChevronDown size={14} aria-hidden className="tt-room-name-chevron" />
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
          <Share2 size={18} aria-hidden />
        </IconButton>
        {owner ? (
          <IconButton variant="ghost" label={t("settings")} onClick={onOpenSettings}>
            <Settings size={18} aria-hidden />
          </IconButton>
        ) : null}
        <LocaleSwitcher variant="compact" />
        <HelpLauncher topic={owner ? "admin" : "join"} label={tCommon("openGuide")} />
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenAccountMenu}
          aria-haspopup="menu"
          aria-label={t("account", { name: ownerDisplayName })}
          className="tt-account-menu-button"
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <span className={`tt-avatar ${ownerTone}`} aria-hidden>
            {ownerInitials}
          </span>
          <span className="tt-button-label">{ownerDisplayName}</span>
          <ChevronDown size={12} aria-hidden />
        </Button>
        <IconButton variant="ghost" label={t("leave")} onClick={onLeave}>
          <LogOut size={18} aria-hidden className="tt-icon-mirror" />
        </IconButton>
      </div>

      <span className="tt-visually-hidden">
        <Tv2 size={0} aria-hidden /> {room.name} status {status.label}.
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
