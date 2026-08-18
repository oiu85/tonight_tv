"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getBrowserAuthService, isAnonymousUser } from "@/lib/auth/auth-service";
import { getBrowserRoomService, type OwnedRoomListItem } from "@/lib/rooms/room-service";

type Status = "loading" | "ready" | "auth-redirect" | "error";

/**
 * Loads the full owned-rooms list (active + deactivated) plus the current
 * admin display name. Authenticated anonymous users are redirected to login
 * from the page that calls this hook.
 */
export function useOwnedRooms() {
  const [rooms, setRooms] = useState<readonly OwnedRoomListItem[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [accountName, setAccountName] = useState("Admin");
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const reload = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const auth = await getBrowserAuthService().getCurrentAuth();
      if (auth.status !== "authenticated" || isAnonymousUser(auth.user)) {
        setStatus("auth-redirect");
        return;
      }
      setAccountName(auth.user.email?.split("@")[0] || "Admin");
      setAccountEmail(auth.user.email ?? null);
      const list = await getBrowserRoomService().listOwnedRooms({ includeDeactivated: true });
      if (!aliveRef.current) return;
      setRooms(list);
      setStatus("ready");
    } catch (cause) {
      if (!aliveRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Your rooms could not be loaded. Check your connection and try again.",
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    const initialLoad = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => {
      window.clearTimeout(initialLoad);
      aliveRef.current = false;
    };
  }, [reload]);

  return { rooms, status, accountName, accountEmail, error, reload, setRooms };
}
