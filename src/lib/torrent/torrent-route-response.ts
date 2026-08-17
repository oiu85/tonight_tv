import { NextResponse } from "next/server";

import { TorrentGatewayError } from "./torrent-contracts";

export function torrentRouteError(error: unknown): NextResponse {
  const normalized = error instanceof TorrentGatewayError
    ? error
    : new TorrentGatewayError("unknown_torrent_error", "The Torrent request could not be completed.", {
        cause: error,
        status: 500,
      });
  return NextResponse.json(
    { error: { category: normalized.category, message: normalized.message } },
    { status: normalized.status },
  );
}
