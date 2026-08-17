"use client";

import { ArrowLeft, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { AuthServiceError, getBrowserAuthService } from "@/lib/auth/auth-service";
import { Brand } from "../app/brand";
import { Button, Field, Input } from "../ui/primitives";

function safeAuthError(error: unknown): string {
  if (error instanceof AuthServiceError && error.code === "admin_sign_in_failed")
    return "The email or password is incorrect.";
  return "Sign in is unavailable right now. Check your connection and try again.";
}

export function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBrowserAuthService()
      .getCurrentAuth()
      .then((auth) => {
        if (auth.status === "authenticated" && !auth.user.is_anonymous) router.replace("/admin");
      })
      .catch(() => undefined);
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await getBrowserAuthService().signInAdmin({ email: email.trim(), password });
      router.replace("/admin");
      router.refresh();
    } catch (cause) {
      setError(safeAuthError(cause));
      setSubmitting(false);
    }
  }

  return (
    <main className="tt-entry">
      <section className="tt-auth-card tt-card" aria-labelledby="login-title">
        <Link href="/" className="tt-button tt-button-ghost tt-button-sm">
          <ArrowLeft size={17} aria-hidden />
          <span className="tt-button-label">Back</span>
        </Link>
        <div style={{ height: 24 }} />
        <Brand />
        <div style={{ height: 24 }} />
        <p className="tt-kicker">Room operator</p>
        <h1 id="login-title" className="tt-title">Sign in</h1>
        <p className="tt-secondary">Use the owner account that manages your private rooms.</p>
        <form className="tt-form" onSubmit={submit} noValidate>
          <Field label="Email" htmlFor="login-email">
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Field label="Password" htmlFor="login-password">
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          {error ? (
            <div className="tt-inline-error" role="alert" aria-live="assertive">
              {error}
            </div>
          ) : null}
          <Button type="submit" variant="primary" className="tt-button-wide" loading={submitting}>
            <LogIn size={18} aria-hidden />
            <span className="tt-button-label">Sign In</span>
          </Button>
        </form>
      </section>
    </main>
  );
}
