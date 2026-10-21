/**
 * Help › "Run setup again": Help is its own page or window, so it asks the studio through a storage key (the
 * studio hears the `storage` event from another tab or window of the same origin, or finds the key when it opens).
 */
const KEY = "studio.runSetup";

/** Ask the studio to open the first-run setup. */
export function requestSetup(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage unavailable (private mode): the request cannot be passed on.
  }
}

/** True once when a request is waiting; it is cleared by reading it. */
export function takeSetupRequest(): boolean {
  try {
    const waiting = localStorage.getItem(KEY) !== null;
    localStorage.removeItem(KEY);
    return waiting;
  } catch {
    return false;
  }
}

/** Calls `handler` for each request made while this page is open; returns the unsubscribe. */
export function onSetupRequest(handler: () => void): () => void {
  const listen = (e: StorageEvent) => {
    if (e.key === KEY && e.newValue !== null) {
      takeSetupRequest();
      handler();
    }
  };
  window.addEventListener("storage", listen);
  return () => window.removeEventListener("storage", listen);
}
