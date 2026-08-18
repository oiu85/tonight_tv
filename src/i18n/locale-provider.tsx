"use client";

/**
 * Client-side locale provider.
 *
 * Responsibilities:
 *   1. Receive the SSR-resolved locale as a prop and feed it to next-intl
 *      so `useTranslations()` works in every client component.
 *   2. Provide a `useLocale()` / `useDirection()` API for components that
 *      don't need translations.
 *   3. Allow runtime locale switching: writes a cookie and updates
 *      `<html lang>` / `<html dir>` so the layout flips instantly without
 *      a full reload. CSS that depends on `[dir="rtl"]` selectors also
 *      updates automatically.
 *   4. Apply the Arabic font class on `<html>` so font-feature-settings,
 *      shaping, and stack overrides all kick in for RTL.
 *
 * The provider deliberately keeps its props small. Server components do
 * their own locale detection via `getServerLocale()` and pass the result
 * in — this keeps first paint correct without a client flash.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NextIntlClientProvider, useTranslations as useNextIntlTranslations } from "next-intl";

import { DEFAULT_LOCALE, getDirection, getLocaleMeta, isLocale, LOCALES, type Locale } from "./config";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "./request-shared";
import type { MessageBundle } from "./messages";

const RTL_LOCALE_CLASS = "tt-rtl";

type Direction = "ltr" | "rtl";

interface LocaleContextValue {
  locale: Locale;
  direction: Direction;
  setLocale: (next: Locale) => void;
  availableLocales: typeof LOCALES;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function writeLocaleCookie(next: Locale) {
  if (typeof document === "undefined") return;
  // Path=/ makes the cookie available to every route, including the
  // server-rendered admin / room pages. SameSite=Lax so the cookie is
  // sent on cross-site navigations back to the app.
  document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

function applyHtmlAttributes(locale: Locale) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const meta = getLocaleMeta(locale);
  root.setAttribute("lang", meta.intl);
  root.setAttribute("dir", meta.direction);
  if (meta.direction === "rtl") {
    root.classList.add(RTL_LOCALE_CLASS);
  } else {
    root.classList.remove(RTL_LOCALE_CLASS);
  }
}

export interface LocaleProviderProps {
  /** Server-resolved locale used for the initial render. */
  initialLocale: Locale;
  /** Initial message bundle (server-loaded). */
  initialMessages: MessageBundle;
  children: ReactNode;
}

export function LocaleProvider({ initialLocale, initialMessages, children }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [messages, setMessages] = useState<MessageBundle>(initialMessages);
  const localeRequestRef = useRef(0);

  // Keep <html dir>/lang and the RTL helper class in sync with the active
  // locale. The first effect also corrects the SSR'd attributes if the
  // cookie was out of sync with the rendered locale.
  useEffect(() => {
    applyHtmlAttributes(locale);
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      if (!isLocale(next)) return;

      const requestId = ++localeRequestRef.current;
      if (next === locale) {
        writeLocaleCookie(next);
        applyHtmlAttributes(next);
        return;
      }

      writeLocaleCookie(next);
      applyHtmlAttributes(next);
      // Lazy-load the matching message bundle. We use a dynamic import so
      // the JSON for inactive locales doesn't bloat the initial bundle.
      import(`../../messages/${next}.json`)
        .then((mod) => {
          if (requestId !== localeRequestRef.current) return;
          setMessages(mod.default as MessageBundle);
          setLocaleState(next);
        })
        .catch(() => {
          if (requestId !== localeRequestRef.current) return;
          // If the import fails for any reason, fall back to the default
          // locale and bundle together so the UI never mixes languages.
          import(`../../messages/${DEFAULT_LOCALE}.json`).then((mod) => {
            if (requestId !== localeRequestRef.current) return;
            writeLocaleCookie(DEFAULT_LOCALE);
            applyHtmlAttributes(DEFAULT_LOCALE);
            setMessages(mod.default as MessageBundle);
            setLocaleState(DEFAULT_LOCALE);
          });
        });
    },
    [locale],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      direction: getDirection(locale),
      setLocale,
      availableLocales: LOCALES,
    }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone={typeof window === "undefined" ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

/** Access the current locale, direction, and setter. */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Fall back to defaults if the provider is missing — this lets
    // unit tests and isolated Storybook-like setups render without a
    // wrapping provider.
    return {
      locale: DEFAULT_LOCALE,
      direction: getDirection(DEFAULT_LOCALE),
      setLocale: () => undefined,
      availableLocales: LOCALES,
    };
  }
  return ctx;
}

/** Sugar for `useTranslations()`. Re-exported so callers only import once. */
export function useTranslations(scope?: Parameters<typeof useNextIntlTranslations>[0]) {
  return useNextIntlTranslations(scope);
}
