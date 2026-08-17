"use client";

import { ArrowRight, LogIn, RadioTower, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useId, useState } from "react";

import type { RoomJoinPreview } from "@/lib/rooms/room-service";
import { Brand } from "../app/brand";
import { Button, Field, Input, LoadingBlock, StatusBadge, useToast } from "../ui/primitives";

type JoinStage = "idle" | "preparing" | "authenticating" | "joining" | "connecting" | "live";

const STAGE_COPY: ReadonlyArray<{ id: JoinStage; label: string }> = [
  { id: "preparing", label: "Preparing room…" },
  { id: "authenticating", label: "Authenticating…" },
  { id: "joining", label: "Joining room…" },
  { id: "connecting", label: "Connecting…" },
  { id: "live", label: "Joining live…" },
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
      <section className="tt-join-shell tt-card" aria-labelledby="join-room-title">
        <div className="tt-join-preview">
          <div className="tt-join-preview-inner">
            <Brand />
            <div className="tt-inline-cluster" style={{ gap: 8 }}>
              <StatusBadge tone="live">Room ready</StatusBadge>
              {preview?.has_active_media ? (
                <StatusBadge tone="neutral">Now playing</StatusBadge>
              ) : null}
            </div>
            <div>
              <p className="tt-kicker">Private watch room</p>
              <h1 id="join-room-title" className="tt-title">
                {preview?.room_name ?? "Private room"}
              </h1>
            </div>
            {preview?.current_title ? (
              <p className="tt-secondary">
                Friends are watching <strong>{preview.current_title}</strong>.
              </p>
            ) : (
              <p className="tt-secondary">
                The room is ready. Join to see the queue, chat, and live playback.
              </p>
            )}
            <ul className="tt-list tt-secondary" aria-label="What happens when you join">
              <li className="tt-inline-cluster">
                <RadioTower size={15} aria-hidden /> Watch the same moment as the room.
              </li>
              <li className="tt-inline-cluster">
                <Users size={15} aria-hidden /> Chat and see who is in the room.
              </li>
            </ul>
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
              <Field label="Display name" htmlFor={inputId}>
                <Input
                  id={inputId}
                  autoComplete="nickname"
                  maxLength={40}
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="e.g. Sam"
                  aria-describedby={error ? `${inputId}-err` : undefined}
                  required
                />
              </Field>
              {error ? (
                <div id={`${inputId}-err`} className="tt-inline-error" role="alert">
                  {error}
                </div>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                className="tt-button-wide"
                onClick={() => undefined}
              >
                <LogIn size={18} aria-hidden />
                <span className="tt-button-label">JOIN LIVE</span>
                <ArrowRight size={18} aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={goHome}
              >
                Back to Tonight TV
              </Button>
            </form>
          ) : (
            <div className="tt-lifecycle" role="status" aria-live="polite">
              {STAGE_COPY.map((stage, index) => {
                const isCurrent = index === activeIndex;
                const isPast = activeIndex > index;
                return (
                  <div
                    key={stage.id}
                    className={`tt-lifecycle-step ${isCurrent ? "tt-lifecycle-step-active" : ""}`}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    <span className="tt-lifecycle-dot" aria-hidden />
                    <span className="tt-lifecycle-step-label">{stage.label}</span>
                    {isCurrent ? (
                      <span className="tt-spinner" aria-hidden style={{ marginLeft: "auto" }} />
                    ) : isPast ? (
                      <span className="tt-muted" style={{ marginLeft: "auto" }} aria-hidden>
                        done
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
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
  const goHome = useCallback(() => router.push("/"), [router]);
  return (
    <main className="tt-entry">
      <section className="tt-auth-card tt-card" aria-labelledby="room-error-title">
        <Brand />
        <div style={{ height: 24 }} />
        <p className="tt-kicker">Room unavailable</p>
        <h1 id="room-error-title" className="tt-title">
          This room link is invalid
        </h1>
        <p className="tt-secondary">{error}</p>
        <div className="tt-form-actions">
          {onRetry ? (
            <Button onClick={onRetry}>Retry</Button>
          ) : null}
          <Button
            variant="primary"
            onClick={() => (onBack ? onBack() : goHome())}
          >
            Back to Tonight TV
          </Button>
        </div>
      </section>
    </main>
  );
}
