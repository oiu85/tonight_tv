import { NextResponse } from "next/server";

import { TorrentGatewayError } from "@/lib/torrent/torrent-contracts";
import { ensureGatewaySource } from "@/lib/torrent/torrent-playback-server";
import { requireAuthorizedTorrentMedia } from "@/lib/torrent/torrent-route-auth";
import { torrentRouteError } from "@/lib/torrent/torrent-route-response";
import { getTorrentGateway } from "@/lib/torrent/torrent-server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  route: { params: Promise<{ roomId: string; mediaId: string }> },
): Promise<NextResponse> {
  try {
    const { roomId, mediaId } = await route.params;
    const { context, media } = await requireAuthorizedTorrentMedia(roomId, mediaId);
    if (!context.isOwner) {
      throw new TorrentGatewayError("gateway_auth_failed", "Only the room owner may import Torrent subtitles.", { status: 403 });
    }
    const body = await request.json() as { index?: unknown; path?: unknown };
    if (!Number.isInteger(body.index) || typeof body.path !== "string") {
      throw new TorrentGatewayError("subtitle_import_failed", "Subtitle file selection is invalid.", { status: 400 });
    }
    const gateway = getTorrentGateway();
    await ensureGatewaySource(gateway, media, async (path) => {
      const { data, error } = await context.supabase.storage.from("torrent-metadata").download(path);
      if (error || !(data instanceof Blob)) throw error ?? new Error("Torrent metadata download failed");
      return data;
    });
    return NextResponse.json(await gateway.fetchSubtitle({
      infoHash: media.torrent_info_hash ?? "",
      fileIndex: body.index as number,
      expectedFilePath: body.path,
    }));
  } catch (error) {
    return torrentRouteError(error);
  }
}
