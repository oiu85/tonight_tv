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
import { Button, LoadingBlock, cx } from "@/components/primitives";
import { LocaleSwitcher, useTranslations } from "@/i18n";
import { HelpLauncher } from "./help";
import { Brand } from "./brand";
import { AuthFeaturePill, AuthFooter, AuthShell } from "./auth-marketing";

const FEATURE_PILL_KEYS = [
  { icon: RadioTower, key: "liveSync" },
  { icon: Users, key: "private" },
  { icon: MessageSquare, key: "chat" },
  { icon: Clapperboard, key: "queue" },
  { icon: Headphones, key: "subtitles" },
  { icon: ShieldCheck, key: "encrypted" },
] as const;

type AuthState = "loading" | "signed-in" | "signed-out" | "error";

export function EntryClient() {
  const router = useRouter();
  const t = useTranslations("entry");
  const tCommon = useTranslations("common");
  const tFeature = useTranslations("entry.featurePills");
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
    <AuthShell
      aside={
        <>
          <div className="tt-entry-hero-art">
            <Brand size="xl" />
          </div>
          {state === "loading" ? <LoadingBlock label={t("checkingSession")} /> : null}
          {state === "error" ? (
            <div className="tt-entry-error-card" role="alert">
              {t("sessionError")}
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
              <span className="tt-button-label">{t("openRooms")}</span>
              <ArrowRight size={18} aria-hidden className="tt-icon-mirror" />
            </Button>
          ) : null}
          {state === "signed-out" ? (
            <Link className="tt-button tt-button-primary tt-button-lg tt-button-wide" href="/login">
              <KeyRound size={18} aria-hidden />
              <span className="tt-button-label">{t("signIn")}</span>
              <ArrowRight size={18} aria-hidden className="tt-icon-mirror" />
            </Link>
          ) : null}
          <div className="tt-entry-divider">
            <span>{tCommon("or", { defaultValue: "or" })}</span>
          </div>
          <Link href="/r/11111111-1111-4111-8111-111111111111" className="tt-entry-link-card">
            <span className="tt-entry-link-icon" aria-hidden>
              <Users size={18} />
            </span>
            <span className="tt-entry-link-copy">
              <strong>{t("viewerLinkTitle")}</strong>
              <span>{t("viewerLinkBody")}</span>
            </span>
            <ArrowRight
              size={18}
              aria-hidden
              className="tt-icon-mirror"
              style={{ alignSelf: "center", color: "var(--tt-text-muted)" }}
            />
          </Link>
          <AuthFooter />
        </>
      }
    >
      <div className="tt-inline-cluster" style={{ justifyContent: "space-between" }}>
        <Brand size="md" />
        <div className="tt-inline-cluster" style={{ gap: 6 }}>
          <LocaleSwitcher variant="compact" />
          <HelpLauncher topic="welcome" label={tCommon("openGuide")} />
        </div>
      </div>

      <p className="tt-kicker tt-anim-fade-up">{t("heroKicker")}</p>
      <h1 id="entry-title" className="tt-entry-hero-title tt-anim-fade-up" style={{ animationDelay: "40ms" }}>
        {t("heroTitle")}
      </h1>
      <p
        className="tt-entry-hero-sub tt-anim-fade-up"
        style={{ animationDelay: "120ms", color: "var(--tt-accent)", fontWeight: 600 }}
      >
        {t("heroSubtitle")}
      </p>
      <p
        className="tt-entry-hero-sub tt-anim-fade-up"
        style={{ animationDelay: "180ms" }}
      >
        {t("heroDescription")}
      </p>

      <ul
        className={cx("tt-entry-hero-pills", "tt-anim-stagger")}
        style={{ animationDelay: "240ms" }}
        aria-label={t("heroTitle")}
      >
        {FEATURE_PILL_KEYS.map((pill) => (
          <AuthFeaturePill
            key={pill.key}
            icon={pill.icon}
            title={tFeature(`${pill.key}.title`)}
            body={tFeature(`${pill.key}.body`)}
          />
        ))}
      </ul>
    </AuthShell>
  );
}
