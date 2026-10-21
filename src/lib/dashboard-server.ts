import { CanvasRejectedError, inlineCanvases, liftCanvases } from "@/lib/canvas-store";
import type { DashboardConfig } from "@/lib/layout";
import type { SettingsPatch } from "@/lib/settings-patch";

/**
 * Endpoints of the dashboard's own server (server.mjs), which serves this
 * page — so they are same-origin paths. `npm run dev` proxies them to the
 * running server (vite.config.ts). Sensor data comes from InfoPanel's
 * Data API instead (see lib/data-api).
 */
export const CONFIG_URL = "/api/config";
export const CONFIG_EVENTS_URL = "/events/config";
/** The Settings window's instant writes (server/config-settings.mjs). */
export const CONFIG_SETTINGS_URL = "/api/config/settings";
export const IMAGE_PROXY_URL = "/api/image-proxy";

/** The port the server listens on until the app settings say otherwise (server.mjs and src-tauri/src/settings.rs use the same), and the kiosk page on it. */
export const DEFAULT_SERVER_PORT = 3922;
export const DEFAULT_KIOSK_URL = `http://127.0.0.1:${DEFAULT_SERVER_PORT}/?kiosk=1`;

/**
 * The config saved on the server, its canvas zones' canvases loaded from the
 * canvas store (lib/canvas-store; one that can't be loaded keeps its ref), or
 * null when nothing is saved yet.
 * Throws when the server can't be reached or answers with an error.
 */
export async function fetchConfig(): Promise<Partial<DashboardConfig> | null> {
  const res = await fetch(CONFIG_URL, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`config load failed: ${res.status}`);
  const parsed = (await res.json()) as Partial<DashboardConfig> | null;
  return parsed && Array.isArray(parsed.profiles) ? inlineCanvases(parsed) : null;
}

/** The server holds a config saved by a newer dashboard version and refused this one (409). */
export class NewerConfigError extends Error {
  constructor() {
    super("a newer dashboard version saved this config; reload");
  }
}

/** The server answered a save with an error status (it was reached); `reason` is its message. */
export class ConfigRejectedError extends Error {
  readonly status: number;

  constructor(status: number, reason = "") {
    super(`config save failed: ${status}${reason ? ` (${reason})` : ""}`);
    this.status = status;
  }
}

/** A failed push means the server could not be reached (a network error), not that it answered with a refusal. */
export function isUnreachable(err: unknown): boolean {
  return !(err instanceof NewerConfigError) && !(err instanceof ConfigRejectedError);
}

/** The push in flight: pushes run one after another, so a slow canvas save can't land an older config last. */
let pushing: Promise<unknown> = Promise.resolve();

/**
 * Save the config on the server, where every kiosk page reads it: its
 * canvases go to the canvas store first, the config then holds their refs.
 */
export function pushConfig(config: DashboardConfig): Promise<void> {
  const run = pushing.then(async () => {
    const lifted = await liftCanvases(config).catch((err: unknown) => {
      // A refused canvas is a refused save, not an unreachable server.
      throw err instanceof CanvasRejectedError ? new ConfigRejectedError(err.status, err.message) : err;
    });
    const res = await fetch(CONFIG_URL, {
      method: "POST",
      // The custom header makes a cross-site POST preflight (see server.mjs).
      headers: { "Content-Type": "application/json", "X-Dashboard-Config": "1" },
      body: JSON.stringify(lifted),
    });
    if (res.status === 409) throw new NewerConfigError();
    // 422: a canvasRef names no file in the canvas store (server.mjs).
    if (!res.ok) throw new ConfigRejectedError(res.status, (await res.text().catch(() => "")).slice(0, 200));
  });
  pushing = run.catch(() => {});
  return run;
}

/**
 * Merge a Settings change into the config saved on the server (PLAN decision 22): kiosks pull it at once, and the
 * rest of the saved config stays as it is. Throws `ConfigRejectedError` on a refusal, anything else when unreachable.
 */
export async function patchSettings(patch: SettingsPatch): Promise<void> {
  const res = await fetch(CONFIG_SETTINGS_URL, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Dashboard-Config": "1" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new ConfigRejectedError(res.status, (await res.text().catch(() => "")).slice(0, 200));
}
