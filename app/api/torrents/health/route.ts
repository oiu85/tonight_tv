import { NextResponse } from "next/server";

import { torrentRouteError, getTorrentGateway } from "@/lib/torrent/infrastructure/server";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const status = await getTorrentGateway().getStatus({ infoHash: "0000000000000000000000000000000000000000" });
    const reachable = status.errorCategory === "torrent_metadata_unavailable" || status.status === "ready";
    return NextResponse.json({ reachable }, { status: reachable ? 200 : 503 });
  } catch (error) {
    return torrentRouteError(error);
  }
}
