import "server-only";

import type { Database } from "../../supabase/database.types";
import { TorrentGatewayError, type TorrentGateway } from "../domain/contracts";

type TorrentMedia = Database["public"]["Tables"]["media_items"]["Row"];

export async function ensureGatewaySource(
  gateway: TorrentGateway,
  media: TorrentMedia,
  downloadMetadata: (path: string) => Promise<Blob>,
): Promise<void> {
  if (!media.torrent_info_hash) {
    throw new TorrentGatewayError("invalid_torrent", "Torrent identity is missing.", { status: 500 });
  }
  const status = await gateway.getStatus({ infoHash: media.torrent_info_hash });
  if (status.status === "ready") return;

  const inspection = media.torrent_input_kind === "magnet"
    ? await gateway.inspect({
        kind: "magnet",
        magnetUri: media.torrent_magnet_uri ?? "",
      })
    : await gateway.inspect({
        kind: "torrent_file",
        bytes: new Uint8Array(await (await downloadMetadata(media.torrent_metadata_path ?? "")).arrayBuffer()),
      });
  if (inspection.infoHash !== media.torrent_info_hash) {
    throw new TorrentGatewayError("invalid_torrent", "Persisted Torrent metadata no longer matches this media item.", { status: 409 });
  }
}

export function selectedTorrentFile(media: TorrentMedia): Readonly<{
  infoHash: string;
  fileIndex: number;
  expectedFilePath: string;
  sourceRevision: number;
  mediaId: string;
}> {
  if (
    !media.torrent_info_hash ||
    media.torrent_file_index === null ||
    !media.torrent_file_path
  ) {
    throw new TorrentGatewayError("selected_file_missing", "The selected Torrent video is incomplete.", { status: 409 });
  }
  return Object.freeze({
    infoHash: media.torrent_info_hash,
    fileIndex: media.torrent_file_index,
    expectedFilePath: media.torrent_file_path,
    sourceRevision: media.source_revision,
    mediaId: media.id,
  });
}
