import { LocalP2pError } from "../domain/errors";
import { LOCAL_P2P_INFO_HASH_PATTERN } from "../domain/constants";
import type { LocalP2pDescriptor } from "../domain/types";

export function assertBrowserP2pSupport(): void {
  if (
    typeof window === "undefined" ||
    typeof File === "undefined" ||
    typeof RTCPeerConnection === "undefined" ||
    !("serviceWorker" in navigator) ||
    !window.isSecureContext
  ) {
    throw new LocalP2pError("p2p_unsupported", "Stream from Device is not supported by this browser.");
  }
}

export function validateLocalP2pDescriptor(descriptor: LocalP2pDescriptor): void {
  if (
    !LOCAL_P2P_INFO_HASH_PATTERN.test(descriptor.infoHash) ||
    !descriptor.magnetUri.startsWith("magnet:?") ||
    descriptor.magnetUri.length > 16_384 ||
    descriptor.fileName.length < 1 ||
    descriptor.fileName.length > 255 ||
    descriptor.fileSize <= 0
  ) {
    throw new LocalP2pError("p2p_invalid_descriptor", "The local P2P source descriptor is invalid.");
  }
}

export function prepareVideoElement(element: HTMLMediaElement): void {
  if (!(element instanceof HTMLVideoElement)) return;
  element.playsInline = true;
  element.controls = false;
  element.preload = "auto";
}
