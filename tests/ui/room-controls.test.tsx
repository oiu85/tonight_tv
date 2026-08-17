// @vitest-environment jsdom

import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AdminControls,
  formatPlaybackTime,
  VideoStage,
  ViewerControls,
} from "../../src/components/room/room-controls";
import type { RoomSnapshot } from "../../src/lib/rooms/room-service";

const timestamp = "2026-08-17T12:00:00.000Z";

afterEach(cleanup);

function snapshot(isOwner: boolean): RoomSnapshot {
  return {
    server_time: timestamp,
    room: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Movie night",
      owner_user_id: "22222222-2222-4222-8222-222222222222",
      created_at: timestamp,
      updated_at: timestamp,
    },
    caller: {
      user_id: "22222222-2222-4222-8222-222222222222",
      is_owner: isOwner,
      room_session_id: "33333333-3333-4333-8333-333333333333",
      display_name: "Sam",
    },
    playback: {
      room_id: "11111111-1111-4111-8111-111111111111",
      current_media_id: "44444444-4444-4444-8444-444444444444",
      status: "playing",
      anchor_position_sec: 42,
      anchor_server_time: timestamp,
      state_version: 4,
      updated_at: timestamp,
    },
    current_media: {
      id: "44444444-4444-4444-8444-444444444444",
      title: "Feature presentation",
      source_url: "https://media.example/movie.mp4",
      source_type: "mp4",
      source_revision: 1,
      youtube_video_id: null,
      torrent_info_hash: null,
      torrent_input_kind: null,
      torrent_file_index: null,
      torrent_file_path: null,
      torrent_file_name: null,
      torrent_file_size: null,
      queue_position: 1,
      created_at: timestamp,
      updated_at: timestamp,
    },
    subtitles: [],
    queue: [],
    recent_chat: [],
  };
}

const localProps = {
  muted: false,
  volume: 0.8,
  subtitles: [],
  subtitlesAvailable: true,
  selectedSubtitleId: null,
  onMutedChange: vi.fn(),
  onVolumeChange: vi.fn(),
  onSubtitleChange: vi.fn(),
  onPictureInPicture: vi.fn(),
  onFullscreen: vi.fn(),
  pipAvailable: true,
  fullscreenAvailable: true,
};

const videoStageCommon = {
  currentTime: 42,
  duration: 120,
  onStartWatching: vi.fn(),
  onRetry: vi.fn(),
  onReconnect: vi.fn(),
  onMuteToggle: vi.fn(),
  muted: false,
  onCaptionsToggle: vi.fn(),
  captionsActive: false,
  captionsAvailable: true,
  onPipToggle: vi.fn(),
  onFullscreenToggle: vi.fn(),
  pipAvailable: true,
  fullscreenAvailable: true,
  reason: null,
};

function adminProps(overrides: Partial<Parameters<typeof AdminControls>[0]> = {}) {
  return {
    ...localProps,
    status: "live" as const,
    playbackStatus: "playing" as const,
    currentTime: 42,
    duration: 120,
    pending: null,
    playbackVersion: 4,
    onPlayPause: vi.fn(),
    onRestart: vi.fn(),
    onNext: vi.fn(),
    onSeek: vi.fn(),
    onScrubConflict: vi.fn(),
    onAddMedia: vi.fn(),
    onManageSubtitles: vi.fn(),
    ...overrides,
  };
}

describe("Room playback surfaces", () => {
  it("never enables native browser video controls", () => {
    const markup = renderToStaticMarkup(
      <VideoStage
        stageRef={createRef<HTMLElement>()}
        videoRef={createRef<HTMLVideoElement>()}
        youtubeMountRef={createRef<HTMLDivElement>()}
        snapshot={snapshot(false)}
        status="live"
        mediaError={null}
        {...videoStageCommon}
      />,
    );

    expect(markup).toContain("<video");
    expect(markup).not.toMatch(/<video[^>]*\scontrols(?:=|\s|>)/);
    expect(markup).not.toContain('aria-label="Pause"');
    expect(markup).not.toContain('aria-label="Play"');
  });

  it("gives viewers local controls without a shared timeline or playback commands", () => {
    const markup = renderToStaticMarkup(
      <ViewerControls
        {...localProps}
        status="buffering"
        behindSeconds={3}
        onGoLive={vi.fn()}
      />,
    );

    expect(markup).not.toContain("Shared room timeline");
    expect(markup).not.toContain('aria-label="Play for everyone"');
    expect(markup).not.toContain('aria-label="Pause for everyone"');
    expect(markup).not.toContain('aria-label="Play next program"');
    expect(markup).not.toContain('aria-label="Restart program"');
    expect(markup).toContain("GO LIVE");
  });

  it("renders exactly one owner-authorized shared timeline", () => {
    const markup = renderToStaticMarkup(
      <AdminControls
        {...adminProps()}
      />,
    );

    expect(markup.match(/aria-label="Shared room timeline"/g)).toHaveLength(1);
  });

  it("formats finite media times consistently and keeps invalid duration unknown", () => {
    expect(formatPlaybackTime(0)).toBe("00:00");
    expect(formatPlaybackTime(754)).toBe("12:34");
    expect(formatPlaybackTime(3_737)).toBe("1:02:17");
    expect(formatPlaybackTime(Number.NaN)).toBe("--:--");

    const markup = renderToStaticMarkup(
      <AdminControls {...adminProps({ currentTime: 142, duration: null })} />,
    );
    expect(markup).toContain("02:22");
    expect(markup).toContain("--:--");
    expect(markup).toMatch(/aria-label="Shared room timeline"[^>]*disabled/);
  });

  it("keeps drag state local and commits one authoritative seek with the captured version", () => {
    const onSeek = vi.fn();
    const view = render(<AdminControls {...adminProps({ onSeek })} />);
    const timeline = view.getByLabelText("Shared room timeline") as HTMLInputElement;

    fireEvent.pointerDown(timeline);
    fireEvent.change(timeline, { target: { value: "73.5" } });
    expect(onSeek).not.toHaveBeenCalled();
    expect(timeline.value).toBe("73.5");

    view.rerender(
      <AdminControls {...adminProps({ currentTime: 44, onSeek })} />,
    );
    expect(timeline.value).toBe("73.5");

    fireEvent.pointerUp(timeline);
    fireEvent.pointerUp(timeline);
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(73.5, 4);
  });

  it("cancels an obsolete scrub when the canonical version changes", () => {
    const onSeek = vi.fn();
    const onScrubConflict = vi.fn();
    const view = render(
      <AdminControls {...adminProps({ onSeek, onScrubConflict })} />,
    );
    const timeline = view.getByLabelText("Shared room timeline") as HTMLInputElement;

    fireEvent.pointerDown(timeline);
    fireEvent.change(timeline, { target: { value: "80" } });
    view.rerender(
      <AdminControls
        {...adminProps({
          currentTime: 55,
          playbackVersion: 5,
          onSeek,
          onScrubConflict,
        })}
      />,
    );

    expect(onScrubConflict).toHaveBeenCalledOnce();
    expect(timeline.value).toBe("55");
    fireEvent.pointerUp(timeline);
    expect(onSeek).not.toHaveBeenCalled();
  });
});
