import { prepareVideoElement } from "./browser-guard";

export type BlobPlaybackRegistry = Readonly<{
  attach: (file: File, element: HTMLMediaElement) => void;
  detach: (element: HTMLMediaElement) => void;
  detachAll: () => void;
}>;

export function createBlobPlaybackRegistry(): BlobPlaybackRegistry {
  const urls = new Map<HTMLMediaElement, string>();

  function detach(element: HTMLMediaElement): void {
    const url = urls.get(element);
    if (!url) return;
    urls.delete(element);
    if (element.src === url || element.currentSrc === url) {
      element.removeAttribute("src");
    }
    URL.revokeObjectURL(url);
  }

  function attach(file: File, element: HTMLMediaElement): void {
    detach(element);
    prepareVideoElement(element);
    const url = URL.createObjectURL(file);
    urls.set(element, url);
    element.src = url;
  }

  function detachAll(): void {
    for (const element of [...urls.keys()]) detach(element);
  }

  return Object.freeze({ attach, detach, detachAll });
}
