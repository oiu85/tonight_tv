/**
 * Centralised locale configuration for Tonight TV.
 *
 * Tonight TV ships in English (`en`) and Arabic (`ar`). Adding a new
 * locale is a 3-step change:
 *   1. Add the code + label to LOCALES below.
 *   2. Add a `messages/<locale>.json` file with the same shape as the
 *      English bundle.
 *   3. Register the new code in the LocaleProvider's PLURAL_RULES if the
 *      locale doesn't follow the default `Intl.PluralRules` behaviour.
 *
 * The direction of every supported locale is declared here so that
 * layout, icons, and the `dir` attribute all stay in sync from a single
 * source of truth.
 */

export const DEFAULT_LOCALE = "en" as const;

export type Locale = "en" | "ar";

export const LOCALES: ReadonlyArray<{
  code: Locale;
  label: string;
  nativeLabel: string;
  direction: "ltr" | "rtl";
  intl: string; // BCP-47 tag, also passed to Intl.* constructors
}> = [
  { code: "en", label: "English", nativeLabel: "English", direction: "ltr", intl: "en" },
  { code: "ar", label: "Arabic",  nativeLabel: "العربية",  direction: "rtl", intl: "ar" },
] as const;

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "ar";
}

export function getLocaleMeta(code: Locale) {
  return LOCALES.find((entry) => entry.code === code) ?? LOCALES[0];
}

export function getDirection(code: Locale): "ltr" | "rtl" {
  return getLocaleMeta(code).direction;
}

/** Negation for `Intl.NumberFormat` so that dates line up RTL. */
export function getNumberLocale(code: Locale): string {
  return getLocaleMeta(code).intl;
}
