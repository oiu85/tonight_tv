"use client";

import { ArrowRight, LogIn, RadioTower, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getBrowserAuthService } from "@/lib/auth/auth-service";
import { Brand } from "./brand";
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
      <section className="tt-entry-layout tt-card" aria-labelledby="entry-title">
        <div className="tt-entry-copy">
          <Brand />
          <div>
            <p className="tt-kicker">Private channel</p>
            <h1 id="entry-title" className="tt-title">
              Your room is on tonight.
            </h1>
          </div>
          <p>
            One owner runs the shared timeline. Everyone else opens the private link, joins live, and
            watches the same moment together &mdash; the same frame, the same second.
          </p>
          <ul className="tt-list" aria-label="What Tonight TV includes">
            <li className="tt-inline-cluster tt-secondary">
              <RadioTower size={16} aria-hidden /> Synchronized playback with one shared timeline.
            </li>
            <li className="tt-inline-cluster tt-secondary">
              <Users size={16} aria-hidden /> Watch with friends, chat, and a private up-next queue.
            </li>
          </ul>
        </div>
        <div className="tt-entry-side">
          <p className="tt-kicker">Get started</p>
          <p className="tt-secondary">
            Tonight TV is a private watch room. Sign in once to run your rooms, then send the link
            to anyone you want watching with you.
          </p>
          {state === "loading" ? <LoadingBlock label="Checking your session…" /> : null}
          {state === "error" ? (
            <div className="tt-inline-error" role="alert">
              Tonight TV could not initialize authentication. Check the public Supabase
              configuration and try again.
            </div>
          ) : null}
          {state === "signed-in" ? (
            <Button variant="primary" className="tt-button-wide" onClick={() => router.push("/admin")}>
              <span className="tt-button-label">Open Your Rooms</span>
              <ArrowRight size={18} aria-hidden />
            </Button>
          ) : null}
          {state === "signed-out" ? (
            <Link className="tt-button tt-button-primary tt-button-wide" href="/login">
              <LogIn size={18} aria-hidden />
              <span className="tt-button-label">Sign in as Admin</span>
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
