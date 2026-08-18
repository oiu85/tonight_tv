"use client";

import { Clock3 } from "lucide-react";
import Image from "next/image";
import { memo, useEffect, useRef, useState } from "react";

import { StatusBadge, cx } from "@/components/primitives";
import { posterForTitle } from "@/lib/room/posters";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
import type { RoomSyncStatus } from "@/lib/sync/room-sync-coordinator";
import { useTranslations } from "@/i18n";
import { usePlayerClock } from "../hooks/use-room-session";
import { formatPlaybackTime, syncStatusCopy } from "./playback-helpers";

const MarqueeText = memo(function MarqueeText({ text }: { text: string }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const inner = host.firstElementChild as HTMLElement | null;
      if (!inner) return;
      setOverflows(inner.scrollWidth > host.clientWidth + 4);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [text]);

  return (
    <span ref={hostRef} className={cx("tt-marquee", overflows && "is-overflowing")}>
      <span className="tt-marquee__inner">
        <bdi>{text}</bdi>
        {overflows ? (
          <>
            <span className="tt-marquee__gap" aria-hidden>
              ·
            </span>
            <bdi aria-hidden>{text}</bdi>
          </>
        ) : null}
      </span>
    </span>
  );
});

export const NowPlaying = memo(function NowPlaying({
  snapshot,
  status,
  currentTime: currentTimeProp,
  duration: durationProp,
  behindSeconds: behindSecondsProp,
  isOwner,
}: {
  snapshot: RoomSnapshot;
  status: RoomSyncStatus;
  currentTime?: number;
  duration?: number | null;
  behindSeconds?: number;
  isOwner: boolean;
}) {
  const t = useTranslations("room.nowPlaying");
  const tSync = useTranslations("sync");
  const clock = usePlayerClock();
  const currentTime = currentTimeProp ?? clock.currentTime;
  const duration = durationProp ?? clock.duration;
  const behindSeconds = behindSecondsProp ?? clock.behindSeconds;
  const playback = snapshot.playback;
  const sync = syncStatusCopy(status, behindSeconds, playback.status, tSync);
  const showTime = playback.status !== "idle";
  const behind = behindSeconds >= 2;
  const title = snapshot.current_media?.title ?? t("noneSelected");
  const syncLabel = behind ? t("behind", { seconds: Math.round(behindSeconds) }) : isOwner ? t("live") : t("synced");
  const { poster: posterSrc } = posterForTitle(snapshot.current_media?.title);

  return (
    <>
      <section className="tt-now-playing tt-hide-on-narrow" aria-labelledby="now-playing-title">
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
            <bdi>{title}</bdi>
          </h1>
          <div className="tt-now-playing-meta">
            <span className="tt-status tt-status-pill tt-status-live">
              <span>{isOwner ? t("live") : t("synced")}</span>
            </span>
            {behind ? (
              <span className={cx("tt-warning-text")}>
                <Clock3 size={11} aria-hidden style={{ marginInlineEnd: 4, verticalAlign: 0 }} />
                {t("behind", { seconds: Math.round(behindSeconds) })}
              </span>
            ) : null}
          </div>
        </div>
        <div className="tt-now-playing-side">
          <span className="tt-now-playing-status" aria-live="polite" aria-atomic="true">
            <StatusBadge tone={sync.tone}>{sync.label}</StatusBadge>
            <span className="tt-muted" style={{ fontSize: 12 }}>{sync.detail}</span>
          </span>
          {showTime ? (
            <span className="tt-now-playing-time tt-num" dir="ltr" aria-hidden="true">
              {formatPlaybackTime(currentTime)}
              {duration !== null ? (
                <>
                  <span className="tt-muted" style={{ marginInline: 6 }}>/</span>
                  <span className="tt-muted" dir="ltr">{formatPlaybackTime(duration)}</span>
                </>
              ) : null}
            </span>
          ) : null}
        </div>
      </section>

      <section
        className="tt-now-playing-strip"
        aria-labelledby="now-playing-title-mobile"
      >
        <span className={cx("tt-now-playing-sync", behind && "is-behind")} title={sync.detail}>
          {syncLabel}
        </span>
        <h1 id="now-playing-title-mobile" className="tt-now-playing-strip-title">
          <MarqueeText text={title} />
        </h1>
        {showTime ? (
          <span className="tt-now-playing-time tt-num" dir="ltr">
            {formatPlaybackTime(currentTime)}
            {duration !== null ? ` / ${formatPlaybackTime(duration)}` : ""}
          </span>
        ) : null}
      </section>
    </>
  );
});
