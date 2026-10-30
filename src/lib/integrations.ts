/**
 * The dashboard server's integrations as the studio sees them (ips-server's integrations.rs): the OBS
 * connection and the calendar links, without their secrets. A password or link is sent once and
 * never read back.
 */

export const INTEGRATIONS_URL = "/api/integrations";

/** The Streaming widgets' look for each OBS scene, by scene id. */
export type SceneLooks = Record<string, { sub: string; icon: string }>;

export interface PublicIntegrations {
  obs: { host: string; port: number; hasPassword: boolean };
  calendar: { links: { id: string; label: string; host: string }[] };
  /** Absent until a mic or a scene look is saved. */
  streaming?: { obs: { mic: string; scenes: SceneLooks }; twitch?: { channel: string; login: string } };
}

/** A change: `password` replaces it ("" clears it, absent keeps it); `links` is the full list. */
export interface IntegrationsPatch {
  obs?: { host?: string; port?: number; password?: string };
  calendar?: { links: ({ id: string; label?: string } | { url: string; label?: string })[] };
  /** `mic` "" clears it; `scenes` is the full map (a scene with no line and no icon is dropped). */
  streaming?: { obs?: { mic?: string; scenes?: SceneLooks }; twitch?: { channel?: string } };
}

export async function fetchIntegrations(): Promise<PublicIntegrations> {
  const res = await fetch(INTEGRATIONS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`integrations load failed: ${res.status}`);
  return (await res.json()) as PublicIntegrations;
}

/** Saves a change; the server's message when it refuses one (a bad host or link). */
export async function saveIntegrations(patch: IntegrationsPatch): Promise<PublicIntegrations> {
  const res = await fetch(INTEGRATIONS_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Dashboard-Config": "1" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error((await res.text()) || `integrations save failed: ${res.status}`);
  return (await res.json()) as PublicIntegrations;
}
