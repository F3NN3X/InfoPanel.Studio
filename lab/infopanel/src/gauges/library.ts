/**
 * The gauge library (L7): gauges saved to reuse in any profile, either a
 * vector spec or an imported gauge's frames (stored once each, by SHA-256).
 * The lab dev server keeps it in `lab/infopanel/gauges/` (gauge-library-plugin.ts);
 * every entry is checked here on both sides.
 */
import { normalizeGauge, type VectorGauge } from "../../../../src/lib/infopanel/gauges/vector.ts";

export interface LibraryFrame {
  /** SHA-256 of the file, hex: its name in the store. */
  hash: string;
  /** File name to give the asset when the gauge is used. */
  name: string;
}

export interface LibraryEntry {
  id: string;
  name: string;
  /** The profile it came from. */
  source?: string;
  created: string;
  kind: "vector" | "frames";
  vector?: VectorGauge;
  frames?: LibraryFrame[];
  /** The gauge's range and animation when it was saved. */
  min: number;
  max: number;
  animationSpeed: number;
}

export const ID = /^[a-z0-9-]{1,64}$/;
export const HASH = /^[0-9a-f]{64}$/;
export const MAX_FRAMES = 1000;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").slice(0, max) : "");
const num = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);
/** A plain file name: no folders, no leading dots. */
const fileName = (v: unknown) => text(v, 120).replace(/^.*[\\/]/, "").replace(/^\.+/, "");

/** An entry from untrusted JSON, or null when it is not one. */
export function parseEntry(raw: unknown): LibraryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && ID.test(o.id) ? o.id : null;
  const name = text(o.name, 120).trim();
  if (!id || !name) return null;
  const base = {
    id,
    name,
    ...(text(o.source, 200) ? { source: text(o.source, 200) } : {}),
    created: text(o.created, 40) || new Date(0).toISOString(),
    min: num(o.min, 0),
    max: num(o.max, 100),
    animationSpeed: Math.max(0, num(o.animationSpeed, 0)),
  };
  if (o.kind === "vector") return { ...base, kind: "vector", vector: normalizeGauge(o.vector) };
  if (o.kind !== "frames" || !Array.isArray(o.frames) || o.frames.length === 0 || o.frames.length > MAX_FRAMES) return null;
  const frames: LibraryFrame[] = [];
  for (const f of o.frames) {
    const fo = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
    const hash = typeof fo.hash === "string" && HASH.test(fo.hash) ? fo.hash : null;
    const fname = fileName(fo.name);
    if (!hash || !fname) return null;
    frames.push({ hash, name: fname });
  }
  return { ...base, kind: "frames", frames };
}

/** What makes two entries the same gauge: its frames, or its spec. */
export const entrySignature = (e: Pick<LibraryEntry, "kind" | "vector" | "frames">) =>
  e.kind === "vector" ? `v:${JSON.stringify(e.vector)}` : `f:${(e.frames ?? []).map((f) => f.hash).join(",")}`;

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/* ---- client ---- */

export async function fetchLibrary(): Promise<LibraryEntry[]> {
  const r = await fetch("/gauges/index.json");
  if (!r.ok) throw new Error(`gauge library: HTTP ${r.status}`);
  const list: unknown = await r.json();
  return Array.isArray(list) ? list.flatMap((e) => parseEntry(e) ?? []) : [];
}

export async function fetchFrame(hash: string): Promise<Uint8Array> {
  const r = await fetch(`/gauges/frames/${hash}`);
  if (!r.ok) throw new Error(`frame ${hash.slice(0, 8)}: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Stores the frames the library lacks, then the entry. */
export async function saveEntry(entry: LibraryEntry, bytes: ReadonlyMap<string, Uint8Array>): Promise<void> {
  const hashes = [...new Set((entry.frames ?? []).map((f) => f.hash))];
  const ask = await fetch("/gauges/missing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(hashes) });
  if (!ask.ok) throw new Error(`gauge library: ${await ask.text()}`);
  for (const hash of (await ask.json()) as string[]) {
    const data = bytes.get(hash);
    if (!data) throw new Error(`frame ${hash.slice(0, 8)} has no bytes`);
    const put = await fetch(`/gauges/frames/${hash}`, { method: "PUT", body: data.slice() });
    if (!put.ok) throw new Error(`frame ${hash.slice(0, 8)}: ${await put.text()}`);
  }
  const r = await fetch(`/gauges/entries/${entry.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
  if (!r.ok) throw new Error(`save ${entry.name}: ${await r.text()}`);
}

export async function deleteEntry(id: string): Promise<void> {
  const r = await fetch(`/gauges/entries/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`delete: HTTP ${r.status}`);
}
