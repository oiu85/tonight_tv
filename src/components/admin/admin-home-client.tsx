"use client";

import { ArrowRight, LogOut, Plus, RadioTower } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { getBrowserAuthService, isAnonymousUser } from "@/lib/auth/auth-service";
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

export function AdminHomeClient() {
  const router = useRouter();
  const toast = useToast();
  const [rooms, setRooms] = useState<readonly OwnedRoom[]>([]);
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

  return (
    <main className="tt-app">
      <div className="tt-shell">
        <header className="tt-topbar">
          <Brand compact />
          <IconButton variant="ghost" label="Sign out" onClick={() => void signOut()}>
            <LogOut size={18} aria-hidden />
          </IconButton>
        </header>
        <section aria-labelledby="rooms-title">
          <div className="tt-admin-heading">
            <div>
              <p className="tt-kicker">Owner workspace</p>
              <h1 id="rooms-title" className="tt-title">Your Rooms</h1>
              <p className="tt-secondary" style={{ marginTop: 6 }}>
                Create a private room, then share its link with the friends you want watching with you.
              </p>
            </div>
            <Button variant="primary" onClick={openCreateRoom}>
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
          {!loading && !error && rooms.length === 0 ? (
            <div className="tt-card tt-empty-block">
              <RadioTower size={28} aria-hidden />
              <p className="tt-empty-block-eyebrow">No rooms yet</p>
              <h2 className="tt-section-title">Create a private room to start watching.</h2>
              <p>Tonight TV keeps every room private. The link itself is the only invite.</p>
              <Button variant="primary" onClick={openCreateRoom}>
                <Plus size={18} aria-hidden />
                <span className="tt-button-label">Create Room</span>
              </Button>
            </div>
          ) : null}
          {!loading && rooms.length ? (
            <div className="tt-room-list">
              {rooms.map((room) => (
                <article className="tt-room-row" key={room.id}>
                  <div>
                    <h2>{room.name}</h2>
                    <span className="tt-room-meta">
                      Updated{" "}
                      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                        new Date(room.updated_at),
                      )}
                    </span>
                  </div>
                  <Button onClick={() => router.push(`/r/${room.id}`)}>
                    <span className="tt-button-label">Open Room</span>
                    <ArrowRight size={17} aria-hidden />
                  </Button>
                </article>
              ))}
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
          description="Tonight TV creates a private room with a shareable link."
        >
          <form className="tt-form" onSubmit={createRoom}>
            <Field label="Room name" htmlFor="create-room-name">
              <Input
                id="create-room-name"
                autoFocus
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Friday movie night"
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
