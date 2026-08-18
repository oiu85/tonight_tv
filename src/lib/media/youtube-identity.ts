const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

export function isValidYouTubeVideoId(value: string): boolean {
  return YOUTUBE_VIDEO_ID_PATTERN.test(value.trim());
}

/**
 * Accepts a raw 11-character ID or any common YouTube watch/share URL.
 * Returns null when the value is not a YouTube identity Tonight TV can embed.
 */
export function extractYouTubeVideoId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    return null;
  }
  if (isValidYouTubeVideoId(trimmed)) {
    return trimmed;
  }

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) {
    return null;
  }

  if (host === "youtu.be" || host === "www.youtu.be") {
    const shortId = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    return isValidYouTubeVideoId(shortId) ? shortId : null;
  }

  const pathParts = parsed.pathname.split("/").filter(Boolean);
  const directPathId =
    (pathParts[0] === "embed" ||
      pathParts[0] === "shorts" ||
      pathParts[0] === "live" ||
      pathParts[0] === "v") &&
    pathParts[1]
      ? pathParts[1]
      : "";
  if (isValidYouTubeVideoId(directPathId)) {
    return directPathId;
  }

  const queryId = parsed.searchParams.get("v")?.trim() ?? "";
  return isValidYouTubeVideoId(queryId) ? queryId : null;
}
