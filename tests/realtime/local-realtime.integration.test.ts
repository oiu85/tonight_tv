import { createClient, type RealtimeChannel, type Session } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import {
  createRoomChannelService,
  type ChatMessageCreatedEvent,
  type PlaybackStateChangedEvent,
} from "../../src/lib/realtime/room-channel-service";
import type { Database } from "../../src/lib/supabase/database.types";

const shouldRun = process.env.TONIGHT_TV_RUN_LOCAL_REALTIME_TESTS === "1";
const localUrl = process.env.TONIGHT_TV_LOCAL_SUPABASE_URL ?? "";
const publishableKey = process.env.TONIGHT_TV_LOCAL_SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.TONIGHT_TV_LOCAL_SUPABASE_SECRET_KEY ?? "";

function createTestClient(key = publishableKey) {
  return createClient<Database>(localUrl, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function subscribe(channel: RealtimeChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        reject(error ?? new Error(`Realtime subscription failed: ${status}`));
      }
    });
  });
}

describe.runIf(shouldRun)("local Supabase private Realtime transport", () => {
  const clients: ReturnType<typeof createTestClient>[] = [];
  const userIds: string[] = [];
  let roomId: string | null = null;

  afterAll(async () => {
    if (!localUrl.startsWith("http://127.0.0.1:")) {
      return;
    }

    const admin = createTestClient(secretKey);
    if (roomId) {
      await admin.from("rooms").delete().eq("id", roomId);
    }
    for (const userId of userIds) {
      await admin.auth.admin.deleteUser(userId);
    }
    await Promise.all(clients.map((client) => client.removeAllChannels()));
  });

  it(
    "authorizes members, rejects outsiders/forged Broadcast, delivers DB playback/chat, and tracks Presence",
    async () => {
      expect(localUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(publishableKey).toBeTruthy();
      expect(secretKey).toBeTruthy();

      const owner = createTestClient();
      const viewer = createTestClient();
      const outsider = createTestClient();
      const admin = createTestClient(secretKey);
      clients.push(owner, viewer, outsider, admin);

      const ownerEmail = `realtime-owner-${crypto.randomUUID()}@example.test`;
      const ownerAuth = await owner.auth.signUp({
        email: ownerEmail,
        password: "local-realtime-password",
      });
      expect(ownerAuth.error).toBeNull();
      expect(ownerAuth.data.session).not.toBeNull();
      expect(ownerAuth.data.user).not.toBeNull();

      const viewerAuth = await viewer.auth.signInAnonymously();
      const outsiderAuth = await outsider.auth.signInAnonymously();
      expect(viewerAuth.error).toBeNull();
      expect(outsiderAuth.error).toBeNull();

      const ownerSession = ownerAuth.data.session as Session;
      const viewerSession = viewerAuth.data.session as Session;
      const outsiderSession = outsiderAuth.data.session as Session;
      userIds.push(
        ownerSession.user.id,
        viewerSession.user.id,
        outsiderSession.user.id,
      );

      const createdRoom = await owner.rpc("create_room", {
        p_name: "Local Realtime Room",
      });
      expect(createdRoom.error).toBeNull();
      roomId = createdRoom.data?.[0]?.room_id ?? null;
      expect(roomId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      const ownerJoin = await owner.rpc("join_room", {
        p_room_id: roomId as string,
        p_display_name: "Owner A",
      });
      const viewerJoin = await viewer.rpc("join_room", {
        p_room_id: roomId as string,
        p_display_name: "Viewer B",
      });
      expect(ownerJoin.error).toBeNull();
      expect(viewerJoin.error).toBeNull();

      const ownerRoomSessionId = ownerJoin.data?.[0]?.session_id as string;
      const viewerRoomSessionId = viewerJoin.data?.[0]?.session_id as string;
      const playbackReceived = deferred<PlaybackStateChangedEvent>();
      const chatReceived = deferred<ChatMessageCreatedEvent>();
      const twoWatchersSeen = deferred<void>();

      const ownerChannel = createRoomChannelService(owner);
      const viewerChannel = createRoomChannelService(viewer);
      const outsiderChannel = createRoomChannelService(outsider);

      await ownerChannel.connect({
        roomId: roomId as string,
        identity: {
          userId: ownerSession.user.id,
          roomSessionId: ownerRoomSessionId,
          displayName: "Owner A",
        },
        initialStateVersion: 0,
        handlers: {
          onPlaybackState: () => undefined,
          onReconcile: () => undefined,
          onWatchersChanged: (watchers) => {
            if (watchers.length >= 2) {
              twoWatchersSeen.resolve();
            }
          },
        },
      });

      await viewerChannel.connect({
        roomId: roomId as string,
        identity: {
          userId: viewerSession.user.id,
          roomSessionId: viewerRoomSessionId,
          displayName: "Viewer B",
        },
        initialStateVersion: 0,
        handlers: {
          onPlaybackState: (event) => playbackReceived.resolve(event),
          onChatMessageCreated: (event) => chatReceived.resolve(event),
          onReconcile: (reason) =>
            playbackReceived.reject(new Error(`Unexpected reconciliation: ${reason}`)),
          onWatchersChanged: (watchers) => {
            if (watchers.length >= 2) {
              twoWatchersSeen.resolve();
            }
          },
        },
      });

      await expect(
        outsiderChannel.connect({
          roomId: roomId as string,
          identity: {
            userId: outsiderSession.user.id,
            roomSessionId: "55555555-5555-4555-8555-555555555555",
            displayName: "Outsider C",
          },
          initialStateVersion: 0,
          handlers: {
            onPlaybackState: () => undefined,
            onReconcile: () => undefined,
          },
        }),
      ).rejects.toMatchObject({ code: "subscribe_failed" });
      expect(outsiderChannel.getWatchers()).toHaveLength(0);

      await expect(twoWatchersSeen.promise).resolves.toBeUndefined();
      expect(viewerChannel.getWatchers()).toHaveLength(2);

      const forger = createTestClient();
      clients.push(forger);
      const forgerSession = await forger.auth.setSession({
        access_token: viewerSession.access_token,
        refresh_token: viewerSession.refresh_token,
      });
      expect(forgerSession.error).toBeNull();
      await forger.realtime.setAuth();
      const forgedChannel = forger.channel(`room:${roomId}`, {
        config: { private: true, broadcast: { ack: true } },
      });
      await subscribe(forgedChannel);
      const forgedSendResult = await forgedChannel.send({
        type: "broadcast",
        event: "playback_state_changed",
        payload: { room_id: roomId, state_version: 999 },
      });
      expect(["error", "timed out"]).toContain(forgedSendResult);
      await forger.removeChannel(forgedChannel);

      const mediaId = crypto.randomUUID();
      const mediaInsert = await admin.from("media_items").insert({
        id: mediaId,
        room_id: roomId as string,
        title: "Local Realtime Media",
        source_url: "https://media.example.test/local-realtime.mp4",
        source_type: "mp4",
        queue_position: 0,
        created_by: ownerSession.user.id,
      });
      expect(mediaInsert.error).toBeNull();

      const selected = await owner.rpc("room_select_media", {
        p_room_id: roomId as string,
        p_expected_version: 0,
        p_media_id: mediaId,
        p_autoplay: false,
      });
      expect(selected.error).toBeNull();
      expect(selected.data?.[0]?.state_version).toBe(1);

      const event = await playbackReceived.promise;
      expect(event.state_version).toBe(1);
      expect(event.status).toBe("paused");
      expect(event.current_media_id).toBe(mediaId);

      const canonical = await viewer
        .from("room_playback_state")
        .select("state_version,status,current_media_id")
        .eq("room_id", roomId as string)
        .single();
      expect(canonical.error).toBeNull();
      expect(event.state_version).toBe(canonical.data?.state_version);
      expect(event.status).toBe(canonical.data?.status);
      expect(event.current_media_id).toBe(canonical.data?.current_media_id);

      const outsiderSend = await outsider.rpc("send_chat_message", {
        p_room_id: roomId as string,
        p_body: "Outsider message",
      });
      expect(outsiderSend.error).not.toBeNull();

      const unauthenticated = createTestClient();
      clients.push(unauthenticated);
      const unauthenticatedSend = await unauthenticated.rpc("send_chat_message", {
        p_room_id: roomId as string,
        p_body: "Anonymous message",
      });
      expect(unauthenticatedSend.error).not.toBeNull();

      const sentChat = await owner.rpc("send_chat_message", {
        p_room_id: roomId as string,
        p_body: "  Live persistent chat  ",
      });
      expect(sentChat.error).toBeNull();
      const canonicalChat = sentChat.data?.[0];
      const liveChat = await chatReceived.promise;
      expect(liveChat).toEqual(canonicalChat);
      expect(liveChat.body).toBe("Live persistent chat");
      expect(liveChat.sender_display_name).toBe("Owner A");

      await viewerChannel.disconnect();
      const durableMembership = await owner
        .from("room_sessions")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId as string)
        .eq("user_id", viewerSession.user.id);
      expect(durableMembership.error).toBeNull();
      expect(durableMembership.count).toBe(1);

      await Promise.all([ownerChannel.disconnect(), outsiderChannel.disconnect()]);
    },
    30_000,
  );
});
