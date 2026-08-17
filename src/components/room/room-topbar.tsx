"use client";

import {
  ChevronDown,
  LogOut,
  Settings,
  Share2,
  Tv2,
  Users,
} from "lucide-react";
import { useState } from "react";

import type { RoomChannelStatus } from "@/lib/realtime/room-channel-service";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
import { avatarInitials, avatarToneClass } from "../../lib/room/avatars";
import { Brand } from "../app/brand";
import { IconButton, StatusBadge } from "../ui/primitives";

type ChannelStatus = RoomChannelStatus | "idle";

function channelLabel(status: ChannelStatus): { label: string; tone: "live" | "warning" | "danger" | "neutral" } {
  switch (status) {
    case "subscribed":
      return { label: "LIVE", tone: "live" };
    case "connecting":
      return { label: "Connecting", tone: "warning" };
    case "reconnecting":
      return { label: "Reconnecting", tone: "warning" };
    case "error":
      return { label: "Connection issue", tone: "danger" };
    case "closed":
      return { label: "Disconnected", tone: "warning" };
    case "idle":
    default:
      return { label: "Idle", tone: "neutral" };
  }
}

export function RoomTopBar({
  room,
  channelStatus,
  watcherCount,
  owner,
  ownerDisplayName,
  onShare,
  onOpenSettings,
  onLeave,
  onOpenAccountMenu,
}: {
  room: RoomSnapshot["room"];
  channelStatus: ChannelStatus;
  watcherCount: number;
  owner: boolean;
  ownerDisplayName: string;
  onShare: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
  onOpenAccountMenu: () => void;
}) {
  const status = channelLabel(channelStatus);
  const ownerTone = avatarToneClass(ownerDisplayName);
  const ownerInitials = avatarInitials(ownerDisplayName);
  const [nameOpen] = useState(false);
  return (
    <header className="tt-room-topbar" role="banner">
      <div className="tt-room-topbar-primary">
        <Brand compact />
        <span className="tt-room-name" title={room.name}>
          {room.name}
          <ChevronDown size={14} aria-hidden className="tt-room-name-chevron" />
        </span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span
          className="tt-topbar-watchers"
          aria-label={`${watcherCount} watching`}
          title={`${watcherCount} watching`}
        >
          <Users size={15} aria-hidden />
          <strong>{watcherCount}</strong>
          <span className="tt-muted" style={{ marginLeft: 4 }}>watching</span>
        </span>
      </div>
      <div className="tt-room-topbar-actions">
        <IconButton variant="ghost" label="Share Room" onClick={onShare}>
          <Share2 size={18} aria-hidden />
        </IconButton>
        {owner ? (
          <IconButton variant="ghost" label="Room Settings" onClick={onOpenSettings}>
            <Settings size={18} aria-hidden />
          </IconButton>
        ) : null}
        <button
          type="button"
          className="tt-button tt-button-ghost tt-button-sm"
          onClick={onOpenAccountMenu}
          aria-haspopup="menu"
          aria-expanded={nameOpen}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <span className={`tt-avatar ${ownerTone}`} aria-hidden>
            {ownerInitials}
          </span>
          <span className="tt-button-label">{ownerDisplayName}</span>
          <ChevronDown size={12} aria-hidden />
        </button>
        <IconButton variant="ghost" label="Leave room" onClick={onLeave}>
          <LogOut size={18} aria-hidden />
        </IconButton>
      </div>
      <span className="tt-visually-hidden">
        <Tv2 size={0} aria-hidden /> {room.name} status {status.label}.
      </span>
    </header>
  );
}
