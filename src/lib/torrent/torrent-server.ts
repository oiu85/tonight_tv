import "server-only";

import { WebtorTorrentGateway } from "./webtor-torrent-gateway";
import { TorrentGatewayError } from "./torrent-contracts";

function requiredServerUrl(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new TorrentGatewayError(
      "gateway_unavailable",
      `Torrent Gateway is not configured. Set ${name} in the server environment, then restart Tonight TV.`,
      { status: 503 },
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TorrentGatewayError(
      "gateway_unavailable",
      `Torrent Gateway configuration is invalid. ${name} must be an HTTP or HTTPS URL.`,
      { status: 503 },
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TorrentGatewayError(
      "gateway_unavailable",
      `Torrent Gateway configuration is invalid. ${name} must use HTTP or HTTPS.`,
      { status: 503 },
    );
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
