declare module "webtorrent" {
  type Listener = (...args: unknown[]) => void;
  export type WebTorrentFile = Readonly<{
    name: string;
    path: string;
    length: number;
    type?: string;
    streamURL: string;
    select: (priority?: number) => void;
    streamTo: (element: HTMLMediaElement) => HTMLMediaElement;
  }>;
  export type WebTorrentTorrent = Readonly<{
    infoHash: string;
    magnetURI: string;
    name: string;
    files: readonly WebTorrentFile[];
    numPeers: number;
    progress: number;
    downloadSpeed: number;
    uploadSpeed: number;
    downloaded: number;
    uploaded: number;
    length: number;
    destroyed: boolean;
    addPeer: (peer: unknown, source?: string) => boolean;
    on: (event: string, listener: Listener) => void;
    once: (event: string, listener: Listener) => void;
  }>;
  export type TorrentOptions = Readonly<{
    announce?: readonly string[];
    private?: boolean;
    dht?: boolean;
    lsd?: boolean;
    utPex?: boolean;
    destroyStoreOnDestroy?: boolean;
    name?: string;
  }>;
  export type WebTorrentOptions = Readonly<{
    tracker?: boolean | Readonly<{
      announce?: readonly string[];
      rtcConfig?: RTCConfiguration;
    }>;
    dht?: boolean;
    lsd?: boolean;
    utPex?: boolean;
  }>;
  export default class WebTorrent {
    constructor(options?: WebTorrentOptions);
    readonly destroyed: boolean;
    createServer(options: { controller: ServiceWorkerRegistration }): unknown;
    seed(input: File | Blob, options: TorrentOptions, onseed: (torrent: WebTorrentTorrent) => void): WebTorrentTorrent;
    add(torrentId: string, options: TorrentOptions, ontorrent: (torrent: WebTorrentTorrent) => void): WebTorrentTorrent;
    remove(torrentId: string | WebTorrentTorrent, options: { destroyStore?: boolean }, callback: (error?: Error | null) => void): void;
    destroy(callback: (error?: Error | null) => void): void;
  }
}

declare module "webtorrent/dist/webtorrent.min.js" {
  import WebTorrent from "webtorrent";
  export default WebTorrent;
}

declare module "@thaunknown/simple-peer/lite.js" {
  export default class SimplePeer {
    id?: string;
    readonly connected: boolean;
    readonly destroyed: boolean;
    constructor(options?: Readonly<{
      initiator?: boolean;
      trickle?: boolean;
      config?: RTCConfiguration;
    }>);
    signal(data: unknown): void;
    destroy(): void;
    on(event: "signal", listener: (data: unknown) => void): this;
    on(event: "connect" | "close", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }
}
