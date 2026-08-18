import type { SupabaseClient } from "@supabase/supabase-js";

import { createMediaQueueService, type MediaItem, type MediaQueueService } from "../../media/media-queue-service";
import type { Database } from "../../supabase/database.types";
import { LocalP2pError } from "../domain/errors";
import { magnetWithTrackers, mimeTypeFromFileName } from "../domain/magnet";
import type { LocalP2pDescriptor } from "../domain/types";
import type { LocalP2pRuntime } from "./ports";

export type LocalP2pSourceService = Readonly<{
  startDeviceStream: (roomId: string, title: string, file: File) => Promise<Readonly<{ media: MediaItem; descriptor: LocalP2pDescriptor }>>;
  resolveSource: (roomId: string, mediaId: string) => Promise<LocalP2pDescriptor>;
  resumeDeviceStream: (expected: LocalP2pDescriptor, file: File) => Promise<LocalP2pDescriptor>;
}>;

export function createLocalP2pSourceService(
  client: SupabaseClient<Database>,
  runtime: LocalP2pRuntime,
  mediaQueue: Pick<MediaQueueService, "addMedia"> = createMediaQueueService(client),
): LocalP2pSourceService {
  async function startDeviceStream(roomId: string, title: string, file: File) {
    const descriptor = await runtime.seedLocalFile(file);
    try {
      const media = await mediaQueue.addMedia(roomId, { title, sourceType: "local_p2p", localP2p: descriptor });
      return Object.freeze({ media, descriptor });
    } catch (cause) {
      await runtime.leaveLocalStream(descriptor.infoHash).catch(() => undefined);
      throw cause;
    }
  }

  async function resolveSource(roomId: string, mediaId: string): Promise<LocalP2pDescriptor> {
    const { data, error } = await client.rpc("get_local_p2p_source", { p_room_id: roomId, p_media_id: mediaId });
    const row = data?.[0];
    if (error || !row?.info_hash || !row.magnet_uri || !row.file_name || !row.file_size) {
      throw new LocalP2pError(
        "p2p_invalid_descriptor",
        "The authorized device-stream descriptor is unavailable.",
        { cause: error ?? undefined },
      );
    }
    return Object.freeze({
      infoHash: row.info_hash,
      magnetUri: magnetWithTrackers(row.magnet_uri),
      fileName: row.file_name,
      fileSize: row.file_size,
      mimeType: mimeTypeFromFileName(row.file_name),
    });
  }

  async function resumeDeviceStream(expected: LocalP2pDescriptor, file: File): Promise<LocalP2pDescriptor> {
    if (runtime.hasLocalSeed(expected.infoHash)) {
      return expected;
    }
    const descriptor = await runtime.seedLocalFile(file);
    if (descriptor.infoHash !== expected.infoHash || descriptor.fileSize !== expected.fileSize) {
      await runtime.leaveLocalStream(descriptor.infoHash).catch(() => undefined);
      throw new LocalP2pError(
        "p2p_invalid_file",
        "This is not the original file used for the current device stream.",
      );
    }
    return descriptor;
  }

  return Object.freeze({ startDeviceStream, resolveSource, resumeDeviceStream });
}
