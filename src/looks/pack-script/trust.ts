// The server's word on a pack's script (the contract with the trust layer, `crates/ips-server`): `GET /api/packs/<id>/trust` says
// what the pack is and whether its script runs, `PUT /api/packs/<id>/script-consent` records the user's answer for an unverified
// pack (bound to its manifest hash, so an update asks again), and `GET /api/packs/<id>/fx.js` serves the script only while it runs.
// Anything that is not exactly that shape is read as "no script": the client never runs a script the server did not vouch for.
import { SCRIPT_MAX_BYTES } from "./limits";

export const TRUST_STATES = ["builtin", "verified", "signed", "unverified", "modified", "revoked"] as const;
export type TrustState = (typeof TRUST_STATES)[number];
export type Consent = "none" | "granted" | "denied";

export interface PackTrust {
  state: TrustState;
  publisher?: string;
  reason?: string;
  hasScript: boolean;
  consent: Consent;
  scriptRuns: boolean;
}

const ROUTE = "/api/packs";
/** The route's id pattern (`USER_PACK_ID`, user-packs.ts; kept here so this chunk does not bring the validator along). */
const USER_PACK_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
/** The header the pack writes carry (`POST /api/packs`, `/sign`): the server's request guard reads it. */
const WRITE = { "Content-Type": "application/json", "X-Dashboard-Pack": "1" };
const text = (v: unknown, max = 120): string | undefined => (typeof v === "string" && v.length <= max && !/[\p{C}<>]/u.test(v) ? v : undefined);

/** A trust answer read strictly; undefined for anything else. */
export function trustOf(raw: unknown): PackTrust | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const t = raw as Record<string, unknown>;
  if (!(TRUST_STATES as readonly unknown[]).includes(t.state) || typeof t.hasScript !== "boolean" || typeof t.scriptRuns !== "boolean" || !["none", "granted", "denied"].includes(t.consent as string)) return undefined;
  const publisher = text(t.publisher);
  const reason = text(t.reason, 240);
  return { state: t.state as TrustState, hasScript: t.hasScript, consent: t.consent as Consent, scriptRuns: t.scriptRuns && t.hasScript, ...(publisher ? { publisher } : null), ...(reason ? { reason } : null) };
}

/** Whether the studio asks the user before this pack's script runs: an unverified pack with a script nobody has answered for. */
export const asksConsent = (t: PackTrust | undefined): boolean => !!t && t.state === "unverified" && t.hasScript && t.consent === "none";

/** The pack's trust, or undefined (an unknown id, a server without the route, an answer out of shape). */
export async function readTrust(id: string): Promise<PackTrust | undefined> {
  if (!USER_PACK_ID.test(id)) return undefined;
  try {
    const res = await fetch(`${ROUTE}/${id}/trust`, { cache: "no-store" });
    return res.ok ? trustOf(await res.json()) : undefined;
  } catch {
    return undefined;
  }
}

/** Records the user's answer for this pack's script; whether the server took it. */
export async function giveConsent(id: string, granted: boolean): Promise<boolean> {
  if (!USER_PACK_ID.test(id)) return false;
  try {
    return (await fetch(`${ROUTE}/${id}/script-consent`, { method: "PUT", headers: WRITE, body: JSON.stringify({ granted }) })).ok;
  } catch {
    return false;
  }
}

/** The script's text, or undefined: anything but a 200 as JavaScript, within `SCRIPT_MAX_BYTES` and valid UTF-8. */
export async function readScript(id: string): Promise<string | undefined> {
  if (!USER_PACK_ID.test(id)) return undefined;
  try {
    const res = await fetch(`${ROUTE}/${id}/fx.js`, { cache: "no-store" });
    if (!res.ok || !/^text\/javascript\b/.test(res.headers.get("Content-Type") ?? "")) return undefined;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > SCRIPT_MAX_BYTES) return undefined;
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}
