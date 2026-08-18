/**
 * Client-safe constants/helpers shared between the server (`request.ts`)
 * and the client (cookie writer in `locale-provider.tsx`).
 *
 * Anything that pulls in `next/headers` stays in `request.ts`; this file
 * only exports the cookie name and other constants.
 */

export const LOCALE_COOKIE = "tt-locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
