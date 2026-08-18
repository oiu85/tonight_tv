// Test setup that wraps any component in the LocaleProvider so tests
// can call `useTranslations()` and `useLocale()` without explicitly
// mounting the provider in every test file.

import { NextIntlClientProvider } from "next-intl";
import { type ReactNode } from "react";

import { LocaleProvider } from "../src/i18n/locale-provider";
import en from "../messages/en.json";

/**
 * Renders `children` inside the same i18n stack the real app uses:
 * - LocaleProvider (our thin wrapper that also updates <html dir>)
 * - NextIntlClientProvider (next-intl's React context)
 *
 * Tests can wrap their JSX in this helper instead of building a fresh
 * provider tree every time.
 */
export function I18nHarness({ children, locale = "en" }: { children: ReactNode; locale?: "en" | "ar" }) {
  return (
    <LocaleProvider initialLocale={locale} initialMessages={en as never}>
      <NextIntlClientProvider locale={locale} messages={en} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </LocaleProvider>
  );
}
