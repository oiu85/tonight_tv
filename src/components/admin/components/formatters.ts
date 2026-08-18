import type { OwnedRoomListItem, RoomStatus } from "@/lib/rooms/room-service";
import type { Locale } from "@/i18n";

/**
 * Time formatters used across the admin workspace. We pull them into a
 * single module so they stay consistent and can be tweaked once.
 *
 * Formatters accept the active locale so the output matches the user's
 * language (e.g. Arabic uses the Umm al-Qura calendar in some cases,
 * or Hijri formatting). Direction is used to flip "X ago" word order
 * when the browser's Intl output would still be LTR-shaped.
 */

const RT = (typeof Intl !== "undefined" && (Intl as { RelativeTimeFormat?: typeof Intl.RelativeTimeFormat }).RelativeTimeFormat) || undefined;

function pickNumberLocale(locale: Locale): string {
  if (locale === "ar") return "ar";
  return "en";
}

export function formatRelative(iso: string, locale: Locale = "en", now: number = Date.now()): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const diffMs = now - time;
  const minutes = Math.round(diffMs / 60_000);
  const numberLocale = pickNumberLocale(locale);

  if (RT) {
    const rtf = new RT(numberLocale, { numeric: "auto" });
    if (minutes < 1) return rtf.format(0, "second");
    if (minutes < 60) return rtf.format(-minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (hours < 24) return rtf.format(-hours, "hour");
    const days = Math.round(hours / 24);
    if (days < 7) return rtf.format(-days, "day");
    if (days < 30) return rtf.format(-Math.round(days / 7), "week");
    if (days < 365) return rtf.format(-Math.round(days / 30), "month");
    return rtf.format(-Math.round(days / 365), "year");
  }

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat(numberLocale, { dateStyle: "medium" }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined, locale: Locale = "en"): string {
  if (!iso) return "—";
  const numberLocale = pickNumberLocale(locale);
  // Arabic uses the Gregorian calendar by default in the Intl API; this
  // gives the user familiar Arabic-Indic digit shapes while keeping the
  // calendar consistent. We can swap to `calendar: "islamic-umalqura"`
  // here later if the user opts in.
  return new Intl.DateTimeFormat(numberLocale, { dateStyle: "medium" }).format(new Date(iso));
}

export function roomStatusLabel(status: RoomStatus): "Active" | "Deactivated" {
  return status === "active" ? "Active" : "Deactivated";
}

export type RoomFilterTab = "active" | "deactivated" | "all";

export function filterRooms(
  rooms: readonly OwnedRoomListItem[],
  tab: RoomFilterTab,
  query: string,
): readonly OwnedRoomListItem[] {
  const needle = query.trim().toLowerCase();
  return rooms.filter((room) => {
    if (tab === "active" && room.status !== "active") return false;
    if (tab === "deactivated" && room.status !== "deactivated") return false;
    if (needle && !room.name.toLowerCase().includes(needle)) return false;
    return true;
  });
}
