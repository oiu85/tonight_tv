"use client";

import { LogOut, Settings, Share2, Users } from "lucide-react";

import type { RoomChannelStatus } from "@/lib/realtime/room-channel-service";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
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
  onShare,
  onOpenSettings,
  onLeave,
}: {
  room: RoomSnapshot["room"];
  channelStatus: ChannelStatus;
  watcherCount: number;
  owner: boolean;
  onShare: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
}) {
  const status = channelLabel(channelStatus);
  return (
    <header className="tt-room-topbar" role="banner">
      <div className="tt-room-topbar-primary">
        <Brand compact />
        <span className="tt-room-name" title={room.name}>
          {room.name}
        </span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
      <div className="tt-room-topbar-actions">
        <span
          className="tt-topbar-watchers"
          aria-label={`${watcherCount} watching`}
          title={`${watcherCount} watching`}
        >
          <Users size={15} aria-hidden />
          <strong>{watcherCount}</strong>
          <span className="tt-muted">watching</span>
        </span>
        <IconButton variant="ghost" label="Share Room" onClick={onShare}>
          <Share2 size={18} aria-hidden />
        </IconButton>
        {owner ? (
          <IconButton variant="ghost" label="Room Settings" onClick={onOpenSettings}>
            <Settings size={18} aria-hidden />
          </IconButton>
        ) : null}
        <IconButton variant="ghost" label="Leave room" onClick={onLeave}>
          <LogOut size={18} aria-hidden />
        </IconButton>
      </div>
    </header>
  );
}
