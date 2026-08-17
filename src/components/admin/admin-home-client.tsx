"use client";

import {
  ArrowRight,
  CalendarClock,
  CircleDot,
  Clapperboard,
  LogOut,
  Popcorn,
  Plus,
  RadioTower,
  Tv2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { getBrowserAuthService, isAnonymousUser } from "@/lib/auth/auth-service";
import { avatarInitials, avatarToneClass } from "@/lib/room/avatars";
import {
  getBrowserRoomService,
  RoomServiceError,
  type OwnedRoom,
} from "@/lib/rooms/room-service";
import { Brand } from "../app/brand";
import {
  Button,
  Dialog,
  Field,
  IconButton,
  Input,
  LoadingBlock,
  useToast,
} from "../ui/primitives";

function roomError(error: unknown): string {
  if (error instanceof RoomServiceError && error.code === "invalid_input")
    return "Enter a room name between 1 and 120 characters.";
  return "Tonight TV could not complete that room request. Try again.";
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const diff = now - time;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
}

function formatCreated(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
}

function roomIllustration(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("sci") || lower.includes("star") || lower.includes("space")) return Tv2;
  if (lower.includes("party") || lower.includes("snack")) return Popcorn;
  if (lower.includes("night") || lower.includes("movie") || lower.includes("film")) return Clapperboard;
  return RadioTower;
}

export function AdminHomeClient() {
  const router = useRouter();
  const toast = useToast();
  const [rooms, setRooms] = useState<readonly OwnedRoom[]>([]);
  const [accountName, setAccountName] = useState("Admin");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await getBrowserAuthService().getCurrentAuth();
      if (auth.status !== "authenticated" || isAnonymousUser(auth.user)) {
        router.replace("/login");
        return;
      }
      setAccountName(auth.user.email?.split("@")[0] || "Admin");
      setRooms(await getBrowserRoomService().listOwnedRooms());
    } catch {
      setError("Your rooms could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const auth = await getBrowserAuthService().getCurrentAuth();
        if (auth.status !== "authenticated" || isAnonymousUser(auth.user)) {
          router.replace("/login");
          return;
        }
        if (active) setAccountName(auth.user.email?.split("@")[0] || "Admin");
        const ownedRooms = await getBrowserRoomService().listOwnedRooms();
        if (active) setRooms(ownedRooms);
      } catch {
        if (active) setError("Your rooms could not be loaded. Check your connection and try again.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  function openCreateRoom() {
    setName("");
    setCreateError(null);
    setCreating(false);
    setCreateOpen(true);
  }

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const room = await getBrowserRoomService().createRoom(name);
      toast.push("Room created");
      router.push(`/r/${room.room_id}`);
    } catch (cause) {
      setCreateError(roomError(cause));
      setCreating(false);
    }
  }

  async function signOut() {
    await getBrowserAuthService().signOut();
    router.replace("/");
    router.refresh();
  }

  const adminTone = avatarToneClass(accountName);
  const adminInitial = avatarInitials(accountName);

  return (
    <main className="tt-app tt-admin-shell">
      <div className="tt-shell">
        <header className="tt-admin-header">
          <Brand compact />
          <div className="tt-admin-header-meta">
            <span className={`tt-avatar ${adminTone}`} aria-hidden>
              {adminInitial}
            </span>
            <span className="tt-secondary" style={{ fontWeight: 600 }}>
              {accountName}
            </span>
            <IconButton variant="ghost" label="Sign out" onClick={() => void signOut()}>
              <LogOut size={18} aria-hidden />
            </IconButton>
          </div>
        </header>
        <section aria-labelledby="rooms-title">
          <div className="tt-admin-section-heading">
            <div>
              <p className="tt-kicker">Owner workspace</p>
              <h1 id="rooms-title" className="tt-title">
                Your Rooms
              </h1>
              <p className="tt-secondary" style={{ marginTop: 6, maxWidth: "60ch" }}>
                Create a private room, then share its link with the friends you want watching
                with you.
              </p>
            </div>
            <Button variant="primary" size="lg" onClick={openCreateRoom}>
              <Plus size={18} aria-hidden />
              <span className="tt-button-label">Create Room</span>
            </Button>
          </div>
          {loading ? <LoadingBlock label="Loading your rooms…" /> : null}
          {error ? (
            <div className="tt-inline-error" role="alert">
              {error}{" "}
              <Button size="sm" variant="ghost" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : null}
          {!loading && rooms.length > 0 ? (
            <div className="tt-room-list">
              {rooms.map((room) => {
                const Illustration = roomIllustration(room.name);
                return (
                  <article className="tt-room-row" key={room.id}>
                    <div className="tt-room-row-illustration" aria-hidden>
                      <Illustration size={28} />
                    </div>
                    <div>
                      <h2>{room.name}</h2>
                      <div className="tt-room-row-meta">
                        <span>
                          <CalendarClock size={13} aria-hidden /> Created{" "}
                          {formatCreated(room.created_at)}
                        </span>
                        <span>
                          <CircleDot size={13} aria-hidden /> Updated {formatRelative(room.updated_at)}
                        </span>
                        <strong>Active now</strong>
                      </div>
                    </div>
                    <Button onClick={() => router.push(`/r/${room.id}`)}>
                      <span className="tt-button-label">Open Room</span>
                      <ArrowRight size={17} aria-hidden />
                    </Button>
                  </article>
                );
              })}
            </div>
          ) : null}
          {!loading && !error && rooms.length === 0 ? (
            <div className="tt-section-card" style={{ alignItems: "center", padding: 48 }}>
              <div className="tt-empty-illustration">
                <Clapperboard size={36} />
              </div>
              <p className="tt-empty-block-eyebrow">No rooms yet</p>
              <h2 className="tt-section-title">Create a private room to start watching.</h2>
              <p className="tt-secondary" style={{ maxWidth: 380, textAlign: "center" }}>
                Tonight TV keeps every room private. The link itself is the only invite.
              </p>
              <Button variant="primary" size="lg" onClick={openCreateRoom}>
                <Plus size={18} aria-hidden />
                <span className="tt-button-label">Create Room</span>
              </Button>
            </div>
          ) : null}
        </section>
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) setCreateError(null);
          }}
          title="Create Room"
          description="Give your room a name to get started."
        >
          <form className="tt-form" onSubmit={createRoom}>
            <Field label="Room name" htmlFor="create-room-name">
              <Input
                id="create-room-name"
                autoFocus
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Friday Movie Night"
                required
              />
            </Field>
            {createError ? (
              <div className="tt-inline-error" role="alert">
                {createError}
              </div>
            ) : null}
            <div className="tt-form-actions">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={creating}>
                Create Room
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </main>
  );
}
