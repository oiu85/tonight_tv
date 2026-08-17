"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "../supabase/browser";
import type { Database } from "../supabase/database.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CHAT_MESSAGE_MAX_LENGTH = 1000;
export const CHAT_HISTORY_MAX_MESSAGES = 100;

export type ChatMessage = Readonly<
  Database["public"]["Tables"]["chat_messages"]["Row"]
>;

export type RoomChatErrorCode =
  | "authentication_required"
  | "permission_denied"
  | "rate_limited"
  | "invalid_input"
  | "invalid_response"
  | "request_failed";

export class RoomChatError extends Error {
  readonly code: RoomChatErrorCode;
  readonly databaseCode?: string;

  constructor(
    code: RoomChatErrorCode,
    message: string,
    options?: ErrorOptions & { databaseCode?: string },
  ) {
    super(message, options);
    this.name = "RoomChatError";
    this.code = code;
    this.databaseCode = options?.databaseCode;
  }
}

export type RoomChatService = Readonly<{
  hydrate: (
    roomId: string,
    recentMessages: readonly unknown[],
  ) => readonly ChatMessage[];
  sendMessage: (roomId: string, body: string) => Promise<ChatMessage>;
  mergeLiveMessage: (message: unknown) => readonly ChatMessage[];
  getMessages: () => readonly ChatMessage[];
  subscribe: (
    listener: (messages: readonly ChatMessage[]) => void,
  ) => () => void;
  clear: () => void;
}>;

type DatabaseError = Readonly<{
  code?: string;
  message?: string;
  details?: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function textLength(value: string): number {
  return Array.from(value).length;
}

export function parseChatMessage(
  value: unknown,
  expectedRoomId?: string,
): ChatMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isUuid(value.id) ||
    !isUuid(value.room_id) ||
    (expectedRoomId !== undefined && value.room_id !== expectedRoomId) ||
    (value.user_id !== null && !isUuid(value.user_id)) ||
    typeof value.sender_display_name !== "string" ||
    value.sender_display_name !== value.sender_display_name.trim() ||
    textLength(value.sender_display_name) < 1 ||
    textLength(value.sender_display_name) > 40 ||
    typeof value.body !== "string" ||
    value.body !== value.body.trim() ||
    textLength(value.body) < 1 ||
    textLength(value.body) > CHAT_MESSAGE_MAX_LENGTH ||
    !isTimestamp(value.created_at)
  ) {
    return null;
  }

  return Object.freeze({
    id: value.id,
    room_id: value.room_id,
    user_id: value.user_id,
    sender_display_name: value.sender_display_name,
    body: value.body,
    created_at: value.created_at,
  });
}

function compareMessages(left: ChatMessage, right: ChatMessage): number {
  const timestampOrder = left.created_at.localeCompare(right.created_at);
  if (timestampOrder !== 0) {
    return timestampOrder;
  }

  return left.id.localeCompare(right.id);
}

export function mergeChatMessages(
  current: readonly ChatMessage[],
  incoming: readonly unknown[],
  expectedRoomId: string,
): readonly ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));

  for (const value of incoming) {
    const message = parseChatMessage(value, expectedRoomId);
    if (!message) {
      throw new RoomChatError(
        "invalid_response",
        "Supabase returned an invalid room chat message.",
      );
    }
    byId.set(message.id, message);
  }

  return Object.freeze(
    [...byId.values()].sort(compareMessages).slice(-CHAT_HISTORY_MAX_MESSAGES),
  );
}

function asChatError(error: DatabaseError): RoomChatError {
  if (
    error.code === "P0001" &&
    (error.message === "Chat rate limit exceeded" ||
      error.details?.includes("CHAT_RATE_LIMIT"))
  ) {
    return new RoomChatError(
      "rate_limited",
      "You're sending messages too quickly. Try again shortly.",
      { cause: error, databaseCode: error.code },
    );
  }

  if (error.code === "22023" || error.code === "23514") {
    return new RoomChatError(
      "invalid_input",
      error.message ?? "The chat message is invalid.",
      { cause: error, databaseCode: error.code },
    );
  }

  if (error.code === "42501") {
    const authenticationRequired = error.message === "Authentication is required";
    return new RoomChatError(
      authenticationRequired ? "authentication_required" : "permission_denied",
      authenticationRequired
        ? "Authentication is required to send a chat message."
        : "You do not have access to send chat messages in this room.",
      { cause: error, databaseCode: error.code },
    );
  }

  return new RoomChatError("request_failed", "Unable to send the chat message.", {
    cause: error,
    databaseCode: error.code,
  });
}

function validateSendInput(roomId: string, body: string): string {
  if (!isUuid(roomId)) {
    throw new RoomChatError("invalid_input", "Room ID must be a valid UUID.");
  }

  const normalizedBody = body.trim();
  if (normalizedBody.length < 1) {
    throw new RoomChatError("invalid_input", "Chat message cannot be empty.");
  }
  if (textLength(normalizedBody) > CHAT_MESSAGE_MAX_LENGTH) {
    throw new RoomChatError(
      "invalid_input",
      `Chat message cannot exceed ${CHAT_MESSAGE_MAX_LENGTH} characters.`,
    );
  }

  return normalizedBody;
}

export function createRoomChatService(
  client: SupabaseClient<Database>,
): RoomChatService {
  let activeRoomId: string | null = null;
  let messages: readonly ChatMessage[] = Object.freeze([]);
  const listeners = new Set<(messages: readonly ChatMessage[]) => void>();

  function publish(): void {
    for (const listener of listeners) {
      listener(messages);
    }
  }

  function hydrate(
    roomId: string,
    recentMessages: readonly unknown[],
  ): readonly ChatMessage[] {
    if (!isUuid(roomId)) {
      throw new RoomChatError("invalid_input", "Room ID must be a valid UUID.");
    }

    const existingMessages = activeRoomId === roomId ? messages : [];
    activeRoomId = roomId;
    messages = mergeChatMessages(
      existingMessages,
      recentMessages.map((message) =>
        isRecord(message) && message.room_id === undefined
          ? { ...message, room_id: roomId }
          : message,
      ),
      roomId,
    );
    publish();
    return messages;
  }

  async function sendMessage(roomId: string, body: string): Promise<ChatMessage> {
    const normalizedBody = validateSendInput(roomId, body);
    const { data, error } = await client.rpc("send_chat_message", {
      p_room_id: roomId,
      p_body: normalizedBody,
    });

    if (error) {
      throw asChatError(error);
    }

    if (!data || data.length !== 1) {
      throw new RoomChatError(
        "invalid_response",
        "Supabase returned an invalid response for the chat send.",
      );
    }

    const message = parseChatMessage(data[0], roomId);
    if (!message) {
      throw new RoomChatError(
        "invalid_response",
        "Supabase returned an invalid response for the chat send.",
      );
    }

    activeRoomId ??= roomId;
    if (activeRoomId === roomId) {
      messages = mergeChatMessages(messages, [message], roomId);
      publish();
    }

    return message;
  }

  function mergeLiveMessage(message: unknown): readonly ChatMessage[] {
    if (!activeRoomId) {
      throw new RoomChatError(
        "invalid_input",
        "Room chat must be hydrated before live messages are merged.",
      );
    }

    messages = mergeChatMessages(messages, [message], activeRoomId);
    publish();
    return messages;
  }

  function subscribe(
    listener: (messages: readonly ChatMessage[]) => void,
  ): () => void {
    listeners.add(listener);
    listener(messages);
    return () => listeners.delete(listener);
  }

  function clear(): void {
    activeRoomId = null;
    messages = Object.freeze([]);
    publish();
  }

  return Object.freeze({
    hydrate,
    sendMessage,
    mergeLiveMessage,
    getMessages: () => messages,
    subscribe,
    clear,
  });
}

let browserRoomChatService: RoomChatService | undefined;

export function getBrowserRoomChatService(): RoomChatService {
  browserRoomChatService ??= createRoomChatService(createBrowserSupabaseClient());
  return browserRoomChatService;
}
