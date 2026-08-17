"use client";

import { ArrowLeft, Eye, EyeOff, KeyRound, LogIn, Mail, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { AuthServiceError, getBrowserAuthService } from "@/lib/auth/auth-service";
import { Brand } from "../app/brand";
import { HelpLauncher } from "../app/help-launcher";
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
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBrowserAuthService()
      .getCurrentAuth()
      .then((auth) => {
        if (auth.status === "authenticated" && !auth.user.is_anonymous)
          router.replace("/admin");
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
      <div className="tt-entry-wrap" style={{ maxWidth: 540 }}>
        <section className="tt-auth-card" aria-labelledby="login-title">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link href="/" className="tt-join-back" aria-label="Back to Tonight TV">
              <ArrowLeft size={14} aria-hidden /> Back
            </Link>
            <HelpLauncher topic="admin" label="Open the Tonight TV guide" />
          </div>
          <div style={{ display: "grid", placeItems: "center", padding: "20px 0 18px" }}>
            <Brand size="md" />
          </div>
          <p className="tt-kicker">Room operator</p>
          <h1 id="login-title" className="tt-title">
            Admin Sign In
          </h1>
          <p className="tt-secondary">Sign in to access your watch room and control playback.</p>
          <form className="tt-form" onSubmit={submit} noValidate style={{ marginTop: 16 }}>
            <Field label="Email" htmlFor="login-email">
              <div style={{ position: "relative" }}>
                <Mail
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
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  style={{ paddingLeft: 38 }}
                  required
                />
              </div>
            </Field>
            <Field label="Password" htmlFor="login-password">
              <div style={{ position: "relative" }}>
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  style={{ paddingRight: 44 }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    color: "var(--tt-text-muted)",
                    width: 32,
                    height: 32,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 8,
                  }}
                >
                  {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                </button>
              </div>
            </Field>
            {error ? (
              <div className="tt-inline-error" role="alert" aria-live="assertive">
                {error}
              </div>
            ) : null}
            <Button type="submit" variant="primary" size="lg" className="tt-button-wide" loading={submitting}>
              <LogIn size={18} aria-hidden />
              <span className="tt-button-label">Sign In</span>
            </Button>
            <div className="tt-auth-divider">
              <span>or</span>
            </div>
            <Link
              href="/"
              className="tt-button tt-button-ghost tt-button-wide"
              style={{ textAlign: "center" }}
            >
              <Sparkles size={15} aria-hidden />
              <span className="tt-button-label">Not the room owner? Back to Tonight TV</span>
            </Link>
            <p className="tt-help" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 }}>
              <ShieldCheck size={13} aria-hidden style={{ color: "var(--tt-live)" }} />
              <KeyRound size={13} aria-hidden style={{ color: "var(--tt-text-muted)" }} />
              Your credentials are sent directly to Supabase Auth.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
