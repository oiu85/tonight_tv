declare module "webtorrent" {
  type Listener = (...args: unknown[]) => void;
  export type WebTorrentFile = Readonly<{ name: string; path: string; length: number; type?: string; streamURL: string; streamTo: (element: HTMLMediaElement) => HTMLMediaElement }>;
  export type WebTorrentTorrent = Readonly<{ infoHash: string; magnetURI: string; name: string; files: readonly WebTorrentFile[]; numPeers: number; progress: number; downloadSpeed: number; uploadSpeed: number; downloaded: number; uploaded: number; length: number; destroyed: boolean; on: (event: string, listener: Listener) => void; once: (event: string, listener: Listener) => void }>;
  export type TorrentOptions = Readonly<{ announce?: readonly string[]; private?: boolean; dht?: boolean; lsd?: boolean; utPex?: boolean; destroyStoreOnDestroy?: boolean; name?: string }>;
  export type WebTorrentOptions = Readonly<{ tracker?: boolean | Readonly<{ announce?: readonly string[] }>; dht?: boolean; lsd?: boolean; utPex?: boolean }>;
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
