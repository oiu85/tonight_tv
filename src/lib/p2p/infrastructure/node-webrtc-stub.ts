type WebRtcCtor = new (...args: never[]) => object;

const EmptyWebRtc = class {};

function browserWebRtc(name: "RTCPeerConnection" | "RTCSessionDescription" | "RTCIceCandidate"): WebRtcCtor {
  const value = (globalThis as Record<string, unknown>)[name];
  return typeof value === "function" ? (value as WebRtcCtor) : EmptyWebRtc;
}

export const RTCPeerConnection = browserWebRtc("RTCPeerConnection");
export const RTCSessionDescription = browserWebRtc("RTCSessionDescription");
export const RTCIceCandidate = browserWebRtc("RTCIceCandidate");

const nodeWebRtcStub = {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
};

export default nodeWebRtcStub;
export const PeerConnection = RTCPeerConnection;
export const RtcConfig = {};
export const initLogger = () => undefined;
