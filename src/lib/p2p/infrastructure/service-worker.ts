import { LOCAL_P2P_SERVICE_WORKER_SCOPE, LOCAL_P2P_SERVICE_WORKER_URL } from "../domain/constants";
import { LocalP2pError } from "../domain/errors";

let serviceWorkerPromise: Promise<ServiceWorkerRegistration> | null = null;

function waitForActivated(registration: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  if (registration.active?.state === "activated") return Promise.resolve(registration);
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) {
    return Promise.reject(new LocalP2pError(
      "p2p_service_worker_unavailable",
      "The P2P streaming Service Worker could not be activated.",
    ));
  }
  return new Promise((resolve, reject) => {
    const onStateChange = () => {
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", onStateChange);
        resolve(registration);
      } else if (worker.state === "redundant") {
        worker.removeEventListener("statechange", onStateChange);
        reject(new LocalP2pError(
          "p2p_service_worker_unavailable",
          "The P2P streaming Service Worker became unavailable.",
        ));
      }
    };
    worker.addEventListener("statechange", onStateChange);
  });
}

function waitForController(timeoutMs = 8_000): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.reject(new LocalP2pError(
      "p2p_service_worker_unavailable",
      "This browser cannot provide the secure Service Worker required for P2P streaming.",
    ));
  }
  if (navigator.serviceWorker.controller) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      if (navigator.serviceWorker.controller) {
        resolve();
        return;
      }
      reject(new LocalP2pError(
        "p2p_service_worker_unavailable",
        "The P2P streaming Service Worker did not take control of this page.",
      ));
    }, timeoutMs);
    const onChange = () => {
      window.clearTimeout(timeoutId);
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      resolve();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
  });
}

export function registerLocalP2pServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) {
    return Promise.reject(new LocalP2pError(
      "p2p_service_worker_unavailable",
      "This browser cannot provide the secure Service Worker required for P2P streaming.",
    ));
  }
  serviceWorkerPromise ??= navigator.serviceWorker
    .register(LOCAL_P2P_SERVICE_WORKER_URL, { scope: LOCAL_P2P_SERVICE_WORKER_SCOPE })
    .then((registration) => waitForActivated(registration))
    .then(async (registration) => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await waitForController().catch(() => undefined);
      }
      return registration;
    })
    .catch((cause) => {
      serviceWorkerPromise = null;
      throw cause instanceof LocalP2pError
        ? cause
        : new LocalP2pError(
          "p2p_service_worker_unavailable",
          "The P2P streaming Service Worker could not be registered.",
          { cause },
        );
    });
  return serviceWorkerPromise;
}

export function resetLocalP2pServiceWorkerRegistration(): void {
  serviceWorkerPromise = null;
}
