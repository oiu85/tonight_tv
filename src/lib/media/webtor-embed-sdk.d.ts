declare module "@webtor/embed-sdk-js" {
  export type WebtorEvent = Readonly<{
    name: string;
    data?: unknown;
    player?: WebtorPlayer;
  }>;

  export type WebtorPlayer = Readonly<{
    play: () => void;
    pause: () => void;
    setPosition: (seconds: number) => void;
    open: (filePath: string) => void;
  }>;

  export type WebtorEmbedConfig = Readonly<Record<string, unknown>> & {
    el: HTMLElement;
    magnet: string;
    path?: string;
    baseUrl?: string;
    features?: Readonly<Record<string, boolean>>;
    on?: (event: WebtorEvent) => void;
  };

  export type WebtorGenerator = Readonly<{
    push: (config: WebtorEmbedConfig) => void;
    TORRENT_FETCHED: string;
    TORRENT_ERROR: string;
    INIT: string;
    INITED: string;
    PLAYER_STATUS: string;
    CURRENT_TIME: string;
    DURATION: string;
    OPEN: string;
  }>;

  const init: (queue?: unknown) => WebtorGenerator;
  export default init;
}
