/**
 * The stored form with its files, as one zip the lab saves and reopens (L8):
 * `canvas.json`, `assets/<sha256>` and `fonts/<sha256>`. The app keeps the
 * same parts in its config and asset store; the zip only stands in for them.
 */
import { assetFile, tableOf, type AssetTable } from "../assets/assets.ts";
import type { ParsedExport } from "../archive.ts";
import { listEntries, readEntry, writeZip } from "../zip.ts";
import { assetsFrom, overridesFrom, readStored, type ReadStored, type StoredCanvas } from "./stored.ts";

const MAX_ENTRY = 64 * 1024 * 1024;
const enc = new TextEncoder();

export function bundle(stored: StoredCanvas, assets: AssetTable, fonts: ReadonlyMap<string, Uint8Array>): Uint8Array {
  // The screenshot kept for Compare is not bundled, so its id must not travel: it would point at nothing.
  const { screenshot: _screenshot, ...portable } = stored;
  const files = new Map<string, Uint8Array>([["canvas.json", enc.encode(JSON.stringify(portable, null, 1))]]);
  for (const f of assets.values()) files.set(`assets/${f.hash}`, f.bytes);
  for (const [hash, bytes] of fonts) files.set(`fonts/${hash}`, bytes);
  return writeZip([...files].map(([name, data]) => ({ name, data })));
}

export interface Opened {
  parsed: ParsedExport;
  assets: AssetTable;
  read: ReadStored;
  /** The user's remap choices. */
  overrides: Map<string, string>;
  /** Supplied font files, by hash. */
  fonts: Map<string, Uint8Array>;
  /** Assets the stored form names but the zip lacks, and files whose bytes do not match their name. */
  missing: string[];
}

/** Reads a saved bundle; every file is checked against its hash. */
export async function openBundle(zip: Uint8Array): Promise<Opened> {
  const entries = listEntries(zip);
  const json = entries.find((e) => e.name === "canvas.json");
  if (!json) throw new Error("Not a saved canvas: canvas.json is missing");
  const read = readStored(JSON.parse(new TextDecoder().decode(await readEntry(zip, json, MAX_ENTRY))));
  const byHash = new Map<string, Uint8Array>();
  const fonts = new Map<string, Uint8Array>();
  const bad: string[] = [];
  for (const e of entries) {
    const m = /^(assets|fonts)\/([0-9a-f]{64})$/.exec(e.name);
    if (!m) continue;
    const bytes = await readEntry(zip, e, MAX_ENTRY);
    if ((await assetFile("x", bytes, "export")).hash !== m[2]) {
      bad.push(e.name);
      continue;
    }
    (m[1] === "assets" ? byHash : fonts).set(m[2], bytes);
  }
  const { names, missing } = assetsFrom(read.stored.assets, byHash);
  const files = await Promise.all(names.map((n) => assetFile(n.name, n.bytes, "export")));
  const assets = tableOf(files);
  const parsed: ParsedExport = {
    profile: read.profile,
    items: read.items,
    assets: new Map(files.map((f) => [f.name.toLowerCase(), { name: `assets/${f.name}`, read: async () => f.bytes }])),
    issues: read.issues,
  };
  return { parsed, assets, read, overrides: overridesFrom(read.items, read.keys), fonts, missing: [...missing, ...bad] };
}
