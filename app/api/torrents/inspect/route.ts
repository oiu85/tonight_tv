import { NextResponse } from "next/server";

import { TORRENT_METADATA_MAX_BYTES, TorrentGatewayError } from "@/lib/torrent/domain";
import { requireTorrentOwner, torrentRouteError, getTorrentGateway } from "@/lib/torrent/infrastructure/server";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const declaredLength = Number(request.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > TORRENT_METADATA_MAX_BYTES + 128 * 1024) {
        throw new TorrentGatewayError("invalid_torrent", "Torrent metadata is too large.", { status: 413 });
      }
      const form = await request.formData();
      const roomId = form.get("roomId");
      const file = form.get("torrent");
      if (typeof roomId !== "string" || !(file instanceof File)) {
        throw new TorrentGatewayError("invalid_torrent", "Room and torrent metadata are required.", { status: 400 });
      }
      await requireTorrentOwner(roomId);
      if (file.size === 0 || file.size > TORRENT_METADATA_MAX_BYTES) {
        throw new TorrentGatewayError("invalid_torrent", "Torrent metadata is too large or empty.", { status: 400 });
      }
      const inspection = await getTorrentGateway().inspect({
        kind: "torrent_file",
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      return NextResponse.json(inspection);
    }

    const body = await request.json() as { roomId?: unknown; magnetUri?: unknown };
    if (typeof body.roomId !== "string" || typeof body.magnetUri !== "string") {
      throw new TorrentGatewayError("invalid_magnet", "Room and Magnet URI are required.", { status: 400 });
    }
    await requireTorrentOwner(body.roomId);
    return NextResponse.json(await getTorrentGateway().inspect({ kind: "magnet", magnetUri: body.magnetUri }));
  } catch (error) {
    return torrentRouteError(error);
  }
}
