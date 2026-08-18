import { NextResponse } from "next/server";

import { TorrentGatewayError } from "@/lib/torrent/domain";
import { requireTorrentOwner, torrentRouteError, getTorrentGateway } from "@/lib/torrent/infrastructure/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ infoHash: string }> },
): Promise<NextResponse> {
  try {
    const roomId = new URL(request.url).searchParams.get("roomId");
    const { infoHash } = await context.params;
    if (!roomId || !/^[a-f0-9]{40}$/i.test(infoHash)) {
      throw new TorrentGatewayError("invalid_torrent", "Room and info hash are required.", { status: 400 });
    }
    await requireTorrentOwner(roomId);
    const gateway = getTorrentGateway();
    const normalizedHash = infoHash.toLowerCase();
    try {
      return NextResponse.json(await gateway.inspectRegistered(normalizedHash));
    } catch {
      return NextResponse.json(await gateway.getStatus({ infoHash: normalizedHash }));
    }
  } catch (error) {
    return torrentRouteError(error);
  }
}
