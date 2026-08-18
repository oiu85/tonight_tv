"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

import { useTranslations } from "@/i18n";

export function AuthShell({
  children,
  aside,
}: {
  children: ReactNode;
  aside: ReactNode;
}) {
  return (
    <main className="tt-entry">
      <div className="tt-entry-wrap">
        <section className="tt-entry-hero" aria-labelledby="entry-title">
          <div className="tt-entry-hero-copy">{children}</div>
          <div className="tt-entry-hero-side">{aside}</div>
        </section>
      </div>
    </main>
  );
}

export function AuthBackLink() {
  const t = useTranslations("common");
  return (
    <Link href="/" className="tt-join-back" aria-label={t("back")}>
      <ArrowLeft size={14} aria-hidden className="tt-icon-mirror" />
      <span>{t("back")}</span>
    </Link>
  );
}

export function AuthFooter() {
  const t = useTranslations("common");
  return (
    <p className="tt-entry-foot">
      <span className="tt-entry-foot-pulse" aria-hidden>
        ♥
      </span>
      {t("privateRooms")}
    </p>
  );
}

export function AuthFeaturePill({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ArrowLeft;
  title: string;
  body: string;
}) {
  return (
    <li className="tt-entry-pill">
      <span className="tt-entry-pill-title">
        <span className="tt-entry-pill-icon" aria-hidden>
          <Icon size={14} />
        </span>
        {title}
      </span>
      <span className="tt-entry-pill-body">{body}</span>
    </li>
  );
}
