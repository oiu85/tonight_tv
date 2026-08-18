"use client";

import {
  ArrowRight,
  Film,
  Link2,
  Loader2,
  Lock,
  ShieldCheck,
  User,
  Users,
  UserPlus,
  Video,
  Wifi,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type CSSProperties, type FormEvent, useCallback, useId, useState } from "react";

import type { RoomJoinPreview } from "@/lib/rooms/room-service";
import { posterForTitle } from "@/lib/room/posters";
import { useTranslations } from "@/i18n";
import { Brand } from "../app/brand";
import { Button, Field, Input, LoadingBlock, StatusBadge, useToast } from "@/components/primitives";

type JoinStage = "idle" | "preparing" | "authenticating" | "joining" | "connecting" | "live";

const STAGE_ICONS: ReadonlyArray<{
  id: JoinStage;
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
}> = [
  { id: "preparing", icon: Loader2 },
  { id: "authenticating", icon: Lock },
  { id: "joining", icon: UserPlus },
  { id: "connecting", icon: Wifi },
  { id: "live", icon: Video },
];

export function RoomJoinGate({
  preview,
  joinStage,
  error,
  initialNickname,
  onJoin,
}: {
  preview: RoomJoinPreview | null;
  joinStage: JoinStage;
  error: string | null;
  initialNickname?: string;
  onJoin: (nickname: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("room.join");
  const tCommon = useTranslations("common");
  const inputId = useId();
  const [nickname, setNickname] = useState(initialNickname ?? "");
  const goHome = useCallback(() => router.push("/"), [router]);

  const isJoining = joinStage !== "idle";
  const activeIndex = isJoining ? STAGE_ICONS.findIndex((s) => s.id === joinStage) : -1;
  const heroUrl = posterForTitle(preview?.current_title).hero;
  const heroStyle = preview?.current_title
    ? ({ ["--tt-hero-url" as string]: `url(${heroUrl})` } as CSSProperties)
    : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (isJoining) return;
    const trimmed = nickname.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      toast.push(t("nameLength"), "danger");
      return;
    }
    onJoin(trimmed);
  }

  return (
    <main className="tt-join">
      <section className="tt-join-shell" aria-labelledby="join-room-title">
        <div
          className={
            "tt-join-preview" +
            (preview?.current_title ? " tt-join-preview--with-hero" : "")
          }
          style={heroStyle}
        >
          <div className="tt-join-preview-inner">
            <Brand size="md" />
            <p className="tt-kicker" style={{ marginTop: 24 }}>{t("kicker")}</p>
            <h1 id="join-room-title" className="tt-title">
              {preview?.room_name ?? t("title")}
            </h1>
            <div className="tt-inline-cluster" style={{ gap: 8, flexWrap: "wrap" }}>
              <StatusBadge tone="live">{t("statusReady")}</StatusBadge>
              {preview?.has_active_media ? (
                <StatusBadge tone="accent">
                  <Film size={11} aria-hidden /> {t("nowPlaying")}
                </StatusBadge>
              ) : null}
            </div>
            {preview?.current_title ? (
              <div
                className="tt-section-card"
                style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center" }}
              >
                <div
                  className="tt-empty-illustration"
                  style={{ width: 56, height: 56, borderRadius: 14 }}
                  aria-hidden
                >
                  <Film size={22} />
                </div>
                <div>
                  <p className="tt-kicker" style={{ marginBottom: 4 }}>{t("currentlyPlaying")}</p>
                  <strong style={{ fontSize: 18 }}>{preview.current_title}</strong>
                </div>
              </div>
            ) : null}
            <div className="tt-inline-cluster" style={{ gap: 12, color: "var(--tt-text-muted)", fontSize: 13 }}>
              <Users size={14} aria-hidden style={{ color: "var(--tt-accent)" }} />
              {t("invite")}
            </div>
          </div>
        </div>
        <div className="tt-join-form" aria-live="polite">
          <div>
            <p className="tt-kicker">{t("formKicker")}</p>
            <h2 className="tt-media-title">{t("formTitle")}</h2>
            <p className="tt-secondary">{t("formSubtitle")}</p>
          </div>
          {!isJoining ? (
            <form className="tt-form" onSubmit={submit} noValidate>
              <Field label={t("label")} htmlFor={inputId} help={t("labelHelp")}>
                <div className="tt-input-icon-wrap">
                  <User size={15} aria-hidden className="tt-input-icon" />
                  <Input
                    id={inputId}
                    autoComplete="nickname"
                    maxLength={40}
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    placeholder={t("placeholder")}
                    aria-describedby={error ? `${inputId}-err` : undefined}
                    required
                  />
                </div>
              </Field>
              {error ? (
                <div id={`${inputId}-err`} className="tt-inline-error" role="alert">
                  {error}
                </div>
              ) : null}
              <Button type="submit" variant="primary" size="lg" className="tt-button-wide" onClick={() => undefined}>
                <span className="tt-button-label">{t("submit")}</span>
                <ArrowRight size={18} aria-hidden className="tt-icon-mirror" />
              </Button>
              <p className="tt-secondary" style={{ fontSize: 12, textAlign: "center" }}>
                <ShieldCheck size={12} aria-hidden style={{ verticalAlign: -1, marginInlineEnd: 4, color: "var(--tt-live)" }} />
                {t("notice")}
              </p>
            </form>
          ) : (
            <div className="tt-lifecycle" role="status" aria-live="polite">
              {STAGE_ICONS.map((stage, index) => {
                const Icon = stage.icon;
                const isCurrent = index === activeIndex;
                const isPast = activeIndex > index;
                return (
                  <div
                    key={stage.id}
                    className="tt-lifecycle-step"
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    <div className="tt-lifecycle-step-icon" aria-hidden>
                      <Icon size={16} />
                    </div>
                    <div className="tt-lifecycle-step-label">
                      <strong>{t(`lifecycle.${stage.id}.label`)}</strong>
                      <span>{t(`lifecycle.${stage.id}.body`)}</span>
                    </div>
                    <span className="tt-lifecycle-step-mark">
                      {isCurrent ? tCommon("loading") : isPast ? tCommon("close") : tCommon("more")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      <div className="tt-join-foot">
        <span>
          <ShieldCheck size={12} aria-hidden style={{ verticalAlign: -1, marginInlineEnd: 4, color: "var(--tt-live)" }} />
          {tCommon("privateRooms")}
        </span>
        <span>·</span>
        <span>{t("invite")}</span>
        <button
          type="button"
          className="tt-link"
          style={{ marginInlineStart: 12, background: "transparent", border: 0, cursor: "pointer" }}
          onClick={goHome}
        >
          <Link2 size={12} aria-hidden style={{ verticalAlign: -1, marginInlineEnd: 4 }} /> {tCommon("back")}
        </button>
      </div>
    </main>
  );
}

export function RoomJoinLoading() {
  const t = useTranslations("room.join");
  return (
    <main className="tt-join">
      <div className="tt-auth-card tt-card">
        <LoadingBlock label={t("lifecycle.preparing.label")} />
      </div>
    </main>
  );
}

export function RoomJoinError({
  error,
  onRetry,
  onBack,
}: {
  error: string;
  onRetry?: () => void;
  onBack?: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("room.join");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("room.errors");
  return (
    <main className="tt-entry">
      <div className="tt-entry-wrap" style={{ maxWidth: 540 }}>
        <section className="tt-auth-card" aria-labelledby="room-error-title">
          <Brand size="md" />
          <div style={{ height: 16 }} />
          <p className="tt-kicker">{tErrors("noRoom")}</p>
          <h1 id="room-error-title" className="tt-title">
            {t("title")}
          </h1>
          <p className="tt-secondary">{error}</p>
          <div className="tt-form-actions">
            {onRetry ? <Button onClick={onRetry}>{tCommon("retry")}</Button> : null}
            <Button
              variant="primary"
              onClick={() => (onBack ? onBack() : router.push("/"))}
            >
              {tCommon("back")}
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
