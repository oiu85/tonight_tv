/**
 * Server-side message bundle loader.
 *
 * Uses Next's `import()` with a static manifest so each locale bundle is
 * a separate chunk and only the active one is fetched per request.
 */
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import type { Locale } from "./config";

const BUNDLES = {
  en,
  ar,
} as const satisfies Record<Locale, Record<string, unknown>>;

export type MessageBundle = typeof BUNDLES.en;

export function getMessages(locale: Locale): MessageBundle {
  return BUNDLES[locale] as MessageBundle;
}
