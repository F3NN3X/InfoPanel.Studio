import type { DashboardConfig } from "@/lib/layout";

/**
 * Endpoints of the dashboard's own server (server.mjs), which serves this
 * page — so they are same-origin paths. `npm run dev` proxies them to the
 * running server (vite.config.ts). Sensor data comes from InfoPanel's
 * Data API instead (see lib/data-api).
 */
export const CONFIG_URL = "/api/config";
export const CONFIG_EVENTS_URL = "/events/config";
export const IMAGE_PROXY_URL = "/api/image-proxy";

/**
 * The config saved on the server, or null when nothing is saved yet.
 * Throws when the server can't be reached or answers with an error.
 */
export async function fetchConfig(): Promise<Partial<DashboardConfig> | null> {
  const res = await fetch(CONFIG_URL, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`config load failed: ${res.status}`);
  const parsed = (await res.json()) as Partial<DashboardConfig> | null;
  return parsed && Array.isArray(parsed.profiles) ? parsed : null;
}

/** The server holds a config saved by a newer dashboard version and refused this one (409). */
export class NewerConfigError extends Error {
  constructor() {
    super("a newer dashboard version saved this config; reload");
  }
}

/** The server answered a save with an error status (it was reached). */
export class ConfigRejectedError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`config save failed: ${status}`);
    this.status = status;
  }
}

/** A failed push means the server could not be reached (a network error), not that it answered with a refusal. */
export function isUnreachable(err: unknown): boolean {
  return !(err instanceof NewerConfigError) && !(err instanceof ConfigRejectedError);
}

/** Save the config on the server, where every kiosk page reads it. */
export async function pushConfig(config: DashboardConfig): Promise<void> {
  const res = await fetch(CONFIG_URL, {
    method: "POST",
    // The custom header makes a cross-site POST preflight (see server.mjs).
    headers: { "Content-Type": "application/json", "X-Dashboard-Config": "1" },
    body: JSON.stringify(config),
  });
  if (res.status === 409) throw new NewerConfigError();
  if (!res.ok) throw new ConfigRejectedError(res.status);
}
