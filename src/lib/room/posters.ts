/**
 * Static demo artwork bundled with the app. Real product builds would
 * load poster URLs from the media metadata in the room snapshot; this
 * helper keeps the room visually presentable during the pre-backend
 * design demos.
 */

const POSTER_HINTS: ReadonlyArray<{ match: RegExp; poster: string; hero: string }> = [
  {
    match: /interstellar|horizon|stellar|space|cosmic|astronaut|galaxy/i,
    poster: "/media/poster-horizon-beyond.png",
    hero: "/media/room-hero-horizon-beyond.png",
  },
  {
    match: /dark\s*knight|batman|gotham|vigilante|brooding/i,
    poster: "/media/poster-dark-knight.png",
    hero: "/media/room-hero-dark-knight.png",
  },
  {
    match: /inception|dream|fold|city|surreal/i,
    poster: "/media/poster-inception.png",
    hero: "/media/room-hero-inception.png",
  },
  {
    match: /prestige|magician|illusion|trick/i,
    poster: "/media/poster-prestige.png",
    hero: "/media/room-hero-inception.png",
  },
  {
    match: /godfather|mafia|don/i,
    poster: "/media/poster-godfather.png",
    hero: "/media/room-hero-dark-knight.png",
  },
];

const FALLBACK = {
  poster: "/media/poster-horizon-beyond.png",
  hero: "/media/room-hero-horizon-beyond.png",
};

export function posterForTitle(title: string | null | undefined) {
  if (!title) return FALLBACK;
  for (const hint of POSTER_HINTS) {
    if (hint.match.test(title)) {
      return { poster: hint.poster, hero: hint.hero };
    }
  }
  return FALLBACK;
}
