import { describe, expect, it } from "vitest";

import { extractYouTubeVideoId } from "../../src/lib/media/youtube-identity";

describe("extractYouTubeVideoId", () => {
  it("accepts a raw ID and common watch, short, embed, and shorts URLs", () => {
    expect(extractYouTubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(extractYouTubeVideoId("youtube.com/watch?v=dQw4w9WgXcQ&t=12s")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("rejects non-YouTube URLs and malformed IDs", () => {
    expect(extractYouTubeVideoId("https://media.example.test/movie.mp4")).toBeNull();
    expect(extractYouTubeVideoId("bad")).toBeNull();
    expect(extractYouTubeVideoId("")).toBeNull();
  });
});
