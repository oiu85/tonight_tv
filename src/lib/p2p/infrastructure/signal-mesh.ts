import type SimplePeer from "@thaunknown/simple-peer/lite.js";
import type { WebTorrentTorrent } from "webtorrent";

import {
  LOCAL_P2P_HELLO_INTERVAL_MS,
  LOCAL_P2P_HELLO_KEEPALIVE_MS,
} from "../domain/constants";
import { LOCAL_P2P_RTC_CONFIG } from "../domain/ice";
import {
  shouldInitiateSignal,
  signalPeerKey,
  type LocalP2pSignalMessage,
  type LocalP2pSignalRole,
  type LocalP2pSignalTransport,
} from "../domain/signal";

type SimplePeerConstructor = typeof SimplePeer;

export type SignalMeshDependencies = Readonly<{
  loadSimplePeer: () => Promise<SimplePeerConstructor>;
  rtcConfig?: RTCConfiguration;
}>;

export type SignalMesh = Readonly<{
  setTransport: (transport: LocalP2pSignalTransport | null) => void;
  bind: (infoHash: string, torrent: WebTorrentTorrent, role: LocalP2pSignalRole) => void;
  unbind: (infoHash: string) => void;
  connectedPeerCount: (infoHash: string) => number;
  destroy: () => void;
}>;

const PENDING_HELLO_LIMIT = 32;

export function createSignalMesh(dependencies: SignalMeshDependencies): SignalMesh {
  const rtcConfig = dependencies.rtcConfig ?? LOCAL_P2P_RTC_CONFIG;
  const torrents = new Map<string, WebTorrentTorrent>();
  const roles = new Map<string, LocalP2pSignalRole>();
  const peers = new Map<string, SimplePeer>();
  const connected = new Set<string>();
  const creating = new Set<string>();
  const helloTimers = new Map<string, ReturnType<typeof setInterval>>();
  const pendingHellos = new Map<string, LocalP2pSignalMessage[]>();
  let transport: LocalP2pSignalTransport | null = null;
  let unsubscribe: (() => void) | null = null;
  let destroyed = false;

  function send(message: LocalP2pSignalMessage): void {
    void Promise.resolve(transport?.send(message)).catch(() => undefined);
  }

  function currentRole(infoHash: string): LocalP2pSignalRole {
    return roles.get(infoHash) ?? "leech";
  }

  function destroyPeer(key: string): void {
    const peer = peers.get(key);
    connected.delete(key);
    if (!peer) return;
    peers.delete(key);
    try {
      peer.destroy();
    } catch {
      // already closed
    }
  }

  function clearHello(infoHash: string): void {
    const timer = helloTimers.get(infoHash);
    if (timer !== undefined) clearInterval(timer);
    helloTimers.delete(infoHash);
  }

  function startHello(infoHash: string): void {
    if (!transport || destroyed || !torrents.has(infoHash)) return;
    const hello = () => {
      if (!transport || destroyed || !torrents.has(infoHash)) return;
      send({
        kind: "hello",
        infoHash,
        from: transport.sessionId,
        to: null,
        role: currentRole(infoHash),
      });
    };
    hello();
    if (helloTimers.has(infoHash)) return;
    const intervalMs = [...connected].some((key) => key.startsWith(`${infoHash}:`))
      ? LOCAL_P2P_HELLO_KEEPALIVE_MS
      : LOCAL_P2P_HELLO_INTERVAL_MS;
    helloTimers.set(infoHash, setInterval(hello, intervalMs));
  }

  function refreshHello(infoHash: string): void {
    clearHello(infoHash);
    startHello(infoHash);
  }

  function queueHello(message: LocalP2pSignalMessage): void {
    const queued = pendingHellos.get(message.infoHash) ?? [];
    if (queued.some((item) => item.from === message.from)) return;
    const next = [...queued, message].slice(-PENDING_HELLO_LIMIT);
    pendingHellos.set(message.infoHash, next);
  }

  async function ensurePeer(infoHash: string, remoteSessionId: string): Promise<void> {
    const torrent = torrents.get(infoHash);
    const activeTransport = transport;
    if (
      destroyed ||
      !torrent ||
      torrent.destroyed ||
      !activeTransport ||
      remoteSessionId === activeTransport.sessionId
    ) {
      return;
    }
    const key = signalPeerKey(infoHash, remoteSessionId);
    if (peers.has(key) || creating.has(key)) return;
    creating.add(key);
    try {
      const Peer = await dependencies.loadSimplePeer();
      if (destroyed || !torrents.has(infoHash) || peers.has(key) || !transport) return;
      const initiator = shouldInitiateSignal(activeTransport.sessionId, remoteSessionId);
      const peer = new Peer({
        initiator,
        trickle: true,
        config: rtcConfig,
      });
      peer.id = remoteSessionId;
      peers.set(key, peer);
      peer.on("signal", (data) => {
        send({
          kind: "signal",
          infoHash,
          from: activeTransport.sessionId,
          to: remoteSessionId,
          role: currentRole(infoHash),
          data,
        });
      });
      peer.on("connect", () => {
        connected.add(key);
        refreshHello(infoHash);
      });
      peer.on("close", () => {
        destroyPeer(key);
        refreshHello(infoHash);
      });
      peer.on("error", () => {
        destroyPeer(key);
        refreshHello(infoHash);
      });
      try {
        torrent.addPeer(peer);
      } catch {
        destroyPeer(key);
      }
    } finally {
      creating.delete(key);
    }
  }

  async function handleSignal(message: LocalP2pSignalMessage): Promise<void> {
    const activeTransport = transport;
    if (!activeTransport || message.from === activeTransport.sessionId) return;
    if (message.to && message.to !== activeTransport.sessionId) return;
    if (!torrents.has(message.infoHash)) {
      if (message.kind === "hello") queueHello(message);
      return;
    }
    if (message.kind === "hello") {
      await ensurePeer(message.infoHash, message.from);
      return;
    }
    const key = signalPeerKey(message.infoHash, message.from);
    if (!peers.has(key)) {
      await ensurePeer(message.infoHash, message.from);
    }
    const peer = peers.get(key);
    if (!peer || message.data == null) return;
    try {
      peer.signal(message.data);
    } catch {
      destroyPeer(key);
      refreshHello(message.infoHash);
    }
  }

  function setTransport(next: LocalP2pSignalTransport | null): void {
    unsubscribe?.();
    unsubscribe = null;
    transport = next;
    if (!next) return;
    unsubscribe = next.subscribe((message) => {
      void handleSignal(message);
    });
    for (const infoHash of torrents.keys()) startHello(infoHash);
  }

  function bind(infoHash: string, torrent: WebTorrentTorrent, role: LocalP2pSignalRole): void {
    torrents.set(infoHash, torrent);
    roles.set(infoHash, role);
    startHello(infoHash);
    const queued = pendingHellos.get(infoHash) ?? [];
    pendingHellos.delete(infoHash);
    for (const hello of queued) {
      void ensurePeer(infoHash, hello.from);
    }
  }

  function unbind(infoHash: string): void {
    clearHello(infoHash);
    pendingHellos.delete(infoHash);
    torrents.delete(infoHash);
    roles.delete(infoHash);
    for (const key of [...peers.keys()]) {
      if (key.startsWith(`${infoHash}:`)) destroyPeer(key);
    }
  }

  function connectedPeerCount(infoHash: string): number {
    let count = 0;
    for (const key of connected) {
      if (key.startsWith(`${infoHash}:`)) count += 1;
    }
    return count;
  }

  function destroy(): void {
    destroyed = true;
    unsubscribe?.();
    unsubscribe = null;
    transport = null;
    for (const infoHash of [...torrents.keys()]) unbind(infoHash);
    pendingHellos.clear();
  }

  return Object.freeze({
    setTransport,
    bind,
    unbind,
    connectedPeerCount,
    destroy,
  });
}
