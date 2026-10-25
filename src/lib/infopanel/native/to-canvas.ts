/**
 * Browser-only: converted items and their picture files as an InfoPanel canvas in its stored form, ready to be a canvas
 * zone. The files go to the asset store (the stored form refers to them by hash); a bound item keeps the Data API key it
 * was made from, so the canvas shows live values here and exports natively.
 */
import { uploadBytes } from "../../assets.ts";
import { tableOf, type AssetFile } from "../assets/assets.ts";
import { importOf } from "../canvas-edit.ts";
import { defaultPalette } from "../elements/palette.ts";
import { extOverrides, fontRequests } from "../import/session.ts";
import { importRecord, newStored, readStored, toStored, type StoredCanvas, type StoredFont } from "../import/stored.ts";
import type { DisplayItem } from "../schema.ts";

export async function canvasFromItems(items: readonly DisplayItem[], assets: readonly AssetFile[], input: { name: string; width: number; height: number }): Promise<StoredCanvas> {
  const base = newStored(input);
  const { profile } = readStored(base);
  const table = tableOf(assets);
  const uploaded = new Map<string, string>();
  for (const f of table.values()) if (!uploaded.has(f.hash)) uploaded.set(f.hash, (await uploadBytes(f.bytes, "image/png")).id);
  const exts = extOverrides(table, uploaded);
  const fonts = [...fontRequests(items).values()].map(({ request }): StoredFont => ({ request, use: "infopanel" }));
  const stored = toStored({
    name: input.name,
    origin: "new",
    dataApi: null,
    defaultMode: "infopanel",
    profile,
    items,
    assets: table,
    keyOf: (item) => importRecord(importOf(item)),
    fonts,
    palette: defaultPalette(profile),
  });
  return { ...stored, assets: stored.assets.map((a) => (exts.has(a.hash) ? { ...a, ext: exts.get(a.hash) } : a)) };
}
