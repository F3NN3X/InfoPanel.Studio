import { describe, expect, it } from "vitest";
import { itemAt } from "@/lib/infopanel/editor/ops.ts";
import { parseDisplayItemsXml } from "@/lib/infopanel/parse.ts";
import type { GaugeItem } from "@/lib/infopanel/schema.ts";
import { add, analyse, assetFile, assign, freeName, mergeDuplicates, remove, removeWithUses, replace, scanRefs, sniff, tableOf, usesOf, type Doc } from "@/lib/infopanel/assets/assets.ts";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const be32 = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, n >> 8];

const png = (w: number, h: number, extra = 0) => bytes([0x89], "PNG\r\n\x1a\n", be32(13), "IHDR", be32(w), be32(h), [8, 6, 0, 0, 0], be32(0), new Array(extra).fill(0));
const gif = (w: number, h: number, frames: number) =>
  bytes("GIF89a", le16(w), le16(h), [0, 0, 0], ...Array.from({ length: frames }, () => [0x21, 0xf9, 4, 0, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0]), [0x3b]);
const jpeg = (w: number, h: number) => bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16], new Array(14).fill(0), [0xff, 0xc0, 0, 17, 8], be32((h << 16) | w), [3]);

const image = (name: string, extra = "") => `<DisplayItem xsi:type="ImageDisplayItem"><FilePath>${name}</FilePath><RelativePath>true</RelativePath>${extra}</DisplayItem>`;
const items = (xml: string) => parseDisplayItemsXml(`<ArrayOfDisplayItem xmlns:xsi="x">${xml}</ArrayOfDisplayItem>`).items;

const TREE = items(
  image("Logo.png", "<Width>100</Width><Height>50</Height>") +
    `<DisplayItem xsi:type="GroupDisplayItem"><DisplayItems>${image("logo.PNG", "<Width>200</Width><Height>100</Height><Scale>50</Scale>")}${image("C:\\x\\abs.png").replace("true", "false")}</DisplayItems></DisplayItem>` +
    `<DisplayItem xsi:type="GaugeDisplayItem"><Images><ImageDisplayItem><FilePath>g0.png</FilePath><RelativePath>true</RelativePath></ImageDisplayItem><ImageDisplayItem><FilePath>g1.png</FilePath><RelativePath>true</RelativePath></ImageDisplayItem></Images></DisplayItem>` +
    `<DisplayItem xsi:type="ImageDisplayItem"><Type>URL</Type><HttpUrl>https://x/y.png</HttpUrl></DisplayItem>`,
);

async function docOf(files: Record<string, Uint8Array>): Promise<Doc> {
  return { items: TREE, assets: tableOf(await Promise.all(Object.entries(files).map(([n, b]) => assetFile(n, b, "export")))) };
}

describe("sniff", () => {
  it("reads type and pixel size from the header, not the name", () => {
    expect(sniff(png(640, 480))).toEqual({ type: "png", width: 640, height: 480 });
    expect(sniff(gif(32, 16, 1))).toEqual({ type: "gif", width: 32, height: 16 });
    expect(sniff(gif(32, 16, 3))).toEqual({ type: "gif", width: 32, height: 16, animated: true });
    expect(sniff(jpeg(1920, 1080))).toEqual({ type: "jpeg", width: 1920, height: 1080 });
    expect(sniff(bytes("RIFF", be32(0), "WEBPVP8X", be32(0), [0x02, 0, 0, 0], [0x7f, 0x02, 0], [0xdf, 0x01, 0]))).toEqual({
      type: "webp", width: 640, height: 480, animated: true,
    });
    expect(sniff(bytes('<?xml version="1.0"?>\n<svg xmlns="x"/>'))).toEqual({ type: "svg" });
    expect(sniff(bytes(be32(24), "ftypisom"))).toEqual({ type: "video" });
    expect(sniff(bytes("hello"))).toEqual({ type: "other" });
  });
});

describe("references", () => {
  it("finds image items in groups and gauge frames, case-insensitively, with the drawn size", () => {
    const { refs, others } = scanRefs(TREE);
    expect(refs).toEqual([
      { path: "0", name: "logo.png", drawn: { width: 100, height: 50 } },
      { path: "1.0", name: "logo.png", drawn: { width: 100, height: 50 } },
      { path: "2", frame: 0, name: "g0.png" },
      { path: "2", frame: 1, name: "g1.png" },
    ]);
    expect(others).toEqual([
      { path: "1.1", kind: "absolute", value: "C:\\x\\abs.png" },
      { path: "3", kind: "url", value: "https://x/y.png" },
    ]);
    expect(usesOf(TREE).get("logo.png")).toHaveLength(2);
  });
});

describe("edits", () => {
  it("adds under a free name and does not store the same bytes twice", async () => {
    const doc = await docOf({ "Logo.png": png(10, 10) });
    expect(freeName(doc.assets, "logo.PNG")).toBe("logo (2).PNG");
    const r = add(doc, [await assetFile("C:\\up\\logo.png", png(20, 20), "added"), await assetFile("copy.png", png(10, 10), "added")]);
    expect(r.names).toEqual(["logo (2).png", "Logo.png"]);
    expect([...r.doc.assets.keys()]).toEqual(["logo.png", "logo (2).png"]);
  });

  it("replaces everywhere: same type keeps the name, another type renames and repoints every use", async () => {
    const doc = await docOf({ "Logo.png": png(10, 10), "g0.png": png(1, 1) });
    const served: Doc = { ...doc, assets: new Map([...doc.assets].map(([k, f]) => [k, { ...f, url: `/corpus/p/assets/${f.name}` }])) };
    const same = replace(served, "logo.png", await assetFile("new.png", png(30, 30), "added"));
    // The served URL is the export's file, not the replacement.
    expect(same.assets.get("logo.png")?.url).toBeUndefined();
    expect(same.items).toBe(doc.items);
    expect(same.assets.get("logo.png")).toMatchObject({ name: "Logo.png", width: 30, origin: "export" });

    const other = replace(doc, "logo.png", await assetFile("photo.jpg", jpeg(30, 30), "added"));
    expect(other.assets.has("logo.png")).toBe(false);
    expect(other.assets.get("logo.jpg")?.type).toBe("jpeg");
    expect([itemAt(other.items, "0"), itemAt(other.items, "1.0")].map((i) => (i as { FilePath: string }).FilePath)).toEqual(["Logo.jpg", "Logo.jpg"]);
  });

  it("assigns an asset to the selected image items only", () => {
    const next = assign(TREE, ["3", "2"], "new.png");
    expect(itemAt(next, "3")).toMatchObject({ Type: "FILE", FilePath: "new.png", RelativePath: true });
    expect(itemAt(next, "2")).toBe(itemAt(TREE, "2"));
  });

  it("removes, optionally clearing the uses, including gauge frames", async () => {
    const doc = await docOf({ "g0.png": png(1, 1), "g1.png": png(2, 2) });
    expect(remove(doc, ["G0.png"]).items).toBe(doc.items);
    const cleared = removeWithUses(doc, ["g0.png"]);
    expect((itemAt(cleared.items, "2") as GaugeItem).Images.map((f) => f.FilePath)).toEqual([null, "g1.png"]);
    expect([...cleared.assets.keys()]).toEqual(["g1.png"]);
  });
});

describe("cleanup", () => {
  it("lists unused, duplicate, oversized and missing files", async () => {
    const doc = await docOf({ "Logo.png": png(400, 200), "g0 - Copy.png": png(8, 8), "g0.png": png(8, 8), "g1.png": png(8, 8), "spare.png": png(5, 5, 1_000_001) });
    const c = analyse(doc);
    expect(c.unused).toEqual(["g0 - Copy.png", "spare.png"]);
    expect(c.duplicates).toEqual([["g0.png", "g1.png", "g0 - Copy.png"]]);
    expect(c.oversized).toEqual([
      { name: "Logo.png", target: { width: 100, height: 50 }, reason: "400×200, drawn at most 100×50" },
      { name: "spare.png", reason: "1.0 MB" },
    ]);
    expect(c.missing).toEqual([]);

    const merged = mergeDuplicates(doc, c.duplicates);
    expect((itemAt(merged.items, "2") as GaugeItem).Images.map((f) => f.FilePath)).toEqual(["g0.png", "g0.png"]);
    expect(merged.assets.has("g1.png")).toBe(false);
    expect(analyse(remove(doc, ["Logo.png"])).missing).toEqual([{ name: "logo.png", refs: expect.any(Array) }]);
  });
});
