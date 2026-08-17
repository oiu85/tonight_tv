"use client";

import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Crown,
  Film,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  Tv2,
  Users,
} from "lucide-react";
import { memo, type FormEvent, useEffect, useRef, useState } from "react";

import type { ChatMessage } from "../../lib/chat/room-chat-service";
import { avatarInitials, avatarToneClass } from "../../lib/room/avatars";
import { roomUiErrorFromUnknown } from "../../lib/room/domain-errors";
import type { RoomWatcher } from "../../lib/realtime/room-channel-service";
import type { RoomSnapshot } from "../../lib/rooms/room-service";
import { Button, IconButton } from "../ui/primitives";

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
  currentUserId,
}: {
  watchers: readonly RoomWatcher[];
  ownerUserId: string;
  currentUserId?: string;
}) {
  const sorted = [...watchers].sort((a, b) => a.user_id.localeCompare(b.user_id));
  const shown = sorted.slice(0, 6);
  const overflow = Math.max(0, sorted.length - shown.length);
  return (
    <section className="tt-presence-strip" aria-label={`${sorted.length} watching`}>
      <div className="tt-presence-meta">
        <span className="tt-presence-strip-kicker">Who&apos;s watching</span>
        <span className="tt-secondary" style={{ fontSize: 12 }}>
          <Users size={12} aria-hidden style={{ marginRight: 4, verticalAlign: -1 }} />
          <strong>{sorted.length}</strong> {sorted.length === 1 ? "person" : "people"}
        </span>
        {sorted.some((w) => w.user_id === ownerUserId) ? (
          <span
            className="tt-status tt-status-warning"
            style={{ transform: "scale(.92)", transformOrigin: "left center" }}
          >
            Owner online
          </span>
        ) : null}
      </div>
      <div className="tt-presence-avatar-row" aria-label="People watching">
        {shown.map((watcher) => {
          const tone = avatarToneClass(watcher.display_name);
          const initials = avatarInitials(watcher.display_name);
          const isOwner = watcher.user_id === ownerUserId;
          const isYou = currentUserId !== undefined && watcher.user_id === currentUserId;
          return (
            <div className="tt-presence-name" key={watcher.user_id}>
              <span
                className={`tt-avatar tt-avatar-online ${tone} ${isOwner ? "tt-avatar-owner" : ""}`}
                title={watcher.display_name}
                aria-label={watcher.display_name}
              >
                {isOwner ? <Crown size={14} aria-hidden /> : initials}
              </span>
              <span className="tt-presence-name-label">
                {isYou ? (
                  <strong>You</strong>
                ) : (
                  watcher.display_name
                )}
                {isOwner ? " (Admin)" : ""}
              </span>
            </div>
          );
        })}
        {overflow > 0 ? (
          <div className="tt-presence-name">
            <span className="tt-avatar tt-avatar-overflow" aria-label={`${overflow} more`}>
              +{overflow}
            </span>
            <span className="tt-presence-name-label">+{overflow} more</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

const ChatMessageRow = memo(function ChatMessageRow({
  message,
  isCurrent,
}: {
  message: ChatMessage;
  isCurrent: boolean;
}) {
  return (
    <article
      className={`tt-message ${isCurrent ? "tt-message-current" : ""}`}
      aria-label={`Message from ${message.sender_display_name}`}
    >
      <span
        className={`tt-avatar ${avatarToneClass(message.sender_display_name)}`}
        aria-hidden
      >
        {avatarInitials(message.sender_display_name)}
      </span>
      <div>
        <div className="tt-message-head">
          <strong>
            {message.sender_display_name}
            {isCurrent ? <span className="tt-visually-hidden"> (you)</span> : null}
          </strong>
          <time dateTime={message.created_at} className="tt-num">
            {formatTime(message.created_at)}
          </time>
        </div>
        <p>{message.body}</p>
      </div>
    </article>
  );
});

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
  // Track message count in a ref to avoid re-running the scroll effect when
  // any unrelated state changes inside the chat (e.g. typing).
  const messageCountRef = useRef(messages.length);
  messageCountRef.current = messages.length;

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
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
          messages.map((message) => (
            <ChatMessageRow
              key={message.id}
              message={message}
              isCurrent={message.user_id === currentUserId}
            />
          ))
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
            placeholder={connected ? "Type a message…" : "Reconnecting…"}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!connected}
          />
          <Button
            type="submit"
            variant="primary"
            className="tt-chat-send"
            loading={sending}
            disabled={!connected || !draft.trim()}
            aria-label="Send message"
          >
            <Send size={17} aria-hidden />
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

const UpNextRow = memo(function UpNextRow({
  item,
  isCurrent,
  label,
  isFirst,
  isLast,
  owner,
  onEdit,
  onRemove,
  onPlayNow,
  onMove,
}: {
  item: QueueItem;
  isCurrent: boolean;
  label: string;
  isFirst: boolean;
  isLast: boolean;
  owner: boolean;
  onEdit: (item: QueueItem) => void;
  onRemove: (item: QueueItem) => void;
  onPlayNow: (item: QueueItem) => void;
  onMove: (item: QueueItem, direction: -1 | 1) => void;
}) {
  return (
    <article className={`tt-queue-row ${isCurrent ? "tt-queue-row-current" : ""}`}>
      <span className="tt-media-fallback" aria-hidden>
        <Film size={20} />
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
            disabled={isFirst}
            onClick={() => onMove(item, -1)}
          >
            <ChevronUp size={16} aria-hidden />
          </IconButton>
          <IconButton
            size="sm"
            variant="ghost"
            label={`Move ${item.title} down`}
            disabled={isLast}
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
            disabled={isCurrent}
            onClick={() => onRemove(item)}
          >
            <Trash2 size={16} aria-hidden />
          </IconButton>
        </div>
      ) : null}
    </article>
  );
});

export const UpNextPanel = memo(function UpNextPanel({
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
          <span className="tt-secondary" style={{ fontSize: 12 }}>
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
      <div className="tt-queue-list">
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
        {queue.map((item, index) => (
          <UpNextRow
            key={item.id}
            item={item}
            isCurrent={item.id === snapshot.playback.current_media_id}
            label={
              item.id === snapshot.playback.current_media_id
                ? "Now playing"
                : index === 0 && !snapshot.current_media
                  ? "Up next"
                  : `Queue ${index + 1}`
            }
            isFirst={index === 0}
            isLast={index === queue.length - 1}
            owner={owner}
            onEdit={onEdit}
            onRemove={onRemove}
            onPlayNow={onPlayNow}
            onMove={onMove}
          />
        ))}
      </div>
      {owner && snapshot.playback.current_media_id ? (
        <div className="tt-queue-footer">
          <p className="tt-help" style={{ margin: 0, textAlign: "center" }}>
            The current item can&apos;t be deleted. Play another item first
            <ChevronRight size={12} style={{ verticalAlign: -1, marginLeft: 4 }} aria-hidden />
          </p>
        </div>
      ) : null}
    </section>
  );
});
