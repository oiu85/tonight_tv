import type { MediaSourceType } from "./media-queue-service";

export type MediaRuntimeSourceKind = "direct" | "hls";

export type MediaSourceErrorCategory =
  | "network_source_unreachable"
  | "cors_referrer_origin_blocked"
  | "unsupported_codec_container"
  | "hls_manifest_error"
  | "hls_media_error"
  | "autoplay_permission_blocked"
  | "authenticated_source_unsupported"
  | "expired_url_suspected"
  | "encrypted_drm_source_unsupported"
  | "unknown_media_error";

export class MediaRuntimeError extends Error {
  readonly category: MediaSourceErrorCategory;
  readonly fatal: boolean;

  constructor(
    category: MediaSourceErrorCategory,
    message: string,
    options?: ErrorOptions & { fatal?: boolean },
  ) {
    super(message, options);
    this.name = "MediaRuntimeError";
    this.category = category;
    this.fatal = options?.fatal ?? true;
  }
}

export type HlsErrorLike = Readonly<{
  type?: string;
  details?: string;
  fatal?: boolean;
  response?: Readonly<{ code?: number }>;
}>;

export function resolveMediaRuntimeSource(
  sourceUrl: string,
  sourceType: MediaSourceType,
): MediaRuntimeSourceKind {
  if (sourceType === "hls") {
    return "hls";
  }
  if (sourceType === "mp4") {
    return "direct";
  }

  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    return pathname.endsWith(".m3u8") ? "hls" : "direct";
  } catch {
    return "direct";
  }
}

export function classifyPlayRejection(error: unknown): MediaRuntimeError {
  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  ) {
    return new MediaRuntimeError(
      "autoplay_permission_blocked",
      "The room is playing, but this browser requires a user gesture before it can play media.",
      { cause: error, fatal: false },
    );
  }

  return new MediaRuntimeError(
    "unknown_media_error",
    "The browser could not start media playback.",
    { cause: error },
  );
}

export function classifyHtmlMediaError(
  mediaError: Pick<MediaError, "code" | "message"> | null,
): MediaRuntimeError {
  switch (mediaError?.code) {
    case 2:
      return new MediaRuntimeError(
        "network_source_unreachable",
        "The media source could not be reached. The browser may also be blocking its origin or referrer policy.",
      );
    case 3:
      return new MediaRuntimeError(
        "unsupported_codec_container",
        "The browser could not decode this media codec or container.",
      );
    case 4:
      return new MediaRuntimeError(
        "unsupported_codec_container",
        "The media source is unsupported or is not a direct browser-playable media URL.",
      );
    default:
      return new MediaRuntimeError(
        "unknown_media_error",
        "The browser reported an unknown media failure.",
      );
  }
}

export function classifyHlsError(error: HlsErrorLike): MediaRuntimeError {
  const detail = error.details?.toLowerCase() ?? "";
  const status = error.response?.code;

  if (status === 401 || status === 403) {
    return new MediaRuntimeError(
      "authenticated_source_unsupported",
      "This HLS source requires credentials or origin access that Tonight TV cannot bypass.",
      { cause: error, fatal: error.fatal },
    );
  }
  if (status === 404 || status === 410) {
    return new MediaRuntimeError(
      "expired_url_suspected",
      "The HLS source was not found and its URL may have expired.",
      { cause: error, fatal: error.fatal },
    );
  }
  if (detail.includes("keysystem") || detail.includes("drm")) {
    return new MediaRuntimeError(
      "encrypted_drm_source_unsupported",
      "Encrypted or DRM-protected playback is not supported.",
      { cause: error, fatal: error.fatal },
    );
  }
  if (detail.includes("manifest") || detail.includes("level")) {
    return new MediaRuntimeError(
      "hls_manifest_error",
      "The HLS manifest could not be loaded or parsed.",
      { cause: error, fatal: error.fatal },
    );
  }
  if (error.type === "mediaError" || detail.includes("frag") || detail.includes("buffer")) {
    return new MediaRuntimeError(
      "hls_media_error",
      "The HLS stream encountered a media or segment failure.",
      { cause: error, fatal: error.fatal },
    );
  }
  if (error.type === "networkError") {
    return new MediaRuntimeError(
      "network_source_unreachable",
      "The HLS source could not be reached. CORS or origin policy may also be involved.",
      { cause: error, fatal: error.fatal },
    );
  }

  return new MediaRuntimeError(
    "unknown_media_error",
    "The HLS runtime reported an unknown media failure.",
    { cause: error, fatal: error.fatal },
  );
}

export function unsupportedHlsRuntimeError(): MediaRuntimeError {
  return new MediaRuntimeError(
    "unsupported_codec_container",
    "This browser supports neither native HLS nor the Media Source Extensions required by hls.js.",
  );
}
