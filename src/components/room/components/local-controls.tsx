"use client";

import { Captions, Volume2, VolumeX } from "lucide-react";
import { memo } from "react";

import { IconButton } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import type { RoomSnapshot } from "@/lib/rooms/room-service";

export type LocalControlsProps = {
  muted: boolean;
  volume: number;
  subtitles: RoomSnapshot["subtitles"];
  subtitlesAvailable: boolean;
  selectedSubtitleId: string | null;
  onMutedChange: () => void;
  onVolumeChange: (volume: number) => void;
  onSubtitleChange: (id: string | null) => void;
  onPictureInPicture: () => void;
  onFullscreen: () => void;
  pipAvailable: boolean;
  fullscreenAvailable: boolean;
};

export const LocalControls = memo(function LocalControls(props: LocalControlsProps) {
  const t = useTranslations("room.transport");
  const tControls = useTranslations("room.controls");
  const tCommon = useTranslations("common");
  return (
    <div className="tt-control-row tt-control-row-secondary">
      <div className="tt-volume-control" aria-label={t("mute")}>
        <IconButton variant="ghost" label={props.muted ? t("unmute") : t("mute")} onClick={props.onMutedChange}>
          {props.muted ? <VolumeX size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}
        </IconButton>
        <input
          aria-label={t("mute")}
          className="tt-range tt-num"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={props.muted ? 0 : props.volume}
          onChange={(event) => props.onVolumeChange(Number(event.target.value))}
        />
        <span className="tt-volume-value">{Math.round((props.muted ? 0 : props.volume) * 100)}%</span>
      </div>

      <label className="tt-local-control">
        <Captions size={16} aria-hidden />
        <span className="tt-button-label">{tControls("subtitles")}</span>
        <select
          aria-label={tControls("subtitles")}
          className="tt-select"
          style={{ minHeight: 30, width: 120, padding: "4px 8px", fontSize: 13, background: "transparent", border: "none", color: "var(--tt-text-primary)" }}
          value={props.selectedSubtitleId ?? ""}
          onChange={(event) => props.onSubtitleChange(event.target.value || null)}
          disabled={!props.subtitlesAvailable}
        >
          <option value="">{tCommon("none")}</option>
          {props.subtitles.map((track) => (
            <option key={track.id} value={track.id}>
              {track.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
});
