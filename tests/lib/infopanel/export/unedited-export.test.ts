// An imported InfoPanel profile nobody edited exports the same .infopanel bytes it did before the one editor
// (SPEC §7.4, acceptance 2). Each built-in template stands in for an InfoPanel profile: its export is imported as a
// file, placed as a screen, read back from the config and exported again, and the bytes are checked against the
// hashes this build froze in `unedited-export.json`. The hashes are never regenerated to make the test pass.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { importAsProfile } from "@/components/studio/import-actions";
import { assetFile, type Doc } from "@/lib/infopanel/assets/assets.ts";
import { itemAt } from "@/lib/infopanel/editor/ops.ts";
import { elementSignature, setElementFile, staleElements, staticOf } from "@/lib/infopanel/elements/bake.ts";
import { infopanelFile, staleGauges } from "@/lib/infopanel/export/studio-export.ts";
import { bakeSignature, setFrameFiles, vectorOf } from "@/lib/infopanel/gauges/frames.ts";
import { buildCanvas, openStored, openZip } from "@/lib/infopanel/import/session.ts";
import type { DefaultMode, StoredCanvas } from "@/lib/infopanel/import/stored.ts";
import type { DisplayItem } from "@/lib/infopanel/schema.ts";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog.ts";
import { instantiate } from "@/lib/infopanel/templates/instantiate.ts";
import { MOCK_SENSORS } from "@/lib/infopanel/templates/mock.ts";
import { CANVAS_ID, newProfile, type DashboardConfig } from "@/lib/layout";
import frozen from "./unedited-export.json";

const now = new Date("2026-10-25T00:00:00Z");
const png = (n: number) => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, n % 256, (n >> 8) % 256]);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Stand-in bakes (no canvas under Node), as the templates test makes them. */
async function baked(items: DisplayItem[]): Promise<Doc> {
  let doc: Doc = { items, assets: new Map() };
  let n = 0;
  for (const path of staleElements(doc.items)) {
    const el = staticOf(itemAt(doc.items, path))!;
    doc = setElementFile(doc, path, await assetFile(`el_${path}.png`, png(n++), "added"), elementSignature(el.spec, el.width, el.height));
  }
  for (const path of staleGauges(doc.items)) {
    const spec = vectorOf(itemAt(doc.items, path))!;
    const files = [await assetFile(`g${path}_0.png`, png(n++), "added"), await assetFile(`g${path}_1.png`, png(n++), "added")];
    doc = setFrameFiles(doc, path, files, bakeSignature(spec, 2));
  }
  return doc;
}

/** The InfoPanel profile a template makes: an .infopanel file. */
async function infopanelOf(id: string): Promise<Uint8Array> {
  const template = TEMPLATES.find((t) => t.id === id)!;
  const { stored } = instantiate(template, { name: "Desk", width: 800, height: 480, sensors: MOCK_SENSORS, now });
  // A new profile's Guid is random: fixed here, so the file is the same every run.
  const fixed = { ...stored, profile: { ...stored.profile, Guid: "5f0c2a52-6c2e-4d0b-9a59-6c1a2f0e0b11" } };
  const open = await openStored(JSON.parse(JSON.stringify(fixed)), async () => null);
  return infopanelFile(open.parsed.profile, await baked(open.parsed.items)).bytes;
}

/** That file imported (no remap, no edits), placed as a screen, kept in the config as JSON, then exported as the export dialog does. */
async function reexport(file: Uint8Array, mode: DefaultMode): Promise<Uint8Array> {
  const source = await openZip("Desk.infopanel", file);
  const canvas = buildCanvas({ source, name: "Desk", mode, resolved: new Map(), overrides: new Map(), dataApi: null, uploaded: new Map(), now });
  const empty = { profiles: [newProfile("Main", 1920, 1080)] } as unknown as DashboardConfig;
  const placed = importAsProfile(empty, canvas, "Desk", { width: 800, height: 480 }, false);
  const config = JSON.parse(JSON.stringify(placed.config)) as DashboardConfig;
  const zone = config.profiles.flatMap((p) => p.pages.flatMap((pg) => pg.placements)).find((z) => z.module === CANVAS_ID && z.canvas)!;
  const byHash = new Map([...source.assets.values()].map((f) => [f.hash, f.bytes]));
  const opened = await openStored(zone.canvas as StoredCanvas, async (hash) => byHash.get(hash) ?? null);
  return infopanelFile(opened.parsed.profile, { items: opened.parsed.items, assets: opened.assets }).bytes;
}

const hashes = frozen as Record<string, string>;

describe("an unedited imported profile's export", () => {
  it("has a frozen hash for every template and mode", () => {
    expect(Object.keys(hashes).sort()).toEqual(TEMPLATES.flatMap((t) => [`${t.id}:infopanel`, `${t.id}:native`]).sort());
  });

  it.each(TEMPLATES.map((t) => t.id))("%s exports byte-identical to the frozen export, faithful and native", async (id) => {
    const file = await infopanelOf(id);
    const faithful = await reexport(file, "infopanel");
    expect(sha(faithful)).toBe(hashes[`${id}:infopanel`]);
    expect(sha(await reexport(file, "native"))).toBe(hashes[`${id}:native`]);
    // Faithful keeps InfoPanel's own items, so the file comes back as it went in.
    expect(faithful).toEqual(file);
  });
});
