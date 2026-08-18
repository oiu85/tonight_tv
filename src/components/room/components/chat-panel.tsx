"use client";

import { Send } from "lucide-react";
import { memo, type FormEvent, useEffect, useRef, useState } from "react";

import { Button, cx } from "@/components/primitives";
import type { ChatMessage } from "@/lib/chat/room-chat-service";
import { roomUiErrorFromUnknown } from "@/lib/room/domain-errors";
import { avatarInitials, avatarToneClass } from "@/lib/room/avatars";
import { useLocale, useTranslations } from "@/i18n";
import { formatLocaleDate } from "./playback-helpers";

function formatTime(iso: string, locale: "en" | "ar"): string {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

const ChatMessageRow = memo(function ChatMessageRow({
  message,
  isCurrent,
  locale,
  messageAria,
  youLabel,
}: {
  message: ChatMessage;
  isCurrent: boolean;
  locale: "en" | "ar";
  messageAria: string;
  youLabel: string;
}) {
  return (
    <article
      className={cx("tt-message", isCurrent && "tt-message-current")}
      aria-label={messageAria}
    >
      <span
        className={cx("tt-avatar", avatarToneClass(message.sender_display_name))}
        aria-hidden
      >
        {avatarInitials(message.sender_display_name)}
      </span>
      <div>
        <div className="tt-message-head">
          <strong>
            {message.sender_display_name}
            {isCurrent ? <span className="tt-visually-hidden"> {youLabel}</span> : null}
          </strong>
          <time dateTime={message.created_at} className="tt-num" dir="ltr">
            {formatTime(message.created_at, locale)}
          </time>
        </div>
        <p>
          <bdi>{message.body}</bdi>
        </p>
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
  const t = useTranslations("room.chat");
  const tErrors = useTranslations("room.errors");
  const { locale } = useLocale();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Smooth-scroll to the latest message whenever a new one lands. The
  // list itself owns the smooth-scroll behaviour; the composer doesn't
  // need to know about messages.
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
      const friendly = roomUiErrorFromUnknown(cause, tErrors("chatSendFailed"));
      setError(friendly.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="tt-chat" aria-label={t("title")}>
      <div
        className="tt-chat-list"
        ref={listRef}
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 ? (
          <div className="tt-empty-block">
            <p className="tt-empty-block-eyebrow">{t("emptyEyebrow")}</p>
            <h3 className="tt-section-title">{t("emptyTitle")}</h3>
            <p>{t("emptyBody")}</p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessageRow
              key={message.id}
              message={message}
              isCurrent={message.user_id === currentUserId}
              locale={locale}
              messageAria={t("messageAria", { name: message.sender_display_name })}
              youLabel={t("you")}
            />
          ))
        )}
      </div>

      <form className="tt-chat-composer" onSubmit={submit}>
        <label className="tt-visually-hidden" htmlFor="room-message">
          {t("inputAria")}
        </label>
        <div className="tt-chat-composer-row">
          <input
            id="room-message"
            className="tt-input"
            maxLength={1000}
            placeholder={connected ? t("inputPlaceholderLive") : t("inputPlaceholderReconnecting")}
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
            aria-label={t("send")}
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

// Re-export so consumers don't have to know about the helper location
export { formatLocaleDate };
