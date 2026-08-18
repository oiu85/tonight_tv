"use client";

import { RadioTower } from "lucide-react";
import { memo } from "react";

import { Button, ProgressMeter } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import type { RoomSyncStatus } from "@/lib/sync/room-sync-coordinator";
import { LocalControls, type LocalControlsProps } from "./local-controls";

export const ViewerControls = memo(function ViewerControls(
  props: LocalControlsProps & {
    status: RoomSyncStatus;
    behindSeconds: number;
    onGoLive: () => void;
  },
) {
  const t = useTranslations("room.controls");
  const tSync = useTranslations("sync");
  const live = props.status === "live" && props.behindSeconds < 2;
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

      <div className="tt-control-row">
        <Button
          variant="primary"
          className="tt-control-large-button"
          onClick={props.onGoLive}
          disabled={live}
          aria-label={t("goLive")}
        >
          <RadioTower size={20} aria-hidden />
          <span>{live ? t("synced") : t("goLive")}</span>
        </Button>
        <p className="tt-secondary" style={{ fontSize: 13, margin: 0 }}>
          {t("localSettingsNote")}
        </p>
      </div>

      {offline ? (
        <ProgressMeter value={1} max={1} tone="warning" label={tSync("connecting")} />
      ) : null}

      <LocalControls {...props} />
    </section>
  );
});
