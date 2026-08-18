"use client";

import { RadioTower } from "lucide-react";
import { memo } from "react";

import { Button, ProgressMeter } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import type { RoomSyncStatus } from "@/lib/sync/room-sync-coordinator";
import { usePlayerClock } from "../hooks/use-room-session";
import { LocalControls, type LocalControlsProps } from "./local-controls";

export const ViewerControls = memo(function ViewerControls(
  props: LocalControlsProps & {
    status: RoomSyncStatus;
    behindSeconds?: number;
    onGoLive: () => void;
  },
) {
  const t = useTranslations("room.controls");
  const tSync = useTranslations("sync");
  const clock = usePlayerClock();
  const behindSeconds = props.behindSeconds ?? clock.behindSeconds;
  const live = props.status === "live" && behindSeconds < 2;
  const offline = props.status === "error" || props.status === "stopped";

  return (
    <section className="tt-controls" aria-label={t("viewerTitle")}>
      <div className="tt-controls-head">
        <div>
          <p className="tt-kicker">{t("viewerKicker")}</p>
          <h3>{t("viewerTitle")}</h3>
        </div>
        <span className="tt-secondary">
          {live ? t("viewerSubtitleLive") : t("viewerSubtitleDrift")}
        </span>
      </div>

      {!live ? (
        <div className="tt-control-row">
          <Button
            variant="primary"
            className="tt-control-large-button"
            onClick={props.onGoLive}
            aria-label={t("goLive")}
          >
            <RadioTower size={16} aria-hidden />
            <span>{t("goLive")}</span>
          </Button>
        </div>
      ) : null}

      {offline ? (
        <ProgressMeter value={1} max={1} tone="warning" label={tSync("connecting")} />
      ) : null}

      <LocalControls {...props} />
    </section>
  );
});
