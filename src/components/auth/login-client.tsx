"use client";

import { Eye, EyeOff, KeyRound, LogIn, Mail, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useState } from "react";

import { AuthServiceError, getBrowserAuthService } from "@/lib/auth/auth-service";
import { Button, Field, Input } from "@/components/primitives";
import { LocaleSwitcher, useTranslations } from "@/i18n";
import { Brand } from "@/components/app/brand";
import { HelpLauncher } from "@/components/app/help";
import { AuthBackLink, AuthShell } from "@/components/app/auth-marketing";

export function LoginClient() {
  const router = useRouter();
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the user is already authenticated, skip the form and head to the
  // admin workspace. This is a soft redirect — no UI flicker.
  useEffect(() => {
    getBrowserAuthService()
      .getCurrentAuth()
      .then((auth) => {
        if (auth.status === "authenticated" && !auth.user.is_anonymous) {
          router.replace("/admin");
        }
      })
      .catch(() => undefined);
  }, [router]);

  function safeAuthError(cause: unknown): string {
    if (cause instanceof AuthServiceError && cause.code === "admin_sign_in_failed") {
      return t("error.invalidCredentials");
    }
    return t("error.generic");
  }

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
    <AuthShell
      aside={
        <form className="tt-form" onSubmit={submit} noValidate>
          <Field label={t("email")} htmlFor={emailId}>
            <div className="tt-input-icon-wrap">
              <Mail size={15} aria-hidden className="tt-input-icon" />
              <Input
                id={emailId}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("emailPlaceholder")}
                required
              />
            </div>
          </Field>

          <Field label={t("password")} htmlFor={passwordId}>
            <div className="tt-input-icon-wrap">
              <Input
                id={passwordId}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("passwordPlaceholder")}
                required
              />
              <button
                type="button"
                className="tt-input-trailing"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? t("hidePassword") : t("showPassword")}
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
            <span className="tt-button-label">{t("signIn")}</span>
          </Button>

          <div className="tt-auth-divider">
            <span>{tCommon("or")}</span>
          </div>

          <Link
            href="/"
            className="tt-button tt-button-ghost tt-button-wide"
            style={{ textAlign: "center" }}
          >
            <Sparkles size={15} aria-hidden />
            <span className="tt-button-label">{t("backHome")}</span>
          </Link>

          <p className="tt-help" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 }}>
            <ShieldCheck size={13} aria-hidden style={{ color: "var(--tt-live)" }} />
            <KeyRound size={13} aria-hidden style={{ color: "var(--tt-text-muted)" }} />
            {t("credentialNotice")}
          </p>
        </form>
      }
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <AuthBackLink />
        <div className="tt-inline-cluster" style={{ gap: 6 }}>
          <LocaleSwitcher variant="compact" />
          <HelpLauncher topic="admin" label={tCommon("openGuide")} />
        </div>
      </div>

      <div style={{ display: "grid", placeItems: "center", padding: "20px 0 18px" }}>
        <Brand size="md" />
      </div>

      <p className="tt-kicker">{t("kicker")}</p>
      <h1 className="tt-title">{t("title")}</h1>
      <p className="tt-secondary">{t("subtitle")}</p>
    </AuthShell>
  );
}
