import { NextResponse } from "next/server";

import { ensureGatewaySource, selectedTorrentFile, requireAuthorizedTorrentMedia, torrentRouteError, getTorrentGateway } from "@/lib/torrent/infrastructure/server";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ roomId: string; mediaId: string }> },
): Promise<NextResponse> {
  try {
    const { roomId, mediaId } = await context.params;
    const { context: auth, media } = await requireAuthorizedTorrentMedia(roomId, mediaId);
    const gateway = getTorrentGateway();
    await ensureGatewaySource(gateway, media, async (path) => {
      const { data, error } = await auth.supabase.storage.from("torrent-metadata").download(path);
      if (error || !(data instanceof Blob)) throw error ?? new Error("Torrent metadata download failed");
      return data;
    });
    const source = await gateway.resolvePlayback(selectedTorrentFile(media));
    return NextResponse.json(source, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return torrentRouteError(error);
  }
}
