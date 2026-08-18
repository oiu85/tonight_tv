import parseTorrent, { toMagnetURI } from "parse-torrent";

import {
  TORRENT_MANIFEST_MAX_FILES,
  TORRENT_METADATA_MAX_BYTES,
  TORRENT_PATH_MAX_DEPTH,
  TORRENT_PATH_MAX_LENGTH,
  TorrentGatewayError,
  type TorrentInspection,
  type TorrentManifestFile,
} from "./contracts";

const INFO_HASH_PATTERN = /^[a-f0-9]{40}$/i;
const WEBTOR_HOST_PATTERN = /^(?:www\.)?webtor\.io$/i;
const MAGNET_INFO_HASH_PATTERN = /(?:^|[?&])xt=urn:btih:([a-f0-9]{40}|[a-z2-7]{32})/i;
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "mkv", "webm", "avi", "ts", "vob"]);
const SUBTITLE_EXTENSIONS = new Set(["srt", "vtt"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "flac", "m4a", "aac"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz"]);
const SAMPLE_MARKERS = /(^|[\s._-])(sample|trailer|preview|extra|extras)([\s._-]|$)/i;

export type ParsedTorrentIdentity = Readonly<{
  infoHash: string;
  name: string | null;
  magnetUri: string | null;
}>;

/** Stored when Webtor should pick the main video because no file list is available. */
export const WEBTOR_AUTOSELECT_FILE_PATH = "__webtor_autoselect__.mp4";

export function isWebtorAutoselectPath(path: string | null | undefined): boolean {
  return (path?.trim() ?? "") === WEBTOR_AUTOSELECT_FILE_PATH;
}

export function canonicalMagnetUri(infoHash: string, displayName?: string | null): string {
  const hash = infoHash.toLowerCase();
  const name = displayName?.trim();
  return name
    ? `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}`
    : `magnet:?xt=urn:btih:${hash}`;
}

export function extractInfoHashFromTorrentInput(input: string): string | null {
  const trimmed = input.trim();
  if (INFO_HASH_PATTERN.test(trimmed)) return trimmed.toLowerCase();

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (WEBTOR_HOST_PATTERN.test(url.hostname)) {
        const match = url.pathname.match(/\/([a-f0-9]{40})(?:\/|$)/i);
        if (match) return match[1].toLowerCase();
      }
    } catch {
      return null;
    }
    return null;
  }

  if (trimmed.toLowerCase().startsWith("magnet:?")) {
    const match = MAGNET_INFO_HASH_PATTERN.exec(trimmed);
    if (match && INFO_HASH_PATTERN.test(match[1])) return match[1].toLowerCase();
    if (match && match[1].length === 32) {
      let bits = "";
      for (const character of match[1].toLowerCase()) {
        const value = BASE32_ALPHABET.indexOf(character);
        if (value < 0) return null;
        bits += value.toString(2).padStart(5, "0");
      }
      return Array.from({ length: 20 }, (_, index) =>
        Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2).toString(16).padStart(2, "0"),
      ).join("");
    }
  }

  return null;
}

export async function parseMagnetIdentity(magnetUri: string): Promise<ParsedTorrentIdentity> {
  const normalized = magnetUri.trim();
  if (normalized.length < 20 || normalized.length > 16_384) {
    throw new TorrentGatewayError("invalid_magnet", "Enter a Magnet URI, info hash, or webtor.io link.", { status: 400 });
  }

  const extractedHash = extractInfoHashFromTorrentInput(normalized);
  const originalIsMagnet = normalized.toLowerCase().startsWith("magnet:?");
  const parseInput = originalIsMagnet
    ? normalized
    : extractedHash
      ? canonicalMagnetUri(extractedHash)
      : normalized;

  if (!parseInput.toLowerCase().startsWith("magnet:?")) {
    throw new TorrentGatewayError("invalid_magnet", "Enter a Magnet URI, info hash, or webtor.io link.", { status: 400 });
  }

  try {
    const parsed = await parseTorrent(parseInput);
    const infoHash = parsed.infoHash?.toLowerCase();
    if (!infoHash || !INFO_HASH_PATTERN.test(infoHash)) {
      throw new Error("missing info hash");
    }
    return Object.freeze({
      infoHash,
      name: parsed.name?.trim() || null,
      magnetUri: originalIsMagnet ? normalized : canonicalMagnetUri(infoHash, parsed.name),
    });
  } catch (error) {
    if (extractedHash) {
      return Object.freeze({
        infoHash: extractedHash,
        name: null,
        magnetUri: originalIsMagnet ? normalized : canonicalMagnetUri(extractedHash),
      });
    }
    throw new TorrentGatewayError("invalid_magnet", "The Magnet URI does not contain a valid BitTorrent info hash.", {
      cause: error,
      status: 400,
    });
  }
}

export async function parseTorrentFileIdentity(bytes: Uint8Array): Promise<ParsedTorrentIdentity> {
  if (bytes.byteLength === 0 || bytes.byteLength > TORRENT_METADATA_MAX_BYTES) {
    throw new TorrentGatewayError(
      "invalid_torrent",
      `Torrent metadata must be smaller than ${TORRENT_METADATA_MAX_BYTES / 1024 / 1024} MiB.`,
      { status: 400 },
    );
  }

  try {
    const parsed = await parseTorrent(bytes);
    const infoHash = parsed.infoHash?.toLowerCase();
    if (!infoHash || !INFO_HASH_PATTERN.test(infoHash) || !parsed.files?.length) {
      throw new Error("missing torrent metadata");
    }
    if (parsed.files.length > TORRENT_MANIFEST_MAX_FILES) {
      throw new TorrentGatewayError(
        "invalid_torrent",
        `This torrent contains more than ${TORRENT_MANIFEST_MAX_FILES.toLocaleString()} files.`,
        { status: 400 },
      );
    }
    return Object.freeze({
      infoHash,
      name: parsed.name?.trim() || null,
      magnetUri: toMagnetURI(parsed),
    });
  } catch (error) {
    if (error instanceof TorrentGatewayError) throw error;
    throw new TorrentGatewayError("invalid_torrent", "The selected file is not valid torrent metadata.", {
      cause: error,
      status: 400,
    });
  }
}

function extensionOf(name: string): string | null {
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 && lastDot < name.length - 1
    ? name.slice(lastDot + 1).toLowerCase()
    : null;
}

export function normalizeTorrentPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  const segments = normalized.split("/");
  if (
    normalized.length === 0 ||
    normalized.length > TORRENT_PATH_MAX_LENGTH ||
    segments.length > TORRENT_PATH_MAX_DEPTH ||
    segments.some((segment) => !segment || segment === "." || segment === ".." || segment.length > 255)
  ) {
    throw new TorrentGatewayError("invalid_torrent", "The torrent contains an unsafe or excessively deep file path.", {
      status: 400,
    });
  }
  return normalized;
}

export function classifyTorrentFile(input: Readonly<{
  index: number;
  path: string;
  name?: string | null;
  sizeBytes: number;
  gatewayMediaFormat?: string | null;
}>): TorrentManifestFile {
  if (!Number.isInteger(input.index) || input.index < 0 || !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) {
    throw new TorrentGatewayError("invalid_torrent", "The torrent manifest contains an invalid file index or size.", {
      status: 502,
    });
  }
  const path = normalizeTorrentPath(input.path);
  const name = (input.name?.trim() || path.split("/").at(-1) || "file").slice(0, 255);
  const extension = extensionOf(name);
  const gatewayFormat = input.gatewayMediaFormat?.toLowerCase();
  const kind =
    gatewayFormat === "video" || (extension && VIDEO_EXTENSIONS.has(extension))
      ? "video"
      : gatewayFormat === "subtitle" || (extension && SUBTITLE_EXTENSIONS.has(extension))
        ? "subtitle"
        : gatewayFormat === "audio" || (extension && AUDIO_EXTENSIONS.has(extension))
          ? "audio"
          : gatewayFormat === "image" || (extension && IMAGE_EXTENSIONS.has(extension))
            ? "image"
            : extension && ARCHIVE_EXTENSIONS.has(extension)
              ? "archive"
              : "other";
  const playableCandidate = kind === "video";
  const samplePenalty = SAMPLE_MARKERS.test(name) ? 2_000_000_000_000 : 0;
  const candidateRank = playableCandidate ? Math.max(0, input.sizeBytes - samplePenalty) : -1;

  return Object.freeze({
    index: input.index,
    path,
    name,
    sizeBytes: input.sizeBytes,
    extension,
    kind,
    playableCandidate,
    candidateRank,
  });
}

function autoselectFileName(identityName: string | null): string {
  const raw = identityName?.trim().replace(/[\\/]/g, "-") ?? "";
  if (!raw) return "video.mp4";
  if (/\.[a-z0-9]{2,5}$/i.test(raw)) return raw.slice(0, 255);
  return `${raw.slice(0, 250)}.mp4`;
}

export function inspectionFromMagnetIdentity(identity: ParsedTorrentIdentity): TorrentInspection {
  const file = classifyTorrentFile({
    index: 0,
    path: WEBTOR_AUTOSELECT_FILE_PATH,
    name: autoselectFileName(identity.name),
    sizeBytes: 0,
  });
  return Object.freeze({
    infoHash: identity.infoHash,
    torrentName: identity.name,
    status: "ready",
    files: Object.freeze([file]),
    totalFiles: 1,
    truncated: false,
    magnetUri: identity.magnetUri,
  });
}

function normalizedStem(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/\b(2160p|1080p|720p|480p|bluray|webrip|web-dl|hdtv|x26[45]|hevc|av1)\b/g, " ")
    .replace(/[^a-z0-9\p{L}]+/gu, " ")
    .trim();
}

export type SubtitleCandidate = Readonly<{
  file: TorrentManifestFile;
  score: number;
  label: string;
  languageCode: string | null;
  forced: boolean;
  sdh: boolean;
}>;

const LANGUAGE_MARKERS: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  en: ["en", "English"],
  eng: ["en", "English"],
  ar: ["ar", "Arabic"],
  ara: ["ar", "Arabic"],
  fr: ["fr", "French"],
  fra: ["fr", "French"],
  fre: ["fr", "French"],
  es: ["es", "Spanish"],
  spa: ["es", "Spanish"],
  de: ["de", "German"],
  ger: ["de", "German"],
  deu: ["de", "German"],
});

export function rankSubtitleCandidates(
  video: TorrentManifestFile,
  files: readonly TorrentManifestFile[],
): readonly SubtitleCandidate[] {
  const videoDir = video.path.includes("/") ? video.path.slice(0, video.path.lastIndexOf("/")) : "";
  const videoStem = normalizedStem(video.name);

  return files
    .filter((file) => file.kind === "subtitle")
    .map((file) => {
      const subtitleDir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
      const subtitleStem = normalizedStem(file.name);
      const tokens = file.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const marker = tokens.map((token) => LANGUAGE_MARKERS[token]).find(Boolean);
      const forced = tokens.includes("forced");
      const sdh = tokens.includes("sdh") || tokens.includes("hi");
      let stemScore = 0;
      if (subtitleStem === videoStem) stemScore = 100;
      else if (subtitleStem.startsWith(videoStem) || videoStem.startsWith(subtitleStem)) stemScore = 70;
      else {
        const shared = videoStem.split(" ").filter((token) => subtitleStem.includes(token)).length;
        stemScore = Math.min(shared * 8, 40);
      }
      const score = stemScore + (subtitleDir === videoDir ? 20 : 0);
      const qualifiers = [marker?.[1], forced ? "Forced" : null, sdh ? "SDH" : null].filter(Boolean);
      return Object.freeze({
        file,
        score,
        label: qualifiers.length ? qualifiers.join(" - ") : file.name,
        languageCode: marker?.[0] ?? null,
        forced,
        sdh,
      });
    })
    .filter((candidate) => candidate.score >= 50)
    .sort((a, b) => b.score - a.score || a.file.name.localeCompare(b.file.name));
}

/**
 * Returns the sidecar subtitle indexes that should be imported by default for
 * a selected video. The decision stays in the torrent domain so the dialog
 * only renders and submits the user's final choices.
 */
export function defaultSubtitleFileIndexes(
  video: TorrentManifestFile,
  files: readonly TorrentManifestFile[],
): ReadonlySet<number> {
  return new Set(rankSubtitleCandidates(video, files).map((candidate) => candidate.file.index));
}

export function rankVideoCandidates(files: readonly TorrentManifestFile[]): readonly TorrentManifestFile[] {
  return files
    .filter((file) => file.playableCandidate)
    .sort((a, b) => b.candidateRank - a.candidateRank || b.sizeBytes - a.sizeBytes || a.path.localeCompare(b.path));
}
