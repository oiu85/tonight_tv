import path from "node:path";
import type { NextConfig } from "next";

const nodeWebRtcStub = "./src/lib/p2p/infrastructure/node-webrtc-stub.ts";
const nodeWebRtcStubAbsolute = path.join(process.cwd(), "src/lib/p2p/infrastructure/node-webrtc-stub.ts");

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  serverExternalPackages: ["node-datachannel", "webrtc-polyfill"],
  turbopack: {
    resolveAlias: {
      "node-datachannel": nodeWebRtcStub,
      "node-datachannel/dist/esm/lib/node-datachannel.mjs": nodeWebRtcStub,
      "node-datachannel/dist/esm/lib/index.mjs": nodeWebRtcStub,
      "webrtc-polyfill": nodeWebRtcStub,
      "webrtc-polyfill/lib/RTCPeerConnection.js": nodeWebRtcStub,
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "node-datachannel": nodeWebRtcStubAbsolute,
      "webrtc-polyfill": nodeWebRtcStubAbsolute,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/webtorrent/sw.min.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
