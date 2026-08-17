import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  convertSrtToVtt,
  createHtmlSubtitleRuntime,
  createSubtitleService,
  normalizeSubtitleText,
  SubtitleServiceError,
  type SubtitleMetadata,
} from "../../src/lib/subtitles/subtitle-service";
import type { Database } from "../../src/lib/supabase/database.types";

const roomId = "10000000-0000-4000-8000-000000000001";
const mediaId = "20000000-0000-4000-8000-000000000001";
const subtitleId = "30000000-0000-4000-8000-000000000001";
const createdBy = "00000000-0000-4000-8000-000000000001";

function metadata(overrides: Partial<SubtitleMetadata> = {}): SubtitleMetadata {
  return {
    id: subtitleId,
    room_id: roomId,
    media_id: mediaId,
    label: "English",
    language_code: "en",
    storage_path: `rooms/${roomId}/media/${mediaId}/${subtitleId}.vtt`,
    format: "vtt",
    created_by: createdBy,
    created_at: "2026-08-17T12:00:00.000Z",
    ...overrides,
  };
}

function createClientMock() {
  const upload = vi.fn().mockResolvedValue({ data: { path: "stored" }, error: null });
  const download = vi
    .fn()
    .mockResolvedValue({ data: new Blob(["WEBVTT\n"]), error: null });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const from = vi.fn(() => ({ upload, download, remove }));
  const rpc = vi.fn();
  const client = {
    storage: { from },
    rpc,
  } as unknown as SupabaseClient<Database>;
  return { client, rpc, upload, download, remove, from };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("subtitle conversion", () => {
  it("converts numbered SRT cues and preserves multiline text", () => {
    expect(
      convertSrtToVtt(
        "1\r\n00:00:01,250 --> 00:00:03,500\r\nFirst line\r\nSecond line\r\n\r\n2\r\n00:01:00,000 --> 00:01:02,125\r\nNext cue\r\n",
      ),
    ).toBe(
      "WEBVTT\n\n00:00:01.250 --> 00:00:03.500\nFirst line\nSecond line\n\n00:01:00.000 --> 00:01:02.125\nNext cue\n",
    );
  });

  it("normalizes a UTF-8 BOM and accepts valid WebVTT", () => {
    expect(
      normalizeSubtitleText(
        "captions.vtt",
        "\uFEFFWEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nHello\r\n",
      ),
    ).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n");
  });

  it("rejects invalid timestamps and unsupported formats", () => {
    expect(() =>
      convertSrtToVtt("1\n00:99:01,000 --> 00:00:02,000\nBroken"),
    ).toThrow(SubtitleServiceError);
    expect(() => normalizeSubtitleText("captions.ass", "text")).toThrow(
      /\.srt or \.vtt/,
    );
  });
});

describe("subtitle storage service", () => {
  it("uploads canonical VTT before creating deterministic metadata", async () => {
    const { client, rpc, upload, from } = createClientMock();
    rpc.mockImplementation(async (name, args) => {
      expect(name).toBe("create_subtitle_metadata");
      const values = args as Database["public"]["Functions"]["create_subtitle_metadata"]["Args"];
      return {
        data: [
          metadata({
            id: values.p_subtitle_id,
            storage_path: `rooms/${roomId}/media/${mediaId}/${values.p_subtitle_id}.vtt`,
          }),
        ],
        error: null,
      };
    });

    const result = await createSubtitleService(client).uploadSubtitle({
      roomId,
      mediaId,
      label: " English ",
      languageCode: " en ",
      fileName: "captions.srt",
      text: "1\n00:00:01,000 --> 00:00:02,000\nHello",
    });

    expect(from).toHaveBeenCalledWith("subtitles");
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0][0]).toMatch(
      new RegExp(`^rooms/${roomId}/media/${mediaId}/[0-9a-f-]+\\.vtt$`, "i"),
    );
    await expect((upload.mock.calls[0][1] as Blob).text()).resolves.toContain(
      "00:00:01.000 --> 00:00:02.000",
    );
    expect(result.label).toBe("English");
    expect(result.language_code).toBe("en");
  });

  it("removes an uploaded object when metadata persistence fails", async () => {
    const { client, rpc, remove } = createClientMock();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Room ownership is required" },
    });

    await expect(
      createSubtitleService(client).uploadSubtitle({
        roomId,
        mediaId,
        label: "English",
        fileName: "captions.vtt",
        text: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello",
      }),
    ).rejects.toMatchObject({ code: "permission_denied" });
    expect(remove).toHaveBeenCalledOnce();
  });

  it("surfaces unresolved upload cleanup failures", async () => {
    const { client, rpc, remove } = createClientMock();
    rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    remove.mockResolvedValue({ data: null, error: new Error("cleanup failed") });

    await expect(
      createSubtitleService(client).uploadSubtitle({
        roomId,
        mediaId,
        label: "English",
        fileName: "captions.vtt",
        text: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello",
      }),
    ).rejects.toMatchObject({ code: "cleanup_failed" });
  });

  it("restores the object when metadata deletion fails", async () => {
    const { client, rpc, upload, remove, download } = createClientMock();
    rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });

    await expect(
      createSubtitleService(client).deleteSubtitle(metadata()),
    ).rejects.toMatchObject({ code: "metadata_failed" });
    expect(download).toHaveBeenCalledWith(metadata().storage_path);
    expect(remove).toHaveBeenCalledWith([metadata().storage_path]);
    expect(upload).toHaveBeenCalledWith(
      metadata().storage_path,
      expect.any(Blob),
      expect.objectContaining({ upsert: false }),
    );
  });
});

describe("HTML subtitle runtime", () => {
  it("switches private Blob tracks locally and revokes object URLs", async () => {
    const firstTrack = {
      kind: "",
      label: "",
      srclang: "",
      src: "",
      default: false,
      track: { mode: "disabled" },
      remove: vi.fn(),
    };
    const secondTrack = {
      ...firstTrack,
      track: { mode: "disabled" },
      remove: vi.fn(),
    };
    const createElement = vi
      .fn()
      .mockReturnValueOnce(firstTrack)
      .mockReturnValueOnce(secondTrack);
    vi.stubGlobal("document", { createElement });

    const append = vi.fn();
    const mediaElement = { append } as unknown as HTMLMediaElement;
    const downloadSubtitle = vi
      .fn()
      .mockResolvedValue(new Blob(["WEBVTT\n"], { type: "text/vtt" }));
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const revokeObjectURL = vi.fn();
    const runtime = createHtmlSubtitleRuntime(
      mediaElement,
      { downloadSubtitle },
      { createObjectURL, revokeObjectURL },
    );

    await runtime.select(metadata());
    await runtime.select(
      metadata({
        id: "30000000-0000-4000-8000-000000000002",
        label: "Arabic",
        language_code: "ar",
      }),
    );

    expect(downloadSubtitle).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenCalledTimes(2);
    expect(firstTrack.remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");
    expect(runtime.getSelectedSubtitleId()).toBe(
      "30000000-0000-4000-8000-000000000002",
    );

    runtime.destroy();
    expect(secondTrack.remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second");
    expect(runtime.getSelectedSubtitleId()).toBeNull();
  });
});
