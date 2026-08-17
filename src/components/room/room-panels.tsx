"use client";

import {
  ChevronDown,
  ChevronUp,
  Crown,
  Film,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  Tv2,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import type { ChatMessage } from "../../lib/chat/room-chat-service";
import { roomUiErrorFromUnknown } from "../../lib/room/domain-errors";
import type { RoomWatcher } from "../../lib/realtime/room-channel-service";
import type { RoomSnapshot } from "../../lib/rooms/room-service";
import { Button, IconButton } from "../ui/primitives";

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (
    parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
      new Date(iso),
    );
  } catch {
    return "";
  }
}

export function PresenceStrip({
  watchers,
  ownerUserId,
}: {
  watchers: readonly RoomWatcher[];
  ownerUserId: string;
}) {
  const shown = watchers.slice(0, 5);
  const overflow = Math.max(0, watchers.length - shown.length);
  return (
    <section className="tt-presence-strip" aria-label={`${watchers.length} watching`}>
      <div className="tt-inline-cluster" style={{ gap: 8 }}>
        <strong className="tt-num">{watchers.length}</strong>
        <span className="tt-secondary">watching</span>
        {watchers.some((w) => w.user_id === ownerUserId) ? (
          <span className="tt-inline-cluster" style={{ gap: 4, color: "var(--tt-warning)", fontSize: 12, fontWeight: 700 }}>
            <Crown size={13} aria-hidden /> owner
          </span>
        ) : null}
      </div>
      <div className="tt-avatar-stack" aria-label="People watching">
        {shown.map((watcher) => (
          <span
            key={watcher.user_id}
            title={watcher.display_name}
            aria-label={watcher.display_name}
            className={`tt-avatar tt-avatar-online ${
              watcher.user_id === ownerUserId ? "tt-avatar-owner" : ""
            }`}
          >
            {watcher.user_id === ownerUserId ? <Crown size={14} aria-hidden /> : initials(watcher.display_name)}
          </span>
        ))}
        {overflow > 0 ? (
          <span className="tt-avatar" aria-label={`${overflow} more`}>
            +{overflow}
          </span>
        ) : null}
      </div>
    </section>
  );
}

export function ChatPanel({
  messages,
  currentUserId,
  connected,
  onSend,
}: {
  messages: readonly ChatMessage[];
  currentUserId: string;
  connected: boolean;
  onSend: (body: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body);
      setDraft("");
    } catch (cause) {
      const friendly = roomUiErrorFromUnknown(cause, "Could not send message.");
      setError(friendly.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="tt-chat" aria-label="Room chat">
      <div className="tt-chat-list" ref={listRef} aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? (
          <div className="tt-empty-block">
            <p className="tt-empty-block-eyebrow">Chat</p>
            <h3 className="tt-section-title">No messages yet.</h3>
            <p>Say something to the room.</p>
          </div>
        ) : (
          messages.map((message) => {
            const current = message.user_id === currentUserId;
            return (
              <article
                key={message.id}
                className={`tt-message ${current ? "tt-message-current" : ""}`}
                aria-label={`Message from ${message.sender_display_name}`}
              >
                <span className="tt-avatar" aria-hidden>
                  {initials(message.sender_display_name)}
                </span>
                <div>
                  <div className="tt-message-head">
                    <strong>
                      {message.sender_display_name}
                      {current ? <span className="tt-visually-hidden"> (you)</span> : null}
                    </strong>
                    <time dateTime={message.created_at} className="tt-num">
                      {formatTime(message.created_at)}
                    </time>
                  </div>
                  <p>{message.body}</p>
                </div>
              </article>
            );
          })
        )}
      </div>
      <form className="tt-chat-composer" onSubmit={submit}>
        <label className="tt-visually-hidden" htmlFor="room-message">
          Message everyone
        </label>
        <div className="tt-chat-composer-row">
          <input
            id="room-message"
            className="tt-input"
            maxLength={1000}
            placeholder={connected ? "Message everyone…" : "Reconnecting…"}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!connected}
          />
          <Button type="submit" variant="primary" loading={sending} disabled={!connected || !draft.trim()}>
            <Send size={17} aria-hidden />
            <span className="tt-button-label">Send</span>
          </Button>
        </div>
        {error ? (
          <span className="tt-error-text" role="alert">
            {error}
          </span>
        ) : null}
      </form>
    </section>
  );
}

type QueueItem = RoomSnapshot["queue"][number];

export function UpNextPanel({
  snapshot,
  onAdd,
  onEdit,
  onRemove,
  onPlayNow,
  onMove,
}: {
  snapshot: RoomSnapshot;
  onAdd: () => void;
  onEdit: (item: QueueItem) => void;
  onRemove: (item: QueueItem) => void;
  onPlayNow: (item: QueueItem) => void;
  onMove: (item: QueueItem, direction: -1 | 1) => void;
}) {
  const owner = snapshot.caller.is_owner;
  const queue = snapshot.queue;
  return (
    <section className="tt-queue" aria-label="Up Next queue">
      <div className="tt-queue-toolbar">
        <div>
          <p className="tt-kicker">Up Next</p>
          <span className="tt-muted">
            {queue.length} {queue.length === 1 ? "program" : "programs"}
          </span>
        </div>
        {owner ? (
          <Button size="sm" onClick={onAdd} aria-label="Add media to queue">
            <Plus size={16} aria-hidden />
            <span className="tt-button-label">Add Media</span>
          </Button>
        ) : null}
      </div>
      {queue.length === 0 ? (
        <div className="tt-empty-block">
          <Tv2 size={28} aria-hidden />
          <p className="tt-empty-block-eyebrow">Queue</p>
          <h3 className="tt-section-title">Nothing queued yet.</h3>
          {owner ? (
            <Button variant="primary" onClick={onAdd}>
              <Plus size={16} aria-hidden />
              <span className="tt-button-label">Add Media</span>
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="tt-queue-list">
        {queue.map((item, index) => {
          const current = item.id === snapshot.playback.current_media_id;
          const label = current
            ? "Now playing"
            : index === 0 && !snapshot.current_media
              ? "First in queue"
              : `Queue ${index + 1}`;
          return (
            <article key={item.id} className={`tt-queue-row ${current ? "tt-queue-row-current" : ""}`}>
              <span className="tt-media-fallback" aria-hidden>
                <Film size={18} />
              </span>
              <div className="tt-queue-copy">
                <strong title={item.title}>{item.title}</strong>
                <span>{label}</span>
              </div>
              {owner ? (
                <div className="tt-queue-actions">
                  <IconButton size="sm" variant="ghost" label={`Play ${item.title} now`} onClick={() => onPlayNow(item)}>
                    <Play size={16} aria-hidden />
                  </IconButton>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`Move ${item.title} up`}
                    disabled={index === 0}
                    onClick={() => onMove(item, -1)}
                  >
                    <ChevronUp size={16} aria-hidden />
                  </IconButton>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`Move ${item.title} down`}
                    disabled={index === queue.length - 1}
                    onClick={() => onMove(item, 1)}
                  >
                    <ChevronDown size={16} aria-hidden />
                  </IconButton>
                  <IconButton size="sm" variant="ghost" label={`Edit ${item.title}`} onClick={() => onEdit(item)}>
                    <Pencil size={16} aria-hidden />
                  </IconButton>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`Delete ${item.title}`}
                    disabled={current}
                    onClick={() => onRemove(item)}
                  >
                    <Trash2 size={16} aria-hidden />
                  </IconButton>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {owner && snapshot.playback.current_media_id ? (
        <p className="tt-help" style={{ marginTop: 8 }}>
          The current item cannot be deleted. Play another item first.
        </p>
      ) : null}
    </section>
  );
}
