"use client";

import {
  ArchiveRestore,
  ArrowRight,
  CalendarClock,
  CircleDot,
  Clapperboard,
  Copy,
  EllipsisVertical,
  Eye,
  EyeOff,
  Hash,
  History,
  Hourglass,
  Info,
  Link2,
  LogOut,
  PauseCircle,
  PlayCircle,
  Plus,
  Popcorn,
  RadioTower,
  RefreshCcw,
  Search,
  ShieldOff,
  Sparkles,
  Trash2,
  Tv2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  memo,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getBrowserAuthService, isAnonymousUser } from "@/lib/auth/auth-service";
import { avatarInitials, avatarToneClass } from "@/lib/room/avatars";
import {
  getBrowserRoomService,
  RoomServiceError,
  type OwnedRoomListItem,
} from "@/lib/rooms/room-service";
import { Brand } from "../app/brand";
import { HelpLauncher } from "../app/help-launcher";
import {
  Button,
  Dialog,
  Field,
  IconButton,
  Input,
  useToast,
  cx,
} from "../ui/primitives";

/* ================ Utility helpers ================ */

function roomError(error: unknown): string {
  if (error instanceof RoomServiceError && error.code === "invalid_input")
    return "Enter a room name between 1 and 120 characters.";
  if (error instanceof RoomServiceError && error.code === "permission_denied")
    return "Only the room owner can take that action.";
  if (error instanceof RoomServiceError && error.code === "room_not_found")
    return "That room is no longer available.";
  return "Tonight TV could not complete that room request. Try again.";
}

function formatRelative(iso: string, now = Date.now()): string {
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

function formatDeactivated(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
}

function roomArtwork(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("sci") || lower.includes("star") || lower.includes("space")) return "tv";
  if (lower.includes("party") || lower.includes("snack")) return "popcorn";
  if (lower.includes("night") || lower.includes("movie") || lower.includes("film")) return "clapper";
  return "tower";
}

function RoomArtwork({ name, size = 26 }: { name: string; size?: number }) {
  const kind = roomArtwork(name);
  switch (kind) {
    case "tv":
      return <Tv2 size={size} aria-hidden />;
    case "popcorn":
      return <Popcorn size={size} aria-hidden />;
    case "clapper":
      return <Clapperboard size={size} aria-hidden />;
    default:
      return <RadioTower size={size} aria-hidden />;
  }
}

function roomAccent(name: string): string {
  const tones = [
    "tt-accent-indigo",
    "tt-accent-violet",
    "tt-accent-pink",
    "tt-accent-amber",
    "tt-accent-emerald",
    "tt-accent-cyan",
  ];
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return tones[hash % tones.length];
}

type Tab = "active" | "deactivated" | "all";

/* ================ Admin home client ================ */

export function AdminHomeClient() {
  const router = useRouter();
  const toast = useToast();
  const [rooms, setRooms] = useState<readonly OwnedRoomListItem[]>([]);
  const [accountName, setAccountName] = useState("Admin");
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<OwnedRoomListItem | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<OwnedRoomListItem | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [reactivateTarget, setReactivateTarget] = useState<OwnedRoomListItem | null>(null);
  const [reactivating, setReactivating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OwnedRoomListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [copyToastShown, setCopyToastShown] = useState(false);

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
      setAccountEmail(auth.user.email ?? null);
      setRooms(await getBrowserRoomService().listOwnedRooms({ includeDeactivated: true }));
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
        if (active) {
          setAccountName(auth.user.email?.split("@")[0] || "Admin");
          setAccountEmail(auth.user.email ?? null);
        }
        const ownedRooms = await getBrowserRoomService().listOwnedRooms({ includeDeactivated: true });
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
      setCreateOpen(false);
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

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      const updated = await getBrowserRoomService().deactivateRoom(deactivateTarget.id);
      setRooms((current) =>
        current.map((room) => (room.id === updated.id ? updated : room)),
      );
      toast.push(`“${updated.name}” is now deactivated`);
      setDeactivateTarget(null);
    } catch (cause) {
      toast.push(roomError(cause), "danger");
    } finally {
      setDeactivating(false);
    }
  }

  async function confirmReactivate() {
    if (!reactivateTarget) return;
    setReactivating(true);
    try {
      const updated = await getBrowserRoomService().reactivateRoom(reactivateTarget.id);
      setRooms((current) =>
        current.map((room) => (room.id === updated.id ? updated : room)),
      );
      toast.push(`“${updated.name}” is live again`);
      setReactivateTarget(null);
    } catch (cause) {
      toast.push(roomError(cause), "danger");
    } finally {
      setReactivating(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await getBrowserRoomService().hardDeleteRoom(deleteTarget.id);
      const removedId = deleteTarget.id;
      setRooms((current) => current.filter((room) => room.id !== removedId));
      toast.push(`“${deleteTarget.name}” was deleted permanently`);
      setDeleteTarget(null);
      setDeleteConfirm("");
    } catch (cause) {
      toast.push(roomError(cause), "danger");
    } finally {
      setDeleting(false);
    }
  }

  async function copyShareLink(room: OwnedRoomListItem) {
    const link =
      typeof window === "undefined"
        ? `/r/${room.id}`
        : `${window.location.origin}/r/${room.id}`;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(link);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = link;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      if (!copyToastShown) {
        toast.push("Share link copied to clipboard");
        setCopyToastShown(true);
        window.setTimeout(() => setCopyToastShown(false), 2400);
      }
    } catch {
      toast.push("Could not copy the link. Copy it manually from the address bar.", "danger");
    }
  }

  const filteredRooms = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rooms.filter((room) => {
      if (tab === "active" && room.status !== "active") return false;
      if (tab === "deactivated" && room.status !== "deactivated") return false;
      if (normalized && !room.name.toLowerCase().includes(normalized)) return false;
      return true;
    });
  }, [rooms, tab, query]);

  const counts = useMemo(
    () => ({
      active: rooms.filter((room) => room.status === "active").length,
      deactivated: rooms.filter((room) => room.status === "deactivated").length,
      all: rooms.length,
    }),
    [rooms],
  );

  const adminTone = avatarToneClass(accountName);
  const adminInitial = avatarInitials(accountName);

  return (
    <main className="tt-app tt-admin-shell">
      <div className="tt-shell tt-anim-fade-in">
        <header className="tt-admin-header">
          <Brand compact />
          <div className="tt-admin-header-meta">
            <span className={`tt-avatar ${adminTone}`} aria-hidden>
              {adminInitial}
            </span>
            <div style={{ display: "grid", gap: 0, lineHeight: 1.2 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{accountName}</span>
              {accountEmail ? (
                <span className="tt-muted" style={{ fontSize: 11 }}>
                  {accountEmail}
                </span>
              ) : null}
            </div>
            <HelpLauncher topic="admin" label="Open the admin guide" />
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
                Create a private room, then share its link with the friends you want
                watching with you. Deactivate a room to hide it from new viewers, or
                delete it when you are done.
              </p>
            </div>
            <div className="tt-admin-section-heading-actions">
              <div className="tt-admin-section-tabs" role="tablist" aria-label="Filter rooms by status">
                <TabButton active={tab === "active"} onClick={() => setTab("active")} count={counts.active} icon={PlayCircle}>
                  Active
                </TabButton>
                <TabButton active={tab === "deactivated"} onClick={() => setTab("deactivated")} count={counts.deactivated} icon={PauseCircle}>
                  Deactivated
                </TabButton>
                <TabButton active={tab === "all"} onClick={() => setTab("all")} count={counts.all} icon={History}>
                  All
                </TabButton>
              </div>
              <Button variant="primary" size="lg" onClick={openCreateRoom}>
                <Plus size={18} aria-hidden />
                <span className="tt-button-label">Create Room</span>
              </Button>
            </div>
          </div>

          {rooms.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 14px", flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: "1 1 240px", minWidth: 220, maxWidth: 360 }}>
                <Search
                  size={14}
                  aria-hidden
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--tt-text-muted)" }}
                />
                <Input
                  aria-label="Filter rooms by name"
                  placeholder="Filter rooms by name…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  style={{ paddingLeft: 34 }}
                />
              </div>
              <span className="tt-muted" style={{ fontSize: 12.5 }}>
                Showing {filteredRooms.length} of {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
              </span>
            </div>
          ) : null}

          {loading ? (
            <SkeletonGrid />
          ) : null}

          {error ? (
            <div className="tt-inline-error tt-anim-fade-pop" role="alert">
              {error}{" "}
              <Button size="sm" variant="ghost" onClick={() => void load()}>
                <RefreshCcw size={14} aria-hidden />
                <span className="tt-button-label">Retry</span>
              </Button>
            </div>
          ) : null}

          {!loading && !error && filteredRooms.length > 0 ? (
            <div className="tt-room-grid tt-anim-stagger">
              {filteredRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  menuOpen={pending?.id === room.id}
                  onToggleMenu={() => setPending((current) => (current?.id === room.id ? null : room))}
                  onCloseMenu={() => setPending(null)}
                  onOpen={() => router.push(`/r/${room.id}`)}
                  onCopy={() => void copyShareLink(room)}
                  onDeactivate={() => setDeactivateTarget(room)}
                  onReactivate={() => setReactivateTarget(room)}
                  onDelete={() => {
                    setDeleteTarget(room);
                    setDeleteConfirm("");
                  }}
                />
              ))}
            </div>
          ) : null}

          {!loading && !error && filteredRooms.length === 0 && rooms.length > 0 ? (
            <NoResults
              query={query}
              onClearQuery={() => setQuery("")}
              onClearTab={() => setTab("active")}
            />
          ) : null}

          {!loading && !error && rooms.length === 0 ? (
            <EmptyState onCreate={openCreateRoom} />
          ) : null}
        </section>

        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) setCreateError(null);
          }}
          title="Create a private room"
          description="Tonight TV keeps every room invite-only. The link itself is the only way in."
        >
          <form className="tt-form" onSubmit={createRoom}>
            <Field label="Room name" htmlFor="create-room-name" help="Up to 120 characters. You can rename it later.">
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
                <Plus size={17} aria-hidden />
                <span className="tt-button-label">Create Room</span>
              </Button>
            </div>
          </form>
        </Dialog>

        <ConfirmDialog
          open={deactivateTarget !== null}
          busy={deactivating}
          title="Deactivate this room?"
          description="The room is hidden from new viewers, but you keep every media item, chat, and the room itself. Reactivate any time."
          confirmLabel="Deactivate"
          tone="warning"
          confirmIcon={ShieldOff}
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={() => void confirmDeactivate()}
        >
          {deactivateTarget ? (
            <Summary
              accent={roomAccent(deactivateTarget.name)}
              name={deactivateTarget.name}
              createdAt={deactivateTarget.created_at}
            />
          ) : null}
        </ConfirmDialog>

        <ConfirmDialog
          open={reactivateTarget !== null}
          busy={reactivating}
          title="Reactivate this room?"
          description="Anyone with the link will be able to join again. Watchers will see it as live in the public preview."
          confirmLabel="Reactivate"
          tone="accent"
          confirmIcon={ArchiveRestore}
          onCancel={() => setReactivateTarget(null)}
          onConfirm={() => void confirmReactivate()}
        >
          {reactivateTarget ? (
            <Summary
              accent={roomAccent(reactivateTarget.name)}
              name={reactivateTarget.name}
              deactivatedAt={reactivateTarget.deactivated_at}
            />
          ) : null}
        </ConfirmDialog>

        <Dialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTarget(null);
              setDeleteConfirm("");
            }
          }}
          title="Delete this room permanently?"
          description="This wipes the room, its media, chat history, and every membership. There is no undo."
        >
          <div className="tt-confirm">
            {deleteTarget ? (
              <Summary
                accent={roomAccent(deleteTarget.name)}
                name={deleteTarget.name}
                createdAt={deleteTarget.created_at}
              />
            ) : null}
            <div className="tt-confirm-summary tt-confirm-danger">
              <strong>This action is irreversible.</strong>
              <span>
                We will not be able to restore media, chat, or membership for this
                room. Consider deactivating instead if you only want to hide it for
                a while.
              </span>
            </div>
            <Field
              label={
                <>
                  Type <strong>{deleteTarget?.name}</strong> to confirm
                </>
              }
              htmlFor="delete-confirm"
            >
              <Input
                id="delete-confirm"
                autoFocus
                value={deleteConfirm}
                onChange={(event) => setDeleteConfirm(event.target.value)}
                placeholder={deleteTarget?.name ?? ""}
                aria-describedby="delete-confirm-help"
              />
            </Field>
            <span id="delete-confirm-help" className="tt-help">
              This is a destructive action and cannot be undone.
            </span>
            <div className="tt-form-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirm("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={deleting}
                disabled={!deleteTarget || deleteConfirm.trim() !== deleteTarget.name}
                onClick={() => void confirmDelete()}
              >
                <Trash2 size={17} aria-hidden />
                <span className="tt-button-label">Delete forever</span>
              </Button>
            </div>
          </div>
        </Dialog>

        <AdminHelpDock />
      </div>
    </main>
  );
}

/* ================ Tab button ================ */

function TabButton({
  children,
  count,
  active,
  onClick,
  icon: Icon,
}: {
  children: React.ReactNode;
  count: number;
  active: boolean;
  onClick: () => void;
  icon: typeof PlayCircle;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="tt-admin-section-tab"
    >
      <Icon size={14} aria-hidden />
      {children}
      <span className="tt-admin-section-tab-count" aria-label={`${count} rooms`}>
        {count}
      </span>
    </button>
  );
}

/* ================ Room card ================ */

const RoomCard = memo(function RoomCard({
  room,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onOpen,
  onCopy,
  onDeactivate,
  onReactivate,
  onDelete,
}: {
  room: OwnedRoomListItem;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onOpen: () => void;
  onCopy: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const isActive = room.status === "active";
  return (
    <article className={cx("tt-room-card", !isActive && "tt-room-card-deactivated")}>
      <div className="tt-room-card-head">
        <div className="tt-room-card-art" aria-hidden>
          <RoomArtwork name={room.name} size={26} />
        </div>
        <div className="tt-room-card-title">
          <h3 title={room.name}>{room.name}</h3>
          <small>
            <Hash size={11} aria-hidden style={{ verticalAlign: -1, marginRight: 2 }} />
            <code style={{ fontFamily: "var(--tt-font, 'Inter'), ui-monospace, monospace" }}>
              {room.id.slice(0, 8)}
            </code>
          </small>
        </div>
        <div className="tt-room-card-menu">
          <button
            type="button"
            className="tt-room-card-menu-trigger"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Manage ${room.name}`}
            onClick={onToggleMenu}
          >
            <EllipsisVertical size={18} aria-hidden />
          </button>
          {menuOpen ? (
            <RoomActionMenu
              room={room}
              isActive={isActive}
              onClose={onCloseMenu}
              onCopy={onCopy}
              onDeactivate={onDeactivate}
              onReactivate={onReactivate}
              onDelete={onDelete}
            />
          ) : null}
        </div>
      </div>
      <div className="tt-room-card-meta">
        <span title={`Created ${formatCreated(room.created_at)}`}>
          <CalendarClock size={12} aria-hidden /> Created {formatCreated(room.created_at)}
        </span>
        <span title={new Date(room.updated_at).toLocaleString()}>
          <CircleDot size={12} aria-hidden /> Updated {formatRelative(room.updated_at)}
        </span>
        <span className={cx("tt-status-room", isActive ? "tt-status-room-active" : "tt-status-room-deactivated")}>
          {isActive ? "Active" : "Deactivated"}
        </span>
        {!isActive && room.deactivated_at ? (
          <span title={new Date(room.deactivated_at).toLocaleString()}>
            <Hourglass size={12} aria-hidden /> Off since {formatDeactivated(room.deactivated_at)}
          </span>
        ) : null}
      </div>
      <div className="tt-room-card-actions">
        {isActive ? (
          <Button onClick={onOpen} variant="primary">
            <span className="tt-button-label">Open Room</span>
            <ArrowRight size={17} aria-hidden />
          </Button>
        ) : (
          <Button onClick={onReactivate}>
            <ArchiveRestore size={17} aria-hidden />
            <span className="tt-button-label">Reactivate</span>
          </Button>
        )}
        <Button variant="ghost" onClick={onCopy} aria-label={`Copy share link for ${room.name}`}>
          <Link2 size={17} aria-hidden />
          <span className="tt-button-label">Share</span>
        </Button>
      </div>
    </article>
  );
});

/* ================ Action menu ================ */

function RoomActionMenu({
  room,
  isActive,
  onClose,
  onCopy,
  onDeactivate,
  onReactivate,
  onDelete,
}: {
  room: OwnedRoomListItem;
  isActive: boolean;
  onClose: () => void;
  onCopy: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="tt-room-card-menu-pop" role="menu" aria-label={`Manage ${room.name}`}>
      <div className="tt-room-card-menu-label">{room.name}</div>
      <button
        type="button"
        role="menuitem"
        className="tt-room-card-menu-item"
        onClick={() => {
          onCopy();
          onClose();
        }}
      >
        <Copy size={14} aria-hidden /> Copy share link
      </button>
      {isActive ? (
        <button
          type="button"
          role="menuitem"
          className="tt-room-card-menu-item"
          onClick={() => {
            onDeactivate();
            onClose();
          }}
        >
          <EyeOff size={14} aria-hidden /> Deactivate
        </button>
      ) : (
        <button
          type="button"
          role="menuitem"
          className="tt-room-card-menu-item"
          onClick={() => {
            onReactivate();
            onClose();
          }}
        >
          <Eye size={14} aria-hidden /> Reactivate
        </button>
      )}
      <div className="tt-room-card-menu-divider" aria-hidden />
      <button
        type="button"
        role="menuitem"
        className="tt-room-card-menu-item tt-room-card-menu-item-destructive"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        <Trash2 size={14} aria-hidden /> Delete permanently
      </button>
    </div>
  );
}

/* ================ Confirm dialog wrapper ================ */

function ConfirmDialog({
  open,
  busy,
  title,
  description,
  confirmLabel,
  confirmIcon: ConfirmIcon,
  tone,
  children,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmIcon: typeof ShieldOff;
  tone: "accent" | "warning" | "danger";
  children: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(value) => (!value ? onCancel() : undefined)} title={title} description={description}>
      <div className="tt-confirm">
        {children}
        <div className={cx("tt-confirm-summary", tone === "warning" && "tt-confirm-warning", tone === "danger" && "tt-confirm-danger")}>
          <strong>{tone === "warning" ? "Heads up." : "Please confirm."}</strong>
          <span>
            {tone === "warning"
              ? "You can reactivate the room later from the same workspace."
              : "This change applies immediately to every device watching the room."}
          </span>
        </div>
        <div className="tt-form-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "danger" : "primary"}
            loading={busy}
            onClick={onConfirm}
          >
            <ConfirmIcon size={17} aria-hidden />
            <span className="tt-button-label">{confirmLabel}</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* ================ Helpers (skeleton, summary, no-results, empty, help) ================ */

function SkeletonGrid() {
  return (
    <div className="tt-room-grid">
      {[0, 1, 2, 3].map((index) => (
        <div className="tt-room-card" key={index} aria-hidden>
          <div className="tt-room-card-head">
            <div className="tt-skeleton tt-skeleton-circle" />
            <div style={{ display: "grid", gap: 8, flex: 1 }}>
              <div className="tt-skeleton tt-skeleton-line mid" />
              <div className="tt-skeleton tt-skeleton-line short" />
            </div>
            <div className="tt-skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} />
          </div>
          <div className="tt-skeleton tt-skeleton-line" style={{ width: "60%" }} />
          <div className="tt-skeleton tt-skeleton-line" style={{ width: "30%" }} />
        </div>
      ))}
    </div>
  );
}

function Summary({
  accent,
  name,
  createdAt,
  deactivatedAt,
}: {
  accent: string;
  name: string;
  createdAt?: string;
  deactivatedAt?: string | null;
}) {
  return (
    <div className={cx("tt-confirm-summary", accent)}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          className="tt-room-card-art"
          style={{ width: 44, height: 44, borderRadius: 12 }}
          aria-hidden
        >
          <RoomArtwork name={name} size={20} />
        </div>
        <div>
          <strong style={{ fontSize: 14 }}>{name}</strong>
          {createdAt ? (
            <div style={{ fontSize: 12, color: "var(--tt-text-muted)" }}>
              Created {formatCreated(createdAt)}
            </div>
          ) : null}
          {deactivatedAt ? (
            <div style={{ fontSize: 12, color: "var(--tt-text-muted)" }}>
              Off since {formatDeactivated(deactivatedAt)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NoResults({
  query,
  onClearQuery,
  onClearTab,
}: {
  query: string;
  onClearQuery: () => void;
  onClearTab: () => void;
}) {
  return (
    <div className="tt-section-card tt-anim-fade-pop" style={{ alignItems: "center", padding: 36 }}>
      <div className="tt-empty-illustration" aria-hidden>
        <Search size={28} />
      </div>
      <p className="tt-empty-block-eyebrow">No matches</p>
      <h2 className="tt-section-title">
        {query
          ? `No rooms match “${query}”.`
          : "No rooms in this filter right now."}
      </h2>
      <p className="tt-secondary" style={{ maxWidth: 380, textAlign: "center" }}>
        Adjust the filter or clear the search to see the rest of your rooms.
      </p>
      <div className="tt-inline-cluster" style={{ gap: 8 }}>
        {query ? (
          <Button variant="ghost" size="sm" onClick={onClearQuery}>
            <Search size={14} aria-hidden />
            <span className="tt-button-label">Clear search</span>
          </Button>
        ) : null}
        <Button variant="primary" size="sm" onClick={onClearTab}>
          <PlayCircle size={14} aria-hidden />
          <span className="tt-button-label">Show active</span>
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="tt-section-card tt-anim-fade-pop" style={{ alignItems: "center", padding: 48, textAlign: "center" }}>
      <div className="tt-empty-illustration" aria-hidden>
        <Sparkles size={28} />
      </div>
      <p className="tt-empty-block-eyebrow">Welcome, admin</p>
      <h2 className="tt-section-title">Create your first private room.</h2>
      <p className="tt-secondary" style={{ maxWidth: 460 }}>
        Tonight TV keeps every room invite-only. The link itself is the only
        way in — share it with the friends you want watching with you.
      </p>
      <div className="tt-inline-cluster" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <Button variant="primary" size="lg" onClick={onCreate}>
          <Plus size={18} aria-hidden />
          <span className="tt-button-label">Create your first room</span>
        </Button>
        <Button variant="ghost" size="lg" onClick={() => window.open("https://github.com/", "_blank")}>
          <Info size={16} aria-hidden />
          <span className="tt-button-label">How Tonight TV works</span>
        </Button>
      </div>
    </div>
  );
}

function AdminHelpDock() {
  return (
    <div style={{ position: "fixed", right: 22, bottom: 22, zIndex: 45 }}>
      <HelpLauncher topic="admin" variant="link" label="Need a hand?" />
    </div>
  );
}
