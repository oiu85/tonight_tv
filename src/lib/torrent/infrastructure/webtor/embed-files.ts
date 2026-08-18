import type { TorrentManifestFile } from "../../domain/contracts";
import { classifyTorrentFile } from "../../domain/manifest";

function joinPath(parent: string, segment: string): string {
  const left = parent.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const right = segment.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!left) return right;
  if (!right) return left;
  return `${left}/${right}`;
}

function pathFrom(raw: Readonly<Record<string, unknown>>, parentPath: string): string | null {
  if (Array.isArray(raw.path)) {
    const nested = raw.path.map((segment) => String(segment ?? "").trim()).filter(Boolean).join("/");
    return nested || null;
  }
  const explicit = typeof raw.path === "string" ? raw.path.trim() : "";
  if (explicit) return explicit.replace(/\\/g, "/").replace(/^\/+/g, "");
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name) return joinPath(parentPath, name);
  return parentPath || null;
}

function nestedEntries(raw: Readonly<Record<string, unknown>>): unknown {
  return raw.files ?? raw.items ?? raw.children ?? null;
}

function isDirectory(raw: Readonly<Record<string, unknown>>): boolean {
  const type = typeof raw.type === "string" ? raw.type.toLowerCase() : "";
  return type === "dir" || type === "directory";
}

/**
 * Webtor's TORRENT_FETCHED payload is not a stable contract. Flatten nested
 * trees, skip directories, and ignore entries that cannot be classified so
 * inspection can still succeed for a cached single-file movie.
 */
export function collectWebtorFiles(payload: unknown): TorrentManifestFile[] {
  const files: TorrentManifestFile[] = [];
  const seen = new Set<string>();

  function visit(node: unknown, parentPath: string): void {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parentPath);
      return;
    }
    if (typeof node !== "object") return;

    const raw = node as Record<string, unknown>;
    const nested = nestedEntries(raw);
    if (Array.isArray(nested) && nested.length > 0) {
      const dirName = typeof raw.name === "string" && isDirectory(raw) ? raw.name : "";
      visit(nested, dirName ? joinPath(parentPath, dirName) : parentPath);
      if (isDirectory(raw)) return;
    }

    if (isDirectory(raw)) return;

    const path = pathFrom(raw, parentPath);
    if (!path || seen.has(path)) return;

    const sizeBytes = Math.max(0, Number(raw.length ?? raw.size ?? 0));
    if (!Number.isFinite(sizeBytes) || !Number.isSafeInteger(sizeBytes)) return;

    try {
      const classified = classifyTorrentFile({
        index: files.length,
        path,
        name: typeof raw.name === "string" ? raw.name : null,
        sizeBytes,
      });
      seen.add(path);
      files.push(classified);
    } catch {
      // Skip malformed Webtor entries instead of aborting the whole inspect.
    }
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const data = payload as Record<string, unknown>;
    const torrent = data.torrent && typeof data.torrent === "object" && !Array.isArray(data.torrent)
      ? data.torrent as Record<string, unknown>
      : null;
    visit(data.files ?? data.items ?? torrent?.files ?? torrent?.items ?? payload, "");
    return files;
  }

  visit(payload, "");
  return files;
}
