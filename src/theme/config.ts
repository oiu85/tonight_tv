export const THEME_COOKIE = "tt-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const DEFAULT_THEME = "dark" as const;

export type Theme = "dark" | "light";

export function isTheme(value: string | undefined | null): value is Theme {
  return value === "dark" || value === "light";
}
