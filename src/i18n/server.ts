/**
 * Server-side entry point. Always import `getServerLocale` / `getMessages`
 * from this module — never directly from `@/i18n`, which is client-safe
 * and would otherwise trigger a client-bundle import of `next/headers`.
 */
export { getServerLocale, LOCALE_COOKIE } from "./request";
export { getMessages, type MessageBundle } from "./messages";
