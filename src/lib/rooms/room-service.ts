import type { SupabaseClient } from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "../supabase/browser";
import type { Database } from "../supabase/database.types";

type PublicFunctions = Database["public"]["Functions"];

export type CreatedRoom = PublicFunctions["create_room"]["Returns"][number];
export type JoinedRoomSession = PublicFunctions["join_room"]["Returns"][number];
export type OwnedRoom = Readonly<Database["public"]["Tables"]["rooms"]["Row"]>;
export type OwnedRoomListItem = Readonly<PublicFunctions["list_owned_rooms"]["Returns"][number]>;
export type RenamedRoom = PublicFunctions["rename_room"]["Returns"][number];
export type DeactivatedRoom = PublicFunctions["deactivate_room"]["Returns"][number];
export type ReactivatedRoom = PublicFunctions["reactivate_room"]["Returns"][number];
export type DeletedRoom = PublicFunctions["hard_delete_room"]["Returns"][number];

export type RoomStatus = Database["public"]["Enums"]["room_status"];

export type RoomJoinPreview = Readonly<
  Omit<PublicFunctions["get_room_join_preview"]["Returns"][number], "current_title"> & {
    current_title: string | null;
  }
>;

export type RoomSnapshot = Readonly<{
  server_time: string;
  room: Readonly<{
    id: string;
    name: string;
    owner_user_id: string;
    created_at: string;
    updated_at: string;
    status: RoomStatus;
    deactivated_at: string | null;
  }>;
  caller: Readonly<{
    user_id: string;
    is_owner: boolean;
    room_session_id: string | null;
    display_name: string | null;
  }>;
  playback: Readonly<{
    room_id: string;
    current_media_id: string | null;
    status: Database["public"]["Enums"]["playback_status"];
    anchor_position_sec: number;
    anchor_server_time: string;
    state_version: number;
    updated_at: string;
  }>;
  current_media: Readonly<{
    id: string;
    title: string;
    source_url: string | null;
    source_type: Database["public"]["Enums"]["media_source_type"];
    source_revision: number;
    youtube_video_id: string | null;
    torrent_info_hash: string | null;
    torrent_input_kind: Database["public"]["Enums"]["torrent_input_kind"] | null;
    torrent_file_index: number | null;
    torrent_file_path: string | null;
    torrent_file_name: string | null;
    torrent_file_size: number | null;
    queue_position: number;
    created_at: string;
    updated_at: string;
  }> | null;
  subtitles: readonly Readonly<{
    id: string;
    media_id: string;
    label: string;
    language_code: string | null;
    storage_path: string;
    format: "vtt";
    created_at: string;
  }>[];
  queue: readonly Readonly<{
    id: string;
    title: string;
    source_url: string | null;
    source_type: Database["public"]["Enums"]["media_source_type"];
    source_revision: number;
    youtube_video_id: string | null;
    torrent_info_hash: string | null;
    torrent_input_kind: Database["public"]["Enums"]["torrent_input_kind"] | null;
    torrent_file_index: number | null;
    torrent_file_path: string | null;
    torrent_file_name: string | null;
    torrent_file_size: number | null;
    queue_position: number;
    created_at: string;
    updated_at: string;
  }>[];
  recent_chat: readonly Readonly<{
    id: string;
    user_id: string | null;
    sender_display_name: string;
    body: string;
    created_at: string;
  }>[];
}>;

export type RoomServiceErrorCode =
  | "authentication_required"
  | "invalid_input"
  | "room_not_found"
  | "permission_denied"
  | "invalid_response"
  | "request_failed";

export class RoomServiceError extends Error {
  readonly code: RoomServiceErrorCode;
  readonly databaseCode?: string;

  constructor(
    code: RoomServiceErrorCode,
    message: string,
    options?: ErrorOptions & { databaseCode?: string },
  ) {
    super(message, options);
    this.name = "RoomServiceError";
    this.code = code;
    this.databaseCode = options?.databaseCode;
  }
}

export type RoomService = Readonly<{
  createRoom: (name: string) => Promise<CreatedRoom>;
  listOwnedRooms: (options?: { includeDeactivated?: boolean }) => Promise<readonly OwnedRoomListItem[]>;
  renameRoom: (roomId: string, name: string) => Promise<RenamedRoom>;
  deactivateRoom: (roomId: string) => Promise<DeactivatedRoom>;
  reactivateRoom: (roomId: string) => Promise<ReactivatedRoom>;
  hardDeleteRoom: (roomId: string) => Promise<DeletedRoom>;
  joinRoom: (roomId: string, displayName: string) => Promise<JoinedRoomSession>;
  getRoomJoinPreview: (roomId: string) => Promise<RoomJoinPreview>;
  fetchSnapshot: (roomId: string, chatLimit?: number) => Promise<RoomSnapshot>;
  sampleServerTime: () => Promise<string>;
}>;

type DatabaseError = Readonly<{
  code?: string;
  message?: string;
}>;

function asRoomServiceError(error: DatabaseError, fallback: string): RoomServiceError {
  switch (error.code) {
    case "22023":
      return new RoomServiceError("invalid_input", "The room request is invalid.", {
        cause: error,
        databaseCode: error.code,
      });
    case "P0002":
      return new RoomServiceError("room_not_found", "The room was not found.", {
        cause: error,
        databaseCode: error.code,
      });
    case "42501": {
      const authenticationRequired = error.message === "Authentication is required";
      return new RoomServiceError(
        authenticationRequired ? "authentication_required" : "permission_denied",
        authenticationRequired
          ? "Authentication is required for this room operation."
          : "You do not have access to this room.",
        { cause: error, databaseCode: error.code },
      );
    }
    default:
      return new RoomServiceError("request_failed", fallback, {
        cause: error,
        databaseCode: error.code,
      });
  }
}

function invalidResponse(operation: string): RoomServiceError {
  return new RoomServiceError(
    "invalid_response",
    `Supabase returned an invalid response for ${operation}.`,
  );
}

function validateRoomId(roomId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId)) {
    throw new RoomServiceError("invalid_input", "Room ID must be a valid UUID.");
  }
}

function firstRow<T>(rows: readonly T[] | null, operation: string): T {
  if (!rows || rows.length !== 1) {
    throw invalidResponse(operation);
  }

  return rows[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasSnapshotShape(value: unknown): value is RoomSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  const { room, caller, playback, current_media: currentMedia } = value;

  return (
    typeof value.server_time === "string" &&
    isRecord(room) &&
    typeof room.id === "string" &&
    typeof room.name === "string" &&
    typeof room.owner_user_id === "string" &&
    typeof room.created_at === "string" &&
    typeof room.updated_at === "string" &&
    (room.status === "active" || room.status === "deactivated") &&
    (room.deactivated_at === null || typeof room.deactivated_at === "string") &&
    isRecord(caller) &&
    typeof caller.user_id === "string" &&
    typeof caller.is_owner === "boolean" &&
    (caller.room_session_id === null || typeof caller.room_session_id === "string") &&
    (caller.display_name === null || typeof caller.display_name === "string") &&
    isRecord(playback) &&
    typeof playback.room_id === "string" &&
    (playback.current_media_id === null ||
      typeof playback.current_media_id === "string") &&
    typeof playback.status === "string" &&
    typeof playback.anchor_position_sec === "number" &&
    typeof playback.anchor_server_time === "string" &&
    typeof playback.state_version === "number" &&
    typeof playback.updated_at === "string" &&
    (currentMedia === null || isRecord(currentMedia)) &&
    Array.isArray(value.subtitles) &&
    Array.isArray(value.queue) &&
    Array.isArray(value.recent_chat)
  );
}

export function createRoomService(client: SupabaseClient<Database>): RoomService {
  async function createRoom(name: string): Promise<CreatedRoom> {
    const { data, error } = await client.rpc("create_room", { p_name: name });

    if (error) {
      throw asRoomServiceError(error, "Unable to create the room.");
    }

    return firstRow(data, "room creation");
  }

  async function listOwnedRooms(
    options: { includeDeactivated?: boolean } = {},
  ): Promise<readonly OwnedRoomListItem[]> {
    const includeDeactivated = options.includeDeactivated ?? false;
    const { data, error } = await client.rpc("list_owned_rooms", {
      p_include_deactivated: includeDeactivated,
    });
    if (error) {
      throw asRoomServiceError(error, "Unable to load your rooms.");
    }
    return Object.freeze((data ?? []).map((room) => Object.freeze(room)));
  }

  async function deactivateRoom(roomId: string): Promise<DeactivatedRoom> {
    validateRoomId(roomId);
    const { data, error } = await client.rpc("deactivate_room", { p_room_id: roomId });
    if (error) {
      throw asRoomServiceError(error, "Unable to deactivate the room.");
    }
    return firstRow(data, "room deactivation");
  }

  async function reactivateRoom(roomId: string): Promise<ReactivatedRoom> {
    validateRoomId(roomId);
    const { data, error } = await client.rpc("reactivate_room", { p_room_id: roomId });
    if (error) {
      throw asRoomServiceError(error, "Unable to reactivate the room.");
    }
    return firstRow(data, "room reactivation");
  }

  async function hardDeleteRoom(roomId: string): Promise<DeletedRoom> {
    validateRoomId(roomId);
    const { data, error } = await client.rpc("hard_delete_room", { p_room_id: roomId });
    if (error) {
      throw asRoomServiceError(error, "Unable to delete the room.");
    }
    return firstRow(data, "room deletion");
  }

  async function renameRoom(roomId: string, name: string): Promise<RenamedRoom> {
    validateRoomId(roomId);
    const normalizedName = name.trim();
    if (normalizedName.length < 1 || normalizedName.length > 120) {
      throw new RoomServiceError(
        "invalid_input",
        "Room name must contain between 1 and 120 characters.",
      );
    }
    const { data, error } = await client.rpc("rename_room", {
      p_room_id: roomId,
      p_name: normalizedName,
    });
    if (error) {
      throw asRoomServiceError(error, "Unable to rename the room.");
    }
    return firstRow(data, "room rename");
  }

  async function joinRoom(
    roomId: string,
    displayName: string,
  ): Promise<JoinedRoomSession> {
    const { data, error } = await client.rpc("join_room", {
      p_room_id: roomId,
      p_display_name: displayName,
    });

    if (error) {
      throw asRoomServiceError(error, "Unable to join the room.");
    }

    return firstRow(data, "room join");
  }

  async function getRoomJoinPreview(roomId: string): Promise<RoomJoinPreview> {
    const { data, error } = await client.rpc("get_room_join_preview", {
      p_room_id: roomId,
    });

    if (error) {
      throw asRoomServiceError(error, "Unable to load the room preview.");
    }

    if (!data || data.length === 0) {
      throw new RoomServiceError("room_not_found", "The room was not found.");
    }

    return firstRow(data, "room preview");
  }

  async function fetchSnapshot(
    roomId: string,
    chatLimit = 50,
  ): Promise<RoomSnapshot> {
    const { data, error } = await client.rpc("get_room_snapshot", {
      p_room_id: roomId,
      p_chat_limit: chatLimit,
    });

    if (error) {
      throw asRoomServiceError(error, "Unable to load the room snapshot.");
    }

    if (!hasSnapshotShape(data)) {
      throw invalidResponse("room snapshot");
    }

    return data;
  }

  async function sampleServerTime(): Promise<string> {
    const { data, error } = await client.rpc("get_server_time");

    if (error) {
      throw asRoomServiceError(error, "Unable to sample database time.");
    }

    if (typeof data !== "string" || Number.isNaN(Date.parse(data))) {
      throw invalidResponse("server time sampling");
    }

    return data;
  }

  return Object.freeze({
    createRoom,
    listOwnedRooms,
    renameRoom,
    deactivateRoom,
    reactivateRoom,
    hardDeleteRoom,
    joinRoom,
    getRoomJoinPreview,
    fetchSnapshot,
    sampleServerTime,
  });
}

let browserRoomService: RoomService | undefined;

export function getBrowserRoomService(): RoomService {
  browserRoomService ??= createRoomService(createBrowserSupabaseClient());
  return browserRoomService;
}
