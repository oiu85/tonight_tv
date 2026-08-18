"use client";

import { Clock3, RadioTower } from "lucide-react";
import Image from "next/image";
import { memo } from "react";

import { StatusBadge, cx } from "@/components/primitives";
import { posterForTitle } from "@/lib/room/posters";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
import type { RoomSyncStatus } from "@/lib/sync/room-sync-coordinator";
import { useTranslations } from "@/i18n";
import { formatPlaybackTime, syncStatusCopy } from "./playback-helpers";

export const NowPlaying = memo(function NowPlaying({
  snapshot,
  status,
  currentTime,
  duration,
  behindSeconds,
  isOwner,
}: {
  snapshot: RoomSnapshot;
  status: RoomSyncStatus;
  currentTime: number;
  duration: number | null;
  behindSeconds: number;
  isOwner: boolean;
}) {
  const t = useTranslations("room.nowPlaying");
  const tSync = useTranslations("sync");
  const playback = snapshot.playback;
  const sync = syncStatusCopy(status, behindSeconds, playback.status, tSync);
  const showTime = playback.status !== "idle";
  const behind = behindSeconds >= 2;
  const { poster: posterSrc } = posterForTitle(snapshot.current_media?.title);

  return (
    <section className="tt-now-playing" aria-labelledby="now-playing-title">
      <div className="tt-now-playing-poster" aria-hidden>
        <Image
          src={posterSrc}
          alt=""
          className="tt-now-playing-poster-img"
          width={72}
          height={108}
          loading="lazy"
        />
      </div>
      <div className="tt-now-playing-copy">
        <p className="tt-kicker">{t("kicker")}</p>
        <h1 id="now-playing-title" className="tt-media-title">
          {snapshot.current_media?.title ?? t("noneSelected")}
        </h1>
        <div className="tt-now-playing-meta">
          <span className="tt-status tt-status-pill tt-status-live">
            <span>{isOwner ? t("live") : t("synced")}</span>
          </span>
          {isOwner ? (
            <span style={{ color: "var(--tt-text-muted)" }}>
              <RadioTower size={11} aria-hidden style={{ marginInlineEnd: 4, verticalAlign: 0 }} /> {t("startedBy", { name: snapshot.room.name })}
            </span>
          ) : null}
          {behind ? (
            <span className={cx("tt-warning-text")}>
              <Clock3 size={11} aria-hidden style={{ marginInlineEnd: 4, verticalAlign: 0 }} />
              {t("behind", { seconds: Math.round(behindSeconds) })}
            </span>
          ) : null}
        </div>
      </div>
      <div className="tt-now-playing-side" aria-live="polite" aria-atomic="true">
        <StatusBadge tone={sync.tone}>{sync.label}</StatusBadge>
        <span className="tt-muted" style={{ fontSize: 12 }}>{sync.detail}</span>
        {showTime ? (
          <span className="tt-now-playing-time tt-num" aria-label="Playback position">
            {formatPlaybackTime(currentTime)}
            {duration !== null ? (
              <>
                <span className="tt-muted" style={{ margin: "0 6px" }}>/</span>
                <span className="tt-muted">{formatPlaybackTime(duration)}</span>
              </>
            ) : null}
          </span>
        ) : null}
      </div>
    </section>
  );
});
