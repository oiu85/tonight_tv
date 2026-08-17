"use client";

import {
  ArrowRight,
  CheckCircle2,
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
import { Brand } from "../app/brand";
import { Button, Field, Input, LoadingBlock, StatusBadge, useToast } from "../ui/primitives";

type JoinStage = "idle" | "preparing" | "authenticating" | "joining" | "connecting" | "live";

const STAGE_COPY: ReadonlyArray<{
  id: JoinStage;
  label: string;
  body: string;
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
}> = [
  { id: "preparing", label: "Preparing room…", body: "Fetching room information", icon: Loader2 },
  { id: "authenticating", label: "Authenticating…", body: "Verifying your identity", icon: Lock },
  { id: "joining", label: "Joining room…", body: "Creating your membership", icon: UserPlus },
  { id: "connecting", label: "Connecting…", body: "Establishing live connection", icon: Wifi },
  { id: "live", label: "Joining live…", body: "Getting you in sync", icon: Video },
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
  const inputId = useId();
  const [nickname, setNickname] = useState(initialNickname ?? "");
  const goHome = useCallback(() => router.push("/"), [router]);

  const isJoining = joinStage !== "idle";
  const activeIndex = isJoining ? STAGE_COPY.findIndex((s) => s.id === joinStage) : -1;
  const heroUrl = posterForTitle(preview?.current_title).hero;
  const heroStyle = preview?.current_title
    ? ({ ["--tt-hero-url" as string]: `url(${heroUrl})` } as CSSProperties)
    : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (isJoining) return;
    const trimmed = nickname.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      toast.push("Display name must contain between 1 and 40 characters.", "danger");
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
            <p className="tt-kicker" style={{ marginTop: 24 }}>You&apos;re about to join</p>
            <h1 id="join-room-title" className="tt-title">
              {preview?.room_name ?? "Private room"}
            </h1>
            <div className="tt-inline-cluster" style={{ gap: 8, flexWrap: "wrap" }}>
              <StatusBadge tone="live">Room is ready</StatusBadge>
              {preview?.has_active_media ? (
                <StatusBadge tone="accent">
                  <Film size={11} aria-hidden /> Now playing
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
                  <p className="tt-kicker" style={{ marginBottom: 4 }}>Currently playing</p>
                  <strong style={{ fontSize: 18 }}>{preview.current_title}</strong>
                </div>
              </div>
            ) : null}
            <div className="tt-inline-cluster" style={{ gap: 12, color: "var(--tt-text-muted)", fontSize: 13 }}>
              <Users size={14} aria-hidden style={{ color: "var(--tt-accent)" }} />
              Friends are watching · Jump in and enjoy together.
            </div>
          </div>
        </div>
        <div className="tt-join-form" aria-live="polite">
          <div>
            <p className="tt-kicker">Join this room</p>
            <h2 className="tt-media-title">Join live</h2>
            <p className="tt-secondary">Choose the name your friends will see.</p>
          </div>
          {!isJoining ? (
            <form className="tt-form" onSubmit={submit} noValidate>
              <Field label="Display name" htmlFor={inputId} help="This is how your friends will see you.">
                <div style={{ position: "relative" }}>
                  <User
                    size={15}
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--tt-text-muted)",
                    }}
                  />
                  <Input
                    id={inputId}
                    autoComplete="nickname"
                    maxLength={40}
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    placeholder="Enter your nickname"
                    style={{ paddingLeft: 38 }}
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
                <span className="tt-button-label">JOIN LIVE</span>
                <ArrowRight size={18} aria-hidden />
              </Button>
              <p className="tt-secondary" style={{ fontSize: 12, textAlign: "center" }}>
                <ShieldCheck size={12} aria-hidden style={{ verticalAlign: -1, marginRight: 4, color: "var(--tt-live)" }} />
                By joining, you&apos;ll be added to the room and can watch live.
              </p>
            </form>
          ) : (
            <div className="tt-lifecycle" role="status" aria-live="polite">
              {STAGE_COPY.map((stage, index) => {
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
                      {isCurrent ? <Icon size={16} /> : isPast ? <CheckCircle2 size={16} /> : <Icon size={16} />}
                    </div>
                    <div className="tt-lifecycle-step-label">
                      <strong>{stage.label}</strong>
                      <span>{stage.body}</span>
                    </div>
                    <span className="tt-lifecycle-step-mark">
                      {isCurrent ? "active" : isPast ? "done" : "queued"}
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
          <ShieldCheck size={12} aria-hidden style={{ verticalAlign: -1, marginRight: 4, color: "var(--tt-live)" }} />
          Private room. Invite only.
        </span>
        <span>·</span>
        <span>Your privacy is protected.</span>
        <button
          type="button"
          className="tt-link"
          style={{ marginLeft: 12, background: "transparent", border: 0, cursor: "pointer" }}
          onClick={goHome}
        >
          <Link2 size={12} aria-hidden style={{ verticalAlign: -1, marginRight: 4 }} /> Back to Tonight TV
        </button>
      </div>
    </main>
  );
}

export function RoomJoinLoading() {
  return (
    <main className="tt-join">
      <div className="tt-auth-card tt-card">
        <LoadingBlock label="Preparing room…" />
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
  return (
    <main className="tt-entry">
      <div className="tt-entry-wrap" style={{ maxWidth: 540 }}>
        <section className="tt-auth-card" aria-labelledby="room-error-title">
          <Brand size="md" />
          <div style={{ height: 16 }} />
          <p className="tt-kicker">Room unavailable</p>
          <h1 id="room-error-title" className="tt-title">
            This room link is invalid
          </h1>
          <p className="tt-secondary">{error}</p>
          <div className="tt-form-actions">
            {onRetry ? <Button onClick={onRetry}>Retry</Button> : null}
            <Button
              variant="primary"
              onClick={() => (onBack ? onBack() : router.push("/"))}
            >
              Back to Tonight TV
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
