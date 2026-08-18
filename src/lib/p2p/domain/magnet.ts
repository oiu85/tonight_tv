import { LOCAL_P2P_TRACKERS } from "./constants";

export function magnetWithTrackers(magnetUri: string): string {
  let next = magnetUri.trim();
  if (!next.toLowerCase().startsWith("magnet:?")) return next;
  for (const tracker of LOCAL_P2P_TRACKERS) {
    const encoded = encodeURIComponent(tracker);
    if (next.includes(encoded) || next.includes(tracker)) continue;
    next += `&tr=${encoded}`;
  }
  return next;
}

export function mimeTypeFromFileName(fileName: string): string | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "ogg":
    case "ogv":
      return "video/ogg";
    default:
      return null;
  }
}
