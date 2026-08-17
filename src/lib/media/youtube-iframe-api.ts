const YOUTUBE_IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

export const YOUTUBE_PLAYER_STATE = Object.freeze({
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const);

export type YouTubePlayerState =
  (typeof YOUTUBE_PLAYER_STATE)[keyof typeof YOUTUBE_PLAYER_STATE];

export type YouTubePlayer = Readonly<{
  cueVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getPlaybackRate: () => number;
  setPlaybackRate: (rate: number) => void;
  getAvailablePlaybackRates: () => number[];
  getVolume: () => number;
  setVolume: (volume: number) => void;
  isMuted: () => boolean;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
}>;

export type YouTubePlayerEvent = Readonly<{
  target: YouTubePlayer;
  data: number;
}>;

export type YouTubePlayerOptions = Readonly<{
  width: string;
  height: string;
  playerVars: Readonly<Record<string, string | number>>;
  events: Readonly<{
    onReady: (event: YouTubePlayerEvent) => void;
    onStateChange: (event: YouTubePlayerEvent) => void;
    onPlaybackRateChange: (event: YouTubePlayerEvent) => void;
    onError: (event: YouTubePlayerEvent) => void;
    onAutoplayBlocked: (event: YouTubePlayerEvent) => void;
  }>;
}>;

export type YouTubeIframeApi = Readonly<{
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
}>;

type YouTubeWindow = Window &
  typeof globalThis & {
    YT?: YouTubeIframeApi;
    onYouTubeIframeAPIReady?: () => void;
  };

let loadingPromise: Promise<YouTubeIframeApi> | null = null;

function getLoadedApi(targetWindow: YouTubeWindow): YouTubeIframeApi | null {
  return typeof targetWindow.YT?.Player === "function" ? targetWindow.YT : null;
}

export function loadYouTubeIframeApi(): Promise<YouTubeIframeApi> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("The YouTube IFrame API is only available in the browser."));
  }

  const targetWindow = window as YouTubeWindow;
  const loaded = getLoadedApi(targetWindow);
  if (loaded) {
    return Promise.resolve(loaded);
  }
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = new Promise<YouTubeIframeApi>((resolve, reject) => {
    const previousReady = targetWindow.onYouTubeIframeAPIReady;
    const finish = () => {
      const api = getLoadedApi(targetWindow);
      if (!api) {
        loadingPromise = null;
        reject(new Error("The YouTube IFrame API loaded without exposing YT.Player."));
        return;
      }
      resolve(api);
    };

    targetWindow.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      finish();
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${YOUTUBE_IFRAME_API_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("error", () => {
        loadingPromise = null;
        reject(new Error("The YouTube IFrame API script could not be loaded."));
      }, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = YOUTUBE_IFRAME_API_SRC;
    script.async = true;
    script.addEventListener("error", () => {
      loadingPromise = null;
      reject(new Error("The YouTube IFrame API script could not be loaded."));
    }, { once: true });
    document.head.append(script);
  });

  return loadingPromise;
}
