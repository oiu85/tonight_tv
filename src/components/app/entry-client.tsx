"use client";

import {
  ArrowRight,
  Clapperboard,
  Headphones,
  KeyRound,
  MessageSquare,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getBrowserAuthService } from "@/lib/auth/auth-service";
import { Brand } from "./brand";
import { HelpLauncher } from "./help-launcher";
import { Button, LoadingBlock } from "../ui/primitives";

type AuthState = "loading" | "signed-in" | "signed-out" | "error";

export function EntryClient() {
  const router = useRouter();
  const [state, setState] = useState<AuthState>("loading");
  useEffect(() => {
    let active = true;
    getBrowserAuthService()
      .getCurrentAuth()
      .then((auth) => {
        if (active) setState(auth.status === "authenticated" ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="tt-entry">
      <div className="tt-entry-wrap">
        <section className="tt-entry-hero" aria-labelledby="entry-title">
          <div className="tt-entry-hero-copy">
            <div className="tt-inline-cluster" style={{ justifyContent: "space-between" }}>
              <Brand size="md" />
              <HelpLauncher topic="welcome" label="Open the Tonight TV guide" />
            </div>
            <h1 id="entry-title" className="tt-entry-hero-title tt-anim-fade-up">
              Tonight TV
            </h1>
            <p className="tt-entry-hero-sub tt-anim-fade-up" style={{ animationDelay: "80ms", color: "var(--tt-accent)", fontWeight: 600 }}>
              Watch together. In sync. Every night.
            </p>
            <p className="tt-entry-hero-sub tt-anim-fade-up" style={{ animationDelay: "140ms" }}>
              A private watch-room for you and your friends. One timeline.
              Everyone together. The link is the invite — no accounts, no ads,
              no algorithms.
            </p>
            <ul className="tt-entry-hero-pills tt-anim-stagger" style={{ animationDelay: "200ms" }} aria-label="What Tonight TV includes">
              <li className="tt-entry-pill">
                <span className="tt-entry-pill-title">
                  <span className="tt-entry-pill-icon" aria-hidden>
                    <RadioTower size={14} />
                  </span>
                  Live Sync
                </span>
                <span className="tt-entry-pill-body">Always together</span>
              </li>
              <li className="tt-entry-pill">
                <span className="tt-entry-pill-title">
                  <span className="tt-entry-pill-icon" aria-hidden>
                    <Users size={14} />
                  </span>
                  Private
                </span>
                <span className="tt-entry-pill-body">Invite only</span>
              </li>
              <li className="tt-entry-pill">
                <span className="tt-entry-pill-title">
                  <span className="tt-entry-pill-icon" aria-hidden>
                    <MessageSquare size={14} />
                  </span>
                  Chat
                </span>
                <span className="tt-entry-pill-body">Side by side</span>
              </li>
              <li className="tt-entry-pill">
                <span className="tt-entry-pill-title">
                  <span className="tt-entry-pill-icon" aria-hidden>
                    <Clapperboard size={14} />
                  </span>
                  Queue
                </span>
                <span className="tt-entry-pill-body">Up next built in</span>
              </li>
              <li className="tt-entry-pill">
                <span className="tt-entry-pill-title">
                  <span className="tt-entry-pill-icon" aria-hidden>
                    <Headphones size={14} />
                  </span>
                  Subtitles
                </span>
                <span className="tt-entry-pill-body">Private tracks</span>
              </li>
              <li className="tt-entry-pill">
                <span className="tt-entry-pill-title">
                  <span className="tt-entry-pill-icon" aria-hidden>
                    <ShieldCheck size={14} />
                  </span>
                  Encrypted
                </span>
                <span className="tt-entry-pill-body">Realtime + RLS</span>
              </li>
            </ul>
          </div>
          <div className="tt-entry-hero-side">
            <div style={{ display: "grid", placeItems: "center", padding: "12px 0 28px" }}>
              <Brand size="xl" />
            </div>
            {state === "loading" ? <LoadingBlock label="Checking your session…" /> : null}
            {state === "error" ? (
              <div className="tt-entry-error-card" role="alert">
                Tonight TV could not initialize authentication. Check the public Supabase
                configuration and try again.
              </div>
            ) : null}
            {state === "signed-in" ? (
              <Button
                variant="primary"
                size="lg"
                className="tt-button-wide"
                onClick={() => router.push("/admin")}
              >
                <Sparkles size={18} aria-hidden />
                <span className="tt-button-label">Open Your Rooms</span>
                <ArrowRight size={18} aria-hidden />
              </Button>
            ) : null}
            {state === "signed-out" ? (
              <Link className="tt-button tt-button-primary tt-button-lg tt-button-wide" href="/login">
                <KeyRound size={18} aria-hidden />
                <span className="tt-button-label">Sign in as Admin</span>
                <ArrowRight size={18} aria-hidden />
              </Link>
            ) : null}
            <div className="tt-entry-divider">
              <span>or</span>
            </div>
            <Link href="/r/11111111-1111-4111-8111-111111111111" className="tt-entry-link-card">
              <span className="tt-entry-link-icon" aria-hidden>
                <Users size={18} />
              </span>
              <span className="tt-entry-link-copy">
                <strong>Got a room link?</strong>
                <span>Viewers can join directly. Ask your admin for the link.</span>
              </span>
              <ArrowRight size={18} aria-hidden style={{ alignSelf: "center", color: "var(--tt-text-muted)" }} />
            </Link>
            <p className="tt-entry-foot">
              <span className="tt-entry-foot-pulse" aria-hidden>
                ♥
              </span>
              Private. Synchronized. Together.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
