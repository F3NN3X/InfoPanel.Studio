import { describe, expect, it } from "vitest";
import { parseDisplayItemsXml } from "../parse.ts";
import { assetFile, tableOf, type Doc } from "./assets.ts";
import { applyBulk, matchByName, resizeTarget, worthKeeping } from "./bulk.ts";

const png = (n: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n]);

describe("bulk replace", () => {
  it("matches by exact name, else by a unique stem, and reports the rest", async () => {
    const table = tableOf(await Promise.all([assetFile("Logo.png", png(1), "export"), assetFile("bg.png", png(2), "export"), assetFile("icon.png", png(3), "export"), assetFile("icon.gif", png(4), "export")]));
    const incoming = await Promise.all([
      assetFile("logo.PNG", png(9), "added"), // exact, other case
      assetFile("bg.webp", png(8), "added"), // by stem
      assetFile("icon.jpg", png(7), "added"), // two icons: ambiguous
      assetFile("new.png", png(6), "added"), // nothing to replace
      assetFile("Logo.png", png(5), "added"), // Logo already taken
    ]);
    const plan = matchByName(table, incoming);
    expect(plan.matches.map((m) => [m.target, m.file.name, m.byStem])).toEqual([["Logo.png", "logo.PNG", false], ["bg.png", "bg.webp", true]]);
    expect(plan.ambiguous).toEqual(["icon.jpg", "Logo.png"]);
    expect(plan.unmatched).toEqual(["new.png"]);
  });

  it("skips files that are already the same, and replaces the rest in one doc", async () => {
    const items = parseDisplayItemsXml('<ArrayOfDisplayItem xmlns:xsi="x"><DisplayItem xsi:type="ImageDisplayItem"><FilePath>a.png</FilePath><RelativePath>true</RelativePath></DisplayItem></ArrayOfDisplayItem>').items;
    const a = await assetFile("a.png", png(1), "export");
    const b = await assetFile("b.png", png(2), "export");
    const doc: Doc = { items, assets: tableOf([a, b]) };
    const plan = matchByName(doc.assets, [await assetFile("a.png", png(3), "added"), await assetFile("b.png", png(2), "added")]);
    expect(plan.same).toEqual(["b.png"]);
    const next = applyBulk(doc, plan.matches);
    expect(next.assets.get("a.png")!.bytes).toEqual(png(3));
    expect(next.items).toEqual(items);
  });
});

describe("resize and keep", () => {
  it("never grows an image, and keeps at least a pixel", () => {
    expect(resizeTarget(400, 200, { kind: "percent", percent: 50 })).toEqual({ width: 200, height: 100 });
    expect(resizeTarget(400, 200, { kind: "longest", px: 100 })).toEqual({ width: 100, height: 50 });
    expect(resizeTarget(400, 200, { kind: "longest", px: 1000 })).toEqual({ width: 400, height: 200 });
    expect(resizeTarget(400, 200, { kind: "percent", percent: 0 })).toEqual({ width: 1, height: 1 });
    expect(resizeTarget(400, 200, { kind: "keep" })).toEqual({ width: 400, height: 200 });
  });

  it("keeps a re-encode only when it saves enough", () => {
    expect([worthKeeping(1000, 960), worthKeeping(1000, 950), worthKeeping(1000, 1200)]).toEqual([false, true, false]);
  });
});
