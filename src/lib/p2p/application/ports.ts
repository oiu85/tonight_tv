import type WebTorrent from "webtorrent";
import type { WebTorrentFile } from "webtorrent";

import type { LocalP2pDescriptor, LocalP2pState } from "../domain/types";
import type { LocalP2pSignalTransport } from "../domain/signal";
import type { SimplePeerConstructor } from "../infrastructure/simple-peer-types";

export type LocalP2pRuntimeDependencies = Readonly<{
  loadWebTorrent?: () => Promise<typeof WebTorrent>;
  registerServiceWorker?: () => Promise<ServiceWorkerRegistration>;
  loadSimplePeer?: () => Promise<SimplePeerConstructor>;
  metricIntervalMs?: number;
}>;

export type LocalP2pRuntime = Readonly<{
  initialize: () => Promise<void>;
  seedLocalFile: (file: File) => Promise<LocalP2pDescriptor>;
  joinLocalStream: (descriptor: LocalP2pDescriptor) => Promise<WebTorrentFile>;
  attachToMediaElement: (descriptor: LocalP2pDescriptor, element: HTMLMediaElement) => Promise<void>;
  leaveLocalStream: (infoHash: string) => Promise<void>;
  hasLocalSeed: (infoHash: string) => boolean;
  setSignalTransport: (transport: LocalP2pSignalTransport | null) => void;
  getState: () => LocalP2pState;
  subscribe: (listener: (state: LocalP2pState) => void) => () => void;
  destroy: () => Promise<void>;
}>;
