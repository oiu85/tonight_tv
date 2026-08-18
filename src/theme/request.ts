import "server-only";
import { cookies } from "next/headers";

import { DEFAULT_THEME, isTheme, THEME_COOKIE, type Theme } from "./config";

export { THEME_COOKIE };

export async function getServerTheme(): Promise<Theme> {
  try {
    const value = (await cookies()).get(THEME_COOKIE)?.value;
    if (isTheme(value)) return value;
  } catch {
    // cookies() can throw during prerender.
  }
  return DEFAULT_THEME;
}
