import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  AdminControls,
  VideoStage,
  ViewerControls,
} from "../../src/components/room/room-controls";
import type { RoomSnapshot } from "../../src/lib/rooms/room-service";

const timestamp = "2026-08-17T12:00:00.000Z";

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
  selectedSubtitleId: null,
  onMutedChange: vi.fn(),
  onVolumeChange: vi.fn(),
  onSubtitleChange: vi.fn(),
  onPictureInPicture: vi.fn(),
  onFullscreen: vi.fn(),
  pipAvailable: true,
  fullscreenAvailable: true,
};

describe("Room playback surfaces", () => {
  it("never enables native browser video controls", () => {
    const markup = renderToStaticMarkup(
      <VideoStage
        videoRef={createRef<HTMLVideoElement>()}
        snapshot={snapshot(false)}
        status="live"
        mediaError={null}
        onStartWatching={vi.fn()}
        onRetry={vi.fn()}
        onReconnect={vi.fn()}
      />,
    );

    expect(markup).toContain("<video");
    expect(markup).not.toMatch(/<video[^>]*\scontrols(?:=|\s|>)/);
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
        {...localProps}
        status="live"
        playbackStatus="playing"
        currentTime={42}
        duration={120}
        pending={false}
        onPlayPause={vi.fn()}
        onRestart={vi.fn()}
        onNext={vi.fn()}
        onSeek={vi.fn()}
        onAddMedia={vi.fn()}
        onManageSubtitles={vi.fn()}
      />,
    );

    expect(markup.match(/aria-label="Shared room timeline"/g)).toHaveLength(1);
  });
});
