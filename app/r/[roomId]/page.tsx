import type { Metadata } from "next";

import { RoomClient } from "@/components/room/room-client";

export const metadata: Metadata = { title: "Watch Room" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  return <RoomRoute params={params} />;
}

async function RoomRoute({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!UUID_PATTERN.test(roomId)) return <RoomClient roomId={roomId} />;
  return <RoomClient roomId={roomId} />;
}
