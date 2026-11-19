/**
 * The dashboard server's integrations as the studio sees them (ips-server's integrations.rs): the OBS
 * connection and the calendar links, without their secrets. A password or link is sent once and
 * never read back.
 */

export const INTEGRATIONS_URL = "/api/integrations";

/** The Streaming widgets' look for each OBS scene, by scene id. */
export type SceneLooks = Record<string, { sub: string; icon: string }>;

/**
 * Device batteries (`integrations.json`'s `peripherals`): whether the server polls the wireless
 * peripherals, how often, the level widgets draw as low, and which device keys are hidden from the
 * readings or renamed. Device keys come from `GET /api/devices/battery`.
 */
export interface PeripheralsSettings {
  /** The master switch; the poll task reads it each round, so a change needs no restart. */
  enabled: boolean;
  /** Seconds between polls: 0 = unset (60 s), and the server clamps it to 30–300. */
  intervalSec: number;
  /** The low mark in percent: 0 = unset (15 %), and the server clamps it to 1–100. */
  lowPercent: number;
  /** Device keys still polled but never shown in the readings. */
  hidden: string[];
  /** Device key → the name the readings show instead of the device's own. */
  names: Record<string, string>;
}

/** A server that predates the section, or has not written it yet: off, with the defaults. */
export const EMPTY_PERIPHERALS: PeripheralsSettings = { enabled: false, intervalSec: 0, lowPercent: 0, hidden: [], names: {} };

export interface PublicIntegrations {
  obs: { host: string; port: number; hasPassword: boolean };
  calendar: { links: { id: string; label: string; host: string }[] };
  /** Absent until a mic or a scene look is saved. */
  streaming?: { obs: { mic: string; scenes: SceneLooks }; twitch?: { channel: string; login: string }; youtube?: { clientConfigured: boolean; channel: string; chatInterval: number }; streamdeck?: { enabled: boolean } };
  /** The whole section as stored; `EMPTY_PERIPHERALS` when the server doesn't have it. */
  peripherals: PeripheralsSettings;
}

/** A change: `password` replaces it ("" clears it, absent keeps it); `links` is the full list. */
export interface IntegrationsPatch {
  obs?: { host?: string; port?: number; password?: string };
  calendar?: { links: ({ id: string; label?: string } | { url: string; label?: string })[] };
  /** `mic` "" clears it; `scenes` is the full map (a scene with no line and no icon is dropped). */
  streaming?: { obs?: { mic?: string; scenes?: SceneLooks }; twitch?: { channel?: string }; youtube?: { client_id?: string; client_secret?: string; chat_interval?: number }; streamdeck?: { enabled?: boolean } };
  /** Field-wise; `hidden` and `names` are replaced whole when present. */
  peripherals?: { enabled?: boolean; intervalSec?: number; lowPercent?: number; hidden?: string[]; names?: Record<string, string> };
}

const whole = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

/** The stored section, filled in when the server predates it or a field is missing. */
export function peripheralsOf(raw: unknown): PeripheralsSettings {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY_PERIPHERALS, hidden: [], names: {} };
  const s = raw as Record<string, unknown>;
  const names: Record<string, string> = {};
  if (typeof s.names === "object" && s.names !== null) {
    for (const [key, name] of Object.entries(s.names as Record<string, unknown>)) if (typeof name === "string") names[key] = name;
  }
  return {
    enabled: s.enabled === true,
    intervalSec: whole(s.intervalSec),
    lowPercent: whole(s.lowPercent),
    hidden: Array.isArray(s.hidden) ? s.hidden.filter((key): key is string => typeof key === "string") : [],
    names,
  };
}

/** The server's view with every section the studio reads filled in. */
async function readView(res: Response): Promise<PublicIntegrations> {
  const view = (await res.json()) as Omit<PublicIntegrations, "peripherals"> & { peripherals?: unknown };
  return { ...view, peripherals: peripheralsOf(view.peripherals) };
}

export async function fetchIntegrations(): Promise<PublicIntegrations> {
  const res = await fetch(INTEGRATIONS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`integrations load failed: ${res.status}`);
  return readView(res);
}

/** Saves a change; the server's message when it refuses one (a bad host or link). */
export async function saveIntegrations(patch: IntegrationsPatch): Promise<PublicIntegrations> {
  const res = await fetch(INTEGRATIONS_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Dashboard-Config": "1" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error((await res.text()) || `integrations save failed: ${res.status}`);
  return readView(res);
}
