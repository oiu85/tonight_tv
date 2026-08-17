/**
 * Deterministic, dependency-free colour picker so the avatar circle for a
 * given display name is stable across the room and across reconnects.
 *
 * Uses a simple FNV-1a-style hash so we never leak user identity via
 * `Math.random()`-derived tints and so that two clients agree on the
 * colour for the same nickname without any server roundtrip.
 */

const AVATAR_COUNT = 8;

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

export function avatarToneClass(input: string | null | undefined): string {
  if (!input) return "tt-avatar-1";
  const hash = hashSeed(input.trim().toLowerCase());
  const tone = (hash % AVATAR_COUNT) + 1;
  return `tt-avatar-${tone}`;
}

export function avatarToneIndex(input: string | null | undefined): number {
  if (!input) return 1;
  return (hashSeed(input.trim().toLowerCase()) % AVATAR_COUNT) + 1;
}

export function avatarInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + second).toUpperCase() || "?";
}
