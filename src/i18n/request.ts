/**
 * Server-side locale resolution. SERVER-ONLY — pulls in `next/headers`,
 * so it must never be imported from a client module.
 *
 * Import from `@/i18n/server` (which re-exports this module) to keep the
 * `next/headers` dependency out of client bundles.
 */
import "server-only";
import { cookies } from "next/headers";

import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { LOCALE_COOKIE } from "./request-shared";

export { LOCALE_COOKIE };

export async function getServerLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    const value = store.get(LOCALE_COOKIE)?.value;
    if (isLocale(value)) {
      return value;
    }
  } catch {
    // cookies() throws in some prerender contexts — fall back to default.
  }
  return DEFAULT_LOCALE;
}
