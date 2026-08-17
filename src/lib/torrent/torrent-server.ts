import "server-only";

import { WebtorTorrentGateway } from "./webtor-torrent-gateway";

function requiredServerUrl(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Torrent media.`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }
  return parsed.toString();
}

let gateway: WebtorTorrentGateway | undefined;

export function getTorrentGateway(): WebtorTorrentGateway {
  gateway ??= new WebtorTorrentGateway({
    internalBaseUrl: requiredServerUrl("TORRENT_GATEWAY_INTERNAL_URL"),
    mediaPublicBaseUrl: requiredServerUrl("TORRENT_MEDIA_PUBLIC_BASE_URL"),
    username: process.env.TORRENT_GATEWAY_USERNAME?.trim(),
    password: process.env.TORRENT_GATEWAY_PASSWORD,
  });
  return gateway;
}
