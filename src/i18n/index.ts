/**
 * Public surface of the i18n module — safe to import from both client and
 * server code. Server-only helpers (`getServerLocale`, `getMessages`) live
 * in `@/i18n/server` so that the bundler never pulls `next/headers` into
 * a client bundle.
 *
 * Client code: import { useTranslations, useLocale, LocaleProvider } from "@/i18n";
 *              import { LocaleSwitcher } from "@/i18n";
 * Server code: import { getServerLocale, getMessages } from "@/i18n/server";
 */

export {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  getDirection,
  getLocaleMeta,
  getNumberLocale,
  type Locale,
} from "./config";

export { LOCALE_COOKIE } from "./request-shared";
export { LocaleProvider, useLocale, useTranslations } from "./locale-provider";
export { LocaleSwitcher } from "./locale-switcher";
