// A pack's trust as the server works it out (pack signatures: src-tauri/crates/ips-server/src/pack_trust.rs), and what the studio
// shows for it. The server is the only judge: it hashes the pack's files on every read and checks the publisher's signature and
// Themely's countersignature against keys this app holds. Nothing here decides anything; it reads the answer and words it.
// "Verified" means Themely ran its checks and a person reviewed these exact files. It never means safe: a pack's script is
// contained by the sandbox, not by a badge.

/** The states: `builtin` is the app's own packs (never asked of the server), the rest are the server's word. */
export type TrustState = "builtin" | "verified" | "signed" | "unverified" | "modified" | "revoked";

/** What the list (`GET /api/packs`) and the import say of a pack. */
export interface PackTrust {
  state: TrustState;
  /** Who signed it: the name of the key the user added (Signed), or of that key when a verified pack's publisher is one. */
  publisher?: string;
  /** Why it is refused (Modified, Revoked), or why a signature could not be checked. */
  reason?: string;
}

/** `GET /api/packs/<id>/trust`: the trust, and what it means for the pack's script (the contract with the sandbox). */
export interface PackScriptTrust extends PackTrust {
  hasScript: boolean;
  consent: "none" | "granted" | "denied";
  scriptRuns: boolean;
  scriptSha256?: string;
}

const STATES: readonly TrustState[] = ["builtin", "verified", "signed", "unverified", "modified", "revoked"];

/** The server's word, or undefined for anything else (an old server says nothing: the pack reads as unverified where it is shown). */
export function parseTrust(value: unknown): PackTrust | undefined {
  const v = value as { state?: unknown; publisher?: unknown; reason?: unknown } | null | undefined;
  if (!v || typeof v !== "object" || !STATES.includes(v.state as TrustState)) return undefined;
  const text = (x: unknown) => (typeof x === "string" && x ? x.slice(0, 200) : undefined);
  return { state: v.state as TrustState, ...(text(v.publisher) ? { publisher: text(v.publisher) } : null), ...(text(v.reason) ? { reason: text(v.reason) } : null) };
}

/** Whether a pack in this state is refused: not worn, its files not served. */
export const isRefused = (t: PackTrust | undefined): boolean => t?.state === "modified" || t?.state === "revoked";

export type TrustTone = "ok" | "warn" | "danger" | "neutral";

/** A badge: its words and its tone. */
export interface TrustBadge {
  label: string;
  tone: TrustTone;
}

/** The badge a pack wears in the pack list, the look gallery and the import dialog. */
export function trustBadge(t: PackTrust): TrustBadge {
  switch (t.state) {
    case "builtin":
      return { label: "Built-in", tone: "neutral" };
    case "verified":
      return { label: "Verified by Themely", tone: "ok" };
    case "signed":
      return { label: `Signed by ${t.publisher ?? "a key you added"}, not reviewed`, tone: "neutral" };
    case "unverified":
      return { label: "Unverified", tone: "warn" };
    case "modified":
      return { label: "Changed since it was signed", tone: "danger" };
    case "revoked":
      return { label: `Withdrawn: ${t.reason ?? "no reason given"}`, tone: "danger" };
  }
}

/** What the badge means, in a sentence: shown beside it in the detail pane and the import dialog. */
export function trustMeaning(t: PackTrust): string {
  switch (t.state) {
    case "builtin":
      return "Comes with InfoPanel Studio.";
    case "verified":
      return "Themely ran its automated checks on this pack and a person reviewed these exact files. It does not make a pack safe: any effect script it has is kept in a sandbox with no access to your data.";
    case "signed":
      return "Signed with a key you added in Settings › Widget publishers. Nobody reviewed it; the key only shows who made these files.";
    case "unverified":
      return "Nobody has checked who made this pack. Its looks are checked every time it loads; an effect script it has runs only if you allow it.";
    case "modified":
      return `Its files are not the ones that were signed${t.reason ? ` (${t.reason})` : ""}, so it is not used. Import the publisher's copy again.`;
    case "revoked":
      return "Its publisher or Themely withdrew it, so it is not used. Its files are kept until you remove it.";
  }
}

/** `GET /api/packs/<id>/trust`, or undefined when the server has no such pack or does not answer. */
export async function readPackTrust(id: string): Promise<PackScriptTrust | undefined> {
  try {
    const res = await fetch(`/api/packs/${encodeURIComponent(id)}/trust`, { cache: "no-store" });
    const body: unknown = res.ok ? await res.json() : undefined;
    const trust = parseTrust(body);
    const b = body as Partial<PackScriptTrust> | undefined;
    if (!trust || !b) return undefined;
    const consent = b.consent === "granted" || b.consent === "denied" ? b.consent : "none";
    return { ...trust, hasScript: b.hasScript === true, consent, scriptRuns: b.scriptRuns === true, ...(typeof b.scriptSha256 === "string" ? { scriptSha256: b.scriptSha256 } : null) };
  } catch {
    return undefined;
  }
}

/** The server's pack-script switches (`/api/pack-scripts`): the studio's (`on`), PACK_SCRIPTS (`env`) and the revoke list's state. */
export interface ScriptSwitch {
  on: boolean;
  env: boolean;
  fetching: boolean;
  stale: boolean;
}

const SWITCH = "/api/pack-scripts";

const switchOf = (v: Partial<ScriptSwitch> | undefined): ScriptSwitch | undefined =>
  v && typeof v.on === "boolean" ? { on: v.on, env: v.env !== false, fetching: v.fetching === true, stale: v.stale === true } : undefined;

/** The switches, or undefined when the server does not have them. */
export async function readScriptSwitch(): Promise<ScriptSwitch | undefined> {
  try {
    const res = await fetch(SWITCH, { cache: "no-store" });
    return res.ok ? switchOf(await res.json()) : undefined;
  } catch {
    return undefined;
  }
}

/** Sets the studio's switch on the server (every kiosk obeys it); the switches after, or an error's words. */
export async function setScriptSwitch(on: boolean): Promise<ScriptSwitch | string> {
  try {
    const res = await fetch(SWITCH, { method: "PUT", headers: { "Content-Type": "application/json", "X-Dashboard-Pack": "1" }, body: JSON.stringify({ on }) });
    if (!res.ok) return (await res.text()) || `the server refused (${res.status})`;
    return switchOf(await res.json()) ?? "the server's answer was not understood";
  } catch (e) {
    return (e as Error).message;
  }
}
