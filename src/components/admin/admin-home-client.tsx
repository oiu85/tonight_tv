"use client";

import { Plus, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Button, useToast } from "@/components/primitives";
import {
  RoomServiceError,
  getBrowserRoomService,
  type OwnedRoomListItem,
} from "@/lib/rooms/room-service";
import { useTranslations } from "@/i18n";

import {
  AdminActionBar,
  AdminEmptyState,
  AdminHeader,
  AdminSkeleton,
  AdminSectionHeading,
  CreateRoomDialog,
  DeleteRoomDialog,
  LIFECYCLE_ICONS,
  NoResults,
  RoomActionSummary,
  RoomCard,
  RoomFilterTabs,
  filterRooms,
  type RoomFilterTab,
} from "./components";
import { AdminConfirmDialog } from "./components/admin-dialogs";
import { useOwnedRooms } from "./hooks/use-owned-rooms";

export function AdminHomeClient() {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("admin");
  const tActions = useTranslations("admin.actions");
  const tCommon = useTranslations("common");
  const { rooms, status, accountName, accountEmail, error, reload, setRooms } = useOwnedRooms();

  // Filters / UI state
  const [tab, setTab] = useState<RoomFilterTab>("active");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<OwnedRoomListItem | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [reactivateTarget, setReactivateTarget] = useState<OwnedRoomListItem | null>(null);
  const [reactivating, setReactivating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OwnedRoomListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Redirect unauthenticated visitors to the login page
  const isAuthed = status !== "auth-redirect";
  if (status === "auth-redirect") {
    if (typeof window !== "undefined") {
      router.replace("/login");
    }
  }

  /* ---- Derived data ---- */

  const filteredRooms = useMemo(() => filterRooms(rooms, tab, query), [rooms, tab, query]);
  const counts = useMemo(
    () => ({
      active: rooms.filter((r) => r.status === "active").length,
      deactivated: rooms.filter((r) => r.status === "deactivated").length,
      all: rooms.length,
    }),
    [rooms],
  );

  /* ---- Actions ---- */

  function friendlyError(error: unknown): string {
    if (error instanceof RoomServiceError && error.code === "permission_denied") return tActions("permissionDenied");
    if (error instanceof RoomServiceError && error.code === "room_not_found") return tActions("roomNotFound");
    if (error instanceof RoomServiceError && error.code === "invalid_input") return tActions("invalidInput");
    return tActions("genericError");
  }

  const openCreateRoom = useCallback(() => {
    setCreateError(null);
    setCreateOpen(true);
  }, []);

  async function createRoom(name: string) {
    setCreateBusy(true);
    setCreateError(null);
    try {
      const room = await getBrowserRoomService().createRoom(name);
      toast.push(tActions("roomCreated"));
      setCreateOpen(false);
      router.push(`/r/${room.room_id}`);
    } catch (cause) {
      setCreateError(friendlyError(cause));
      setCreateBusy(false);
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
      toast.push(tActions("shareCopied"));
    } catch {
      toast.push(tActions("shareCopyFailed"), "danger");
    }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      const updated = await getBrowserRoomService().deactivateRoom(deactivateTarget.id);
      setRooms((current) => current.map((room) => (room.id === updated.id ? updated : room)));
      toast.push(tActions("deactivated", { name: updated.name }));
      setDeactivateTarget(null);
    } catch (cause) {
      toast.push(friendlyError(cause), "danger");
    } finally {
      setDeactivating(false);
    }
  }

  async function confirmReactivate() {
    if (!reactivateTarget) return;
    setReactivating(true);
    try {
      const updated = await getBrowserRoomService().reactivateRoom(reactivateTarget.id);
      setRooms((current) => current.map((room) => (room.id === updated.id ? updated : room)));
      toast.push(tActions("reactivated", { name: updated.name }));
      setReactivateTarget(null);
    } catch (cause) {
      toast.push(friendlyError(cause), "danger");
    } finally {
      setReactivating(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await getBrowserRoomService().hardDeleteRoom(deleteTarget.id);
      const id = deleteTarget.id;
      setRooms((current) => current.filter((room) => room.id !== id));
      toast.push(tActions("deleted", { name: deleteTarget.name }));
      setDeleteTarget(null);
    } catch (cause) {
      toast.push(friendlyError(cause), "danger");
    } finally {
      setDeleting(false);
    }
  }

  /* ---- Render ---- */

  if (!isAuthed) {
    return null;
  }

  return (
    <main className="tt-app tt-admin-shell">
      <div className="tt-shell tt-anim-fade-in">
        <AdminHeader accountName={accountName} accountEmail={accountEmail} />

        <section aria-labelledby="rooms-title">
          <AdminSectionHeading
            title={t("title")}
            intro={t("intro")}
            tabs={
              <RoomFilterTabs
                tab={tab}
                counts={counts}
                onChange={setTab}
              />
            }
            action={
              <Button variant="primary" size="lg" onClick={openCreateRoom}>
                <Plus size={18} aria-hidden />
                <span className="tt-button-label">{t("createRoom")}</span>
              </Button>
            }
          />

          {rooms.length > 0 ? (
            <AdminActionBar
              query={query}
              onQueryChange={setQuery}
              total={rooms.length}
              shown={filteredRooms.length}
            />
          ) : null}

          {status === "loading" ? <AdminSkeleton /> : null}

          {status === "error" ? (
            <div className="tt-inline-error tt-anim-fade-pop" role="alert">
              {error ?? t("error")}{" "}
              <Button size="sm" variant="ghost" onClick={() => void reload()}>
                <RefreshCcw size={14} aria-hidden />
                <span className="tt-button-label">{tCommon("retry")}</span>
              </Button>
            </div>
          ) : null}

          {status === "ready" && filteredRooms.length > 0 ? (
            <div className="tt-room-grid tt-anim-stagger">
              {filteredRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  menuOpen={menuOpenFor === room.id}
                  onToggleMenu={() =>
                    setMenuOpenFor((current) => (current === room.id ? null : room.id))
                  }
                  onCloseMenu={() => setMenuOpenFor(null)}
                  onOpen={() => router.push(`/r/${room.id}`)}
                  onCopy={() => void copyShareLink(room)}
                  onDeactivate={() => setDeactivateTarget(room)}
                  onReactivate={() => setReactivateTarget(room)}
                  onDelete={() => setDeleteTarget(room)}
                />
              ))}
            </div>
          ) : null}

          {status === "ready" && filteredRooms.length === 0 && rooms.length > 0 ? (
            <NoResults
              query={query}
              tab={tab}
              onClearQuery={() => setQuery("")}
              onClearTab={() => setTab("active")}
            />
          ) : null}

          {status === "ready" && rooms.length === 0 ? (
            <AdminEmptyState onCreate={openCreateRoom} />
          ) : null}
        </section>

        <CreateRoomDialog
          open={createOpen}
          busy={createBusy}
          error={createError}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) setCreateError(null);
          }}
          onCreate={createRoom}
        />

        <AdminConfirmDialog
          open={deactivateTarget !== null}
          busy={deactivating}
          title={t("deactivateDialog.title")}
          description={t("deactivateDialog.description")}
          confirmLabel={t("deactivateDialog.confirm")}
          confirmIcon={LIFECYCLE_ICONS.deactivate}
          tone="warning"
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={() => void confirmDeactivate()}
        >
          {deactivateTarget ? <RoomActionSummary room={deactivateTarget} tone="warning" /> : null}
        </AdminConfirmDialog>

        <AdminConfirmDialog
          open={reactivateTarget !== null}
          busy={reactivating}
          title={t("reactivateDialog.title")}
          description={t("reactivateDialog.description")}
          confirmLabel={t("reactivateDialog.confirm")}
          confirmIcon={LIFECYCLE_ICONS.reactivate}
          tone="accent"
          onCancel={() => setReactivateTarget(null)}
          onConfirm={() => void confirmReactivate()}
        >
          {reactivateTarget ? <RoomActionSummary room={reactivateTarget} /> : null}
        </AdminConfirmDialog>

        <DeleteRoomDialog
          room={deleteTarget}
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      </div>
    </main>
  );
}
