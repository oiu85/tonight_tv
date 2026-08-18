"use client";

import {
  Captions,
  Cog,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { Button, ProgressMeter } from "@/components/primitives";
import { useTranslations } from "@/i18n";
import type { RoomSnapshot } from "@/lib/rooms/room-service";
import type { RoomSyncStatus } from "@/lib/sync/room-sync-coordinator";
import { usePlayerClock } from "../hooks/use-room-session";
import { formatPlaybackTime } from "./playback-helpers";
import { LocalControls, type LocalControlsProps } from "./local-controls";

type PendingCommand = "play_pause" | "restart" | "next" | "seek" | "select" | null;

export const AdminControls = memo(function AdminControls(
  props: LocalControlsProps & {
    status: RoomSyncStatus;
    playbackStatus: RoomSnapshot["playback"]["status"];
    currentTime?: number;
    duration?: number | null;
    pending: PendingCommand;
    playbackVersion: number;
    onPlayPause: () => void;
    onRestart: () => void;
    onNext: () => void;
    onSeek: (seconds: number, expectedVersion: number) => void;
    onScrubConflict: () => void;
    onAddMedia: () => void;
    onManageSubtitles: () => void;
  },
) {
  const t = useTranslations("room.controls");
  const tSync = useTranslations("sync");
  const clock = usePlayerClock();
  const currentTime = props.currentTime ?? clock.canonicalTime;
  const duration = props.duration ?? clock.duration;
  const playback = props.playbackStatus;
  const max = duration ?? 0;
  // Seeking is only meaningful while we're live. Other sync states mean
  // the timeline is moving on its own; we shouldn't push extra commands.
  const seekEnabled = props.status === "live";
  const [draft, setDraft] = useState<number | null>(null);
  const scrubVersionRef = useRef<number | null>(null);
  const wasScrubbingRef = useRef(false);
  // Keep a ref to the latest onScrubConflict so we don't tear down the
  // version-watching effect on every render.
  const onScrubConflictRef = useRef(props.onScrubConflict);
  useEffect(() => {
    onScrubConflictRef.current = props.onScrubConflict;
  }, [props.onScrubConflict]);

  useEffect(() => {
    if (
      wasScrubbingRef.current &&
      scrubVersionRef.current !== null &&
      scrubVersionRef.current !== props.playbackVersion
    ) {
      wasScrubbingRef.current = false;
      scrubVersionRef.current = null;
      setDraft(null);
      onScrubConflictRef.current();
      return;
    }
    setDraft(null);
    scrubVersionRef.current = null;
    wasScrubbingRef.current = false;
  }, [props.playbackVersion]);

  function updateSeekPreview(value: number) {
    scrubVersionRef.current ??= props.playbackVersion;
    wasScrubbingRef.current = true;
    setDraft(Math.min(Math.max(value, 0), max));
  }

  function commitSeek() {
    const scrubVersion = scrubVersionRef.current;
    wasScrubbingRef.current = false;
    if (draft === null || scrubVersion === null || !seekEnabled) return;
    props.onSeek(draft, scrubVersion);
    setDraft(null);
    scrubVersionRef.current = null;
  }

  return (
    <section className="tt-controls" aria-label={t("adminTitle")}>
      <div className="tt-controls-head">
        <div>
          <p className="tt-kicker">{t("adminKicker")}</p>
          <h3>{t("adminTitle")}</h3>
        </div>
        <span className="tt-secondary">{t("adminSubtitle")}</span>
      </div>

      <div className="tt-control-row">
        <button
          type="button"
          className="tt-control-large-button tt-control-primary"
          onClick={props.onPlayPause}
          disabled={props.pending === "play_pause"}
          aria-pressed={playback === "playing"}
          aria-label={playback === "playing" ? t("pauseForEveryone") : t("playForEveryone")}
        >
          {playback === "playing" ? (
            <Pause size={16} aria-hidden />
          ) : (
            <Play size={16} aria-hidden />
          )}
          <span>{playback === "playing" ? t("pause") : t("play")}</span>
        </button>

        <Button
          variant="secondary"
          className="tt-control-large-button"
          onClick={props.onRestart}
          disabled={props.pending === "restart"}
          aria-label={t("restartForEveryone")}
        >
          <RotateCcw size={15} aria-hidden />
          <span>{t("restart")}</span>
        </Button>

        <Button
          variant="secondary"
          className="tt-control-large-button"
          onClick={props.onNext}
          disabled={props.pending === "next"}
          aria-label={t("playNext")}
        >
          <SkipForward size={15} aria-hidden className="tt-icon-mirror" />
          <span>{t("next")}</span>
        </Button>

        <Button variant="secondary" className="tt-control-large-button" onClick={props.onAddMedia}>
          <Plus size={15} aria-hidden />
          <span>{t("addMedia")}</span>
        </Button>

        <Button
          variant="secondary"
          className="tt-control-large-button"
          onClick={props.onManageSubtitles}
          disabled={!props.subtitlesAvailable}
          aria-label={t("manageSubtitles")}
        >
          <Captions size={15} aria-hidden />
          <span>{t("subtitles")}</span>
        </Button>
      </div>

      <div className="tt-timeline" aria-label={t("scrubTimeline")}>
        <time className="tt-num" dir="ltr">{formatPlaybackTime(draft ?? currentTime)}</time>
        <input
          className="tt-range"
          type="range"
          min={0}
          max={Math.max(max, 0.001)}
          step={0.1}
          value={draft ?? currentTime}
          onChange={(event) => updateSeekPreview(Number(event.target.value))}
          onPointerUp={commitSeek}
          onKeyUp={commitSeek}
          disabled={max <= 0}
          aria-label={t("seekAria")}
        />
        <time className="tt-num" dir="ltr">{duration !== null ? formatPlaybackTime(max) : "--:--"}</time>
      </div>

      {props.status === "catching_up" || props.status === "buffering" ? (
        <ProgressMeter
          value={1}
          max={1}
          tone={props.status === "buffering" ? "warning" : "live"}
          label={props.status === "buffering" ? tSync("buffering") : tSync("catchingUp")}
        />
      ) : null}

      <p className="tt-secondary" style={{ fontSize: 12, margin: 0 }}>
        <Cog size={12} aria-hidden style={{ verticalAlign: -1, marginInlineEnd: 4 }} />
        {t("localSettingsNote")}
      </p>

      <LocalControls {...props} />
    </section>
  );
});
