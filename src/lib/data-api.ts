/**
 * Where InfoPanel's native Data API lives. A dashboard setting (saved in the
 * config as `dataApiUrl`); this module holds the live value so the sensor
 * hook and the Wave Link client can follow it when it changes.
 */

export const DEFAULT_API_BASE = "http://127.0.0.1:3921";

/** A valid http(s) URL with trailing slashes trimmed, or null. */
export function normalizeApiBase(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return trimmed;
}

let apiBase = DEFAULT_API_BASE;
const listeners = new Set<(base: string) => void>();

export const getApiBase = (): string => apiBase;

/** Apply a new base (invalid values fall back to the default). */
export function setApiBase(raw: unknown): void {
  const next = normalizeApiBase(raw) ?? DEFAULT_API_BASE;
  if (next === apiBase) return;
  apiBase = next;
  for (const listener of listeners) listener(next);
}

export function subscribeApiBase(listener: (base: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when `{base}/api` answers 200. */
export async function testApiBase(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api`, { cache: "no-store" });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** A Data API answer slower than this reads "slow" in the status bar. */
export const SLOW_API_MS = 300;

export type DataApiState = "connected" | "slow" | "unreachable";

/** How long `{base}/api` took to answer 200 (ms), or null when it did not. */
export async function pingApiBase(base: string, now: () => number = () => performance.now()): Promise<number | null> {
  const start = now();
  return (await testApiBase(base)) ? Math.round(now() - start) : null;
}

/**
 * The status bar's word for the Data API: unreachable while a sensor stream
 * is down or the last ping failed, slow past `SLOW_API_MS`, else connected.
 * No ping yet (`undefined`) trusts the streams.
 */
export function dataApiState(streamsOpen: boolean, latencyMs: number | null | undefined): DataApiState {
  if (!streamsOpen || latencyMs === null) return "unreachable";
  return latencyMs !== undefined && latencyMs > SLOW_API_MS ? "slow" : "connected";
}
