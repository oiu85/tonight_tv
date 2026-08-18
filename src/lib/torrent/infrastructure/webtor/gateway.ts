import {
  TORRENT_MANIFEST_MAX_FILES,
  TORRENT_MANIFEST_PAGE_SIZE,
  TORRENT_METADATA_MAX_BYTES,
  TorrentGatewayError,
  type PrepareTorrentInput,
  type ResolvedTorrentPlaybackSource,
  type ResolveTorrentPlaybackInput,
  type TorrentGateway,
  type TorrentGatewayInput,
  type TorrentGatewayStatus,
  type TorrentInspection,
  type TorrentManifestFile,
  type TorrentMediaProbe,
  type TorrentStatusInput,
} from "../../domain/contracts";
import {
  classifyTorrentFile,
  parseMagnetIdentity,
  parseTorrentFileIdentity,
} from "../../domain/manifest";

type WebtorListItem = Readonly<{
  id?: unknown;
  index?: unknown;
  name?: unknown;
  path?: unknown;
  size?: unknown;
  type?: unknown;
  media_format?: unknown;
  ext?: unknown;
}>;

type WebtorListedFile = Readonly<{
  manifest: TorrentManifestFile;
  contentId: string;
}>;

type WebtorResource = Readonly<{
  id?: unknown;
  name?: unknown;
  multi_file?: unknown;
  file?: WebtorListItem;
  files_count?: unknown;
}>;

type WebtorExportItem = Readonly<{
  url?: unknown;
  meta?: Readonly<{
    transcode?: unknown;
    multibitrate?: unknown;
    cache?: unknown;
    transcode_cache?: unknown;
  }>;
  html_tag?: Readonly<{
    src?: unknown;
    sources?: readonly Readonly<{ src?: unknown; type?: unknown }>[];
    tracks?: readonly Readonly<{ src?: unknown; label?: unknown; srclang?: unknown }>[];
  }>;
}>;

type WebtorExportResponse = Readonly<{
  source?: WebtorListItem;
  exports?: Readonly<Record<string, WebtorExportItem>>;
}>;

export type WebtorTorrentGatewayOptions = Readonly<{
  internalBaseUrl: string;
  mediaPublicBaseUrl?: string;
  username?: string;
  password?: string;
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
}>;

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function publicMediaUrl(url: string, options: WebtorTorrentGatewayOptions): string {
  if (!options.mediaPublicBaseUrl) return url;
  const source = new URL(url);
  const target = new URL(options.mediaPublicBaseUrl);
  target.pathname = `${target.pathname.replace(/\/$/, "")}${source.pathname}`;
  target.search = source.search;
  return target.toString();
}

function safeMessage(status: number): string {
  if (status === 401 || status === 403) return "The Torrent Gateway rejected the control request.";
  if (status === 408 || status === 504) return "Torrent metadata is still unavailable.";
  if (status === 429) return "The Torrent Gateway is temporarily rate limited.";
  if (status === 404) return "The Torrent Gateway no longer has this torrent registered.";
  return "The Torrent Gateway could not complete the request.";
}

function categoryForStatus(status: number) {
  if (status === 401 || status === 403) return "gateway_auth_failed" as const;
  if (status === 408 || status === 504) return "torrent_metadata_timeout" as const;
  if (status === 429) return "gateway_rate_limited" as const;
  if (status === 404) return "torrent_metadata_unavailable" as const;
  return "gateway_unavailable" as const;
}

function normalizeProbe(raw: unknown, transcode: boolean): TorrentMediaProbe | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const format = value.format && typeof value.format === "object" ? value.format as Record<string, unknown> : {};
  const streams = Array.isArray(value.streams) ? value.streams.filter((stream): stream is Record<string, unknown> => !!stream && typeof stream === "object" && !Array.isArray(stream)) : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.filter((stream) => stream.codec_type === "audio");
  const subtitles = streams.filter((stream) => stream.codec_type === "subtitle");
  const tagsOf = (stream: Record<string, unknown>) => stream.tags && typeof stream.tags === "object" ? stream.tags as Record<string, unknown> : {};
  const dispositionOf = (stream: Record<string, unknown>) => stream.disposition && typeof stream.disposition === "object" ? stream.disposition as Record<string, unknown> : {};

  return Object.freeze({
    durationSec: Number.isFinite(Number(format.duration)) ? Number(format.duration) : null,
    container: stringValue(format.format_name),
    videoCodec: video ? stringValue(video.codec_name) : null,
    width: video ? numberValue(video.width) : null,
    height: video ? numberValue(video.height) : null,
    audioTracks: Object.freeze(audio.map((stream, index) => {
      const tags = tagsOf(stream);
      return Object.freeze({
        index: numberValue(stream.index) ?? index,
        language: stringValue(tags.language),
        title: stringValue(tags.title),
        codec: stringValue(stream.codec_name),
        channels: numberValue(stream.channels),
      });
    })),
    embeddedSubtitles: Object.freeze(subtitles.map((stream, index) => {
      const tags = tagsOf(stream);
      const disposition = dispositionOf(stream);
      return Object.freeze({
        index: numberValue(stream.index) ?? index,
        language: stringValue(tags.language),
        title: stringValue(tags.title),
        codec: stringValue(stream.codec_name),
        forced: disposition.forced === 1,
        url: null,
      });
    })),
    browserCompatible: !transcode,
    expectedPlaybackMode: "hls",
    transcodeRequired: transcode,
  });
}

export class WebtorTorrentGateway implements TorrentGateway {
  readonly #options: WebtorTorrentGatewayOptions;
  readonly #fetch: typeof fetch;

  constructor(options: WebtorTorrentGatewayOptions) {
    const internalBaseUrl = options.internalBaseUrl.trim();
    if (!/^https?:\/\//i.test(internalBaseUrl)) {
      throw new Error("TORRENT_GATEWAY_INTERNAL_URL must be an HTTP or HTTPS URL.");
    }
    this.#options = { ...options, internalBaseUrl };
    this.#fetch = options.fetch ?? fetch;
  }

  #headers(contentType?: string): Headers {
    const headers = new Headers({ accept: "application/json" });
    if (contentType) headers.set("content-type", contentType);
    if (this.#options.username || this.#options.password) {
      const credentials = Buffer.from(`${this.#options.username ?? ""}:${this.#options.password ?? ""}`).toString("base64");
      headers.set("authorization", `Basic ${credentials}`);
    }
    return headers;
  }

  async #request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#options.requestTimeoutMs ?? 25_000);
    try {
      const response = await this.#fetch(joinUrl(this.#options.internalBaseUrl, path), {
        ...init,
        headers: init.headers ?? this.#headers(),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new TorrentGatewayError(categoryForStatus(response.status), safeMessage(response.status), {
          status: response.status,
        });
      }
      return response;
    } catch (error) {
      if (error instanceof TorrentGatewayError) throw error;
      const timedOut = error instanceof DOMException && error.name === "AbortError";
      throw new TorrentGatewayError(
        timedOut ? "torrent_metadata_timeout" : "gateway_unavailable",
        timedOut ? "Torrent metadata is taking longer than expected." : "The Torrent Gateway is unavailable.",
        { cause: error, status: timedOut ? 504 : 503 },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async #resource(infoHash: string): Promise<WebtorResource> {
    return this.#request(`resource/${encodeURIComponent(infoHash)}`).then((response) => response.json());
  }

  async #files(resource: WebtorResource, infoHash: string): Promise<readonly WebtorListedFile[]> {
    if (resource.multi_file === false && resource.file) {
      const contentId = stringValue(resource.file.id);
      if (!contentId) {
        throw new TorrentGatewayError("invalid_torrent", "The Torrent Gateway returned an invalid file identity.", { status: 502 });
      }
      return Object.freeze([{ manifest: this.#normalizeListItem(resource.file, 0), contentId }]);
    }
    const total = numberValue(resource.files_count);
    if (total !== null && total > TORRENT_MANIFEST_MAX_FILES) {
      throw new TorrentGatewayError("invalid_torrent", `This torrent contains more than ${TORRENT_MANIFEST_MAX_FILES.toLocaleString()} files.`, { status: 400 });
    }
    const files: WebtorListedFile[] = [];
    for (let offset = 0; ; offset += TORRENT_MANIFEST_PAGE_SIZE) {
      const query = new URLSearchParams({ output: "list", limit: String(TORRENT_MANIFEST_PAGE_SIZE), offset: String(offset) });
      const payload = await this.#request(`resource/${encodeURIComponent(infoHash)}/list?${query}`).then((response) => response.json()) as { items?: WebtorListItem[]; items_count?: number };
      const items = Array.isArray(payload.items) ? payload.items : [];
      for (const item of items) {
        if (item.type !== "file") continue;
        const contentId = stringValue(item.id);
        if (!contentId) {
          throw new TorrentGatewayError("invalid_torrent", "The Torrent Gateway returned an invalid file identity.", { status: 502 });
        }
        files.push({ manifest: this.#normalizeListItem(item, files.length), contentId });
        if (files.length > TORRENT_MANIFEST_MAX_FILES) {
          throw new TorrentGatewayError("invalid_torrent", `This torrent contains more than ${TORRENT_MANIFEST_MAX_FILES.toLocaleString()} files.`, { status: 400 });
        }
      }
      const listedCount = numberValue(payload.items_count) ?? total;
      if (items.length === 0 || items.length < TORRENT_MANIFEST_PAGE_SIZE || (listedCount !== null && offset + items.length >= listedCount)) break;
    }
    const contentIds = new Set<string>();
    for (const file of files) {
      if (contentIds.has(file.contentId)) {
        throw new TorrentGatewayError("invalid_torrent", "The Torrent Gateway returned duplicate file identities.", { status: 502 });
      }
      contentIds.add(file.contentId);
    }
    return Object.freeze(files);
  }

  #normalizeListItem(item: WebtorListItem, index: number): TorrentManifestFile {
    const path = stringValue(item.path);
    const sizeBytes = numberValue(item.size);
    if (path === null || sizeBytes === null) {
      throw new TorrentGatewayError("invalid_torrent", "The Torrent Gateway returned an invalid file manifest.", { status: 502 });
    }
    return classifyTorrentFile({
      index,
      path,
      name: stringValue(item.name),
      sizeBytes,
      gatewayMediaFormat: stringValue(item.media_format),
    });
  }

  async inspect(input: TorrentGatewayInput): Promise<TorrentInspection> {
    const identity = input.kind === "magnet"
      ? await parseMagnetIdentity(input.magnetUri)
      : await parseTorrentFileIdentity(input.bytes);
    const body = input.kind === "magnet"
      ? identity.magnetUri ?? input.magnetUri
      : new Blob([Uint8Array.from(input.bytes)], { type: "application/x-bittorrent" });
    const contentType = input.kind === "magnet" ? "text/plain;charset=utf-8" : "application/x-bittorrent";
    const resource = await this.#request("resource/", {
      method: "POST",
      headers: this.#headers(contentType),
      body,
    }).then((response) => response.json()) as WebtorResource;
    const resourceId = stringValue(resource.id)?.toLowerCase();
    if (resourceId !== identity.infoHash) {
      throw new TorrentGatewayError("invalid_torrent", "The Torrent Gateway returned a different torrent identity.", { status: 502 });
    }
    let files: readonly WebtorListedFile[];
    try {
      files = await this.#files(resource, identity.infoHash);
    } catch (error) {
      if (
        error instanceof TorrentGatewayError &&
        (error.category === "torrent_metadata_timeout" ||
          error.category === "torrent_metadata_unavailable")
      ) {
        return Object.freeze({
          infoHash: identity.infoHash,
          torrentName: stringValue(resource.name) ?? identity.name,
          status: "waiting_for_peers",
          files: Object.freeze([]),
          totalFiles: numberValue(resource.files_count) ?? 0,
          truncated: false,
        });
      }
      throw error;
    }
    return Object.freeze({
      infoHash: identity.infoHash,
      torrentName: stringValue(resource.name) ?? identity.name,
      status: "ready",
      files: Object.freeze(files.map((file) => file.manifest)),
      totalFiles: files.length,
      truncated: false,
    });
  }

  async inspectRegistered(infoHash: string): Promise<TorrentInspection> {
    const resource = await this.#resource(infoHash);
    const files = await this.#files(resource, infoHash);
    return Object.freeze({
      infoHash,
      torrentName: stringValue(resource.name),
      status: "ready",
      files: Object.freeze(files.map((file) => file.manifest)),
      totalFiles: files.length,
      truncated: false,
    });
  }

  async #export(infoHash: string, contentId: string, types: string): Promise<WebtorExportResponse> {
    const query = new URLSearchParams({ types });
    return this.#request(`resource/${encodeURIComponent(infoHash)}/export/${encodeURIComponent(contentId)}?${query}`).then((response) => response.json());
  }

  async #verifiedFile(input: PrepareTorrentInput): Promise<WebtorListedFile> {
    const resource = await this.#resource(input.infoHash);
    const files = await this.#files(resource, input.infoHash);
    const file = files.find((candidate) => candidate.manifest.index === input.fileIndex);
    if (!file || file.manifest.path !== input.expectedFilePath) {
      throw new TorrentGatewayError("selected_file_missing", "The selected video file is no longer present in this torrent.", { status: 409 });
    }
    if (!file.manifest.playableCandidate) {
      throw new TorrentGatewayError("unsupported_media", "The selected torrent file is not a supported video candidate.", { status: 415 });
    }
    return file;
  }

  async prepare(input: PrepareTorrentInput): Promise<ResolvedTorrentPlaybackSource> {
    const file = await this.#verifiedFile(input);
    const exported = await this.#export(input.infoHash, file.contentId, "stream,media_probe");
    const stream = exported.exports?.stream;
    const rawUrl = stringValue(stream?.url) ?? stringValue(stream?.html_tag?.src) ?? stream?.html_tag?.sources?.map((source) => stringValue(source.src)).find(Boolean) ?? null;
    if (!rawUrl) {
      throw new TorrentGatewayError("stream_prepare_failed", "The Torrent Gateway did not produce a playable stream.", { status: 502 });
    }
    let probe: TorrentMediaProbe | null = null;
    const probeUrl = stringValue(exported.exports?.media_probe?.url);
    if (probeUrl) {
      try {
        const response = await this.#fetch(probeUrl, { headers: this.#headers(), cache: "no-store" });
        if (response.ok) probe = normalizeProbe(await response.json(), stream?.meta?.transcode === true);
      } catch {
        probe = null;
      }
    }
    return Object.freeze({
      kind: rawUrl.toLowerCase().includes(".m3u8") ? "hls" : "http",
      url: publicMediaUrl(rawUrl, this.#options),
      timelineOffsetSec: 0,
      mediaIdentity: `${input.infoHash}:${input.fileIndex}`,
      capabilities: Object.freeze({ seek: true, playbackRate: true }),
      probe,
    });
  }

  async resolvePlayback(input: ResolveTorrentPlaybackInput): Promise<ResolvedTorrentPlaybackSource> {
    const resolved = await this.prepare(input);
    return Object.freeze({
      ...resolved,
      mediaIdentity: `${input.mediaId}:${input.sourceRevision}:${resolved.mediaIdentity}`,
    });
  }

  async getStatus(input: TorrentStatusInput): Promise<TorrentGatewayStatus> {
    try {
      await this.#resource(input.infoHash);
      return Object.freeze({ infoHash: input.infoHash, status: "ready", peers: null, downloadBytesPerSec: null, errorCategory: null });
    } catch (error) {
      const category = error instanceof TorrentGatewayError ? error.category : "unknown_torrent_error";
      return Object.freeze({
        infoHash: input.infoHash,
        status: category === "torrent_metadata_unavailable" ? "waiting_for_peers" : "error",
        peers: null,
        downloadBytesPerSec: null,
        errorCategory: category,
      });
    }
  }

  async fetchSubtitle(input: PrepareTorrentInput): Promise<Readonly<{ name: string; text: string }>> {
    const resource = await this.#resource(input.infoHash);
    const files = await this.#files(resource, input.infoHash);
    const file = files.find((candidate) => candidate.manifest.index === input.fileIndex);
    if (!file || file.manifest.path !== input.expectedFilePath || file.manifest.kind !== "subtitle") {
      throw new TorrentGatewayError("subtitle_import_failed", "The selected subtitle file is no longer available.", { status: 404 });
    }
    if (file.manifest.sizeBytes > TORRENT_METADATA_MAX_BYTES) {
      throw new TorrentGatewayError("subtitle_import_failed", "The selected subtitle file is too large to import.", { status: 400 });
    }
    const exported = await this.#export(input.infoHash, file.contentId, "download");
    const url = stringValue(exported.exports?.download?.url);
    if (!url) throw new TorrentGatewayError("subtitle_import_failed", "The Torrent Gateway did not provide the subtitle file.", { status: 502 });
    const response = await this.#fetch(url, { headers: this.#headers(), cache: "no-store" });
    if (!response.ok) throw new TorrentGatewayError("subtitle_import_failed", "The subtitle file could not be retrieved.", { status: 502 });
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > TORRENT_METADATA_MAX_BYTES) {
      throw new TorrentGatewayError("subtitle_import_failed", "The selected subtitle file is too large to import.", { status: 400 });
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > TORRENT_METADATA_MAX_BYTES) throw new TorrentGatewayError("subtitle_import_failed", "The selected subtitle file is too large to import.", { status: 400 });
    return Object.freeze({ name: file.manifest.name, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) });
  }
}
