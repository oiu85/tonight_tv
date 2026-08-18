"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cx } from "@/components/primitives";
import { useTranslations } from "@/i18n";

const MOBILE_QUERY = "(max-width: 720px)";

export function VideoDock({ children }: { children: ReactNode }) {
  const dockRef = useRef<HTMLDivElement>(null);
  const [floating, setFloating] = useState(false);
  const t = useTranslations("room.video");

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;

    const mq = window.matchMedia(MOBILE_QUERY);
    const io = new IntersectionObserver(
      ([entry]) => {
        setFloating(mq.matches && entry.intersectionRatio < 0.4);
      },
      { threshold: [0, 0.25, 0.4, 0.75], rootMargin: "-12px 0px 0px 0px" },
    );
    io.observe(dock);

    const onChange = () => {
      if (!mq.matches) setFloating(false);
    };
    mq.addEventListener("change", onChange);
    return () => {
      io.disconnect();
      mq.removeEventListener("change", onChange);
    };
  }, []);

  function restore() {
    dockRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setFloating(false);
  }

  return (
    <div ref={dockRef} className={cx("tt-video-dock", floating && "is-floating")}>
      {children}
      {floating ? (
        <button
          type="button"
          className="tt-video-dock-restore"
          onClick={restore}
          aria-label={t("returnToPlayer")}
        />
      ) : null}
    </div>
  );
}
