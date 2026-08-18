import { Clapperboard, Popcorn, RadioTower, Tv2 } from "lucide-react";

/**
 * Maps a room name to a deterministic icon and accent tile. The icon is
 * chosen by keyword (movie / night / sci / etc.); the accent is picked
 * by hashing the name so each room feels unique without randomizing.
 */
export function pickRoomArtwork(name: string): "tv" | "popcorn" | "clapper" | "tower" {
  const lower = name.toLowerCase();
  if (lower.includes("sci") || lower.includes("star") || lower.includes("space")) return "tv";
  if (lower.includes("party") || lower.includes("snack")) return "popcorn";
  if (lower.includes("night") || lower.includes("movie") || lower.includes("film")) return "clapper";
  return "tower";
}

const ACCENT_TONES = [
  "tt-accent-indigo",
  "tt-accent-violet",
  "tt-accent-pink",
  "tt-accent-amber",
  "tt-accent-emerald",
  "tt-accent-cyan",
] as const;

export function pickRoomAccent(name: string): (typeof ACCENT_TONES)[number] {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return ACCENT_TONES[hash % ACCENT_TONES.length];
}

export function RoomArtwork({ name, size = 26 }: { name: string; size?: number }) {
  const kind = pickRoomArtwork(name);
  switch (kind) {
    case "tv":
      return <Tv2 size={size} aria-hidden />;
    case "popcorn":
      return <Popcorn size={size} aria-hidden />;
    case "clapper":
      return <Clapperboard size={size} aria-hidden />;
    default:
      return <RadioTower size={size} aria-hidden />;
  }
}
