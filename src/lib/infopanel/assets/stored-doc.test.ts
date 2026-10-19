import { describe, expect, it } from "vitest";
import { openCanvas } from "../canvas.ts";
import { toStored, type StoredCanvas } from "../import/stored.ts";
import { parseDisplayItemsXml, parseProfileXml } from "../parse.ts";
import { assetFile, removeWithUses, replace, scanRefs, tableOf, usesOf, type AssetFile } from "./assets.ts";
import { matchByName } from "./bulk.ts";
import { candidatesFor, cleanBasics, cleanupCount, docFromStored, drawnSize, findingsOf, optimiseTarget, storedFromDoc, typeNote, withPicks } from "./stored-doc.ts";

const bytes = (...parts: (number[] | string)[]) => new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const be32 = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number, extra = 0, colour = 6) => bytes([0x89], "PNG\r\n\x1a\n", be32(13), "IHDR", be32(w), be32(h), [8, colour, 0, 0, 0], be32(0), new Array(extra).fill(0));
const jpeg = (w: number, h: number) => bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16], new Array(14).fill(0), [0xff, 0xc0, 0, 17, 8], be32((h << 16) | w), [3]);

const image = (name: string, size = "") => `<DisplayItem xsi:type="ImageDisplayItem"><FilePath>${name}</FilePath><RelativePath>true</RelativePath>${size}</DisplayItem>`;
const items = parseDisplayItemsXml(
  `<ArrayOfDisplayItem xmlns:xsi="x">${image("logo.png", "<Width>60</Width><Height>60</Height>")}${image("bg.png", "<Width>100</Width><Height>100</Height>")}${image("gone.png")}</ArrayOfDisplayItem>`,
).items;
const profile = parseProfileXml("<Profile><Name>P</Name><Width>800</Width><Height>480</Height></Profile>").profile;

const FILES: Record<string, Uint8Array> = {
  "logo.png": png(512, 512),
  "logo_old.png": png(512, 512),
  "bg.png": png(100, 100, 5),
  "spare.png": png(10, 10, 9),
};

async function fixture() {
  const files = await Promise.all(Object.entries(FILES).map(([n, b]) => assetFile(n, b, "export")));
  const stored = toStored({ name: "T", origin: "file", dataApi: null, defaultMode: "infopanel", profile, items, fonts: [], assets: tableOf(files), keyOf: () => null });
  const open = openCanvas(JSON.parse(JSON.stringify(stored)));
  const read = async (a: { hash: string }) => files.find((f) => f.hash === a.hash)?.bytes ?? null;
  return { stored: open.stored, open, doc: await docFromStored(open, read) };
}

const noUpload = async (): Promise<string> => {
  throw new Error("nothing to upload");
};

describe("stored doc", () => {
  it("round-trips unchanged and uploads nothing", async () => {
    const { open, doc } = await fixture();
    expect(doc.assets.size).toBe(4);
    const back = await storedFromDoc(open.stored, open.profile, doc, noUpload);
    expect(back.assets).toEqual(open.stored.assets);
    expect(back.items).toEqual(open.stored.items);
  });

  it("finds unused, identical, larger and missing", async () => {
    const { doc } = await fixture();
    const found = findingsOf(doc);
    expect(found.counts).toEqual({ unused: 2, identical: 1, larger: 1, large: 0, missing: 1 });
    expect(found.byName.get("logo_old.png")).toEqual(["unused", "identical"]);
    expect(found.byName.get("gone.png")).toEqual(["missing"]);
    expect(cleanupCount(found, ["logo.png"])).toBe(3);
  });

  it("a listed file the store can't read is missing too", async () => {
    const { open } = await fixture();
    const gone = open.stored.assets.find((a) => a.name === "bg.png")!.hash;
    const files = await Promise.all(Object.entries(FILES).map(([n, b]) => assetFile(n, b, "export")));
    const doc = await docFromStored(open, async (a) => (a.hash === gone ? null : (files.find((f) => f.hash === a.hash)?.bytes ?? null)));
    const found = findingsOf(doc);
    expect(found.byName.get("bg.png")).toContain("missing");
    expect(found.counts.missing).toBe(2);
  });

  it("clean up is one change: unused removed, identical merged", async () => {
    const { open, doc } = await fixture();
    const clean = cleanBasics(doc);
    expect([...clean.assets.keys()].sort()).toEqual(["bg.png", "logo.png"]);
    const back = await storedFromDoc(open.stored, open.profile, clean, noUpload);
    expect(back.assets.map((a) => a.name)).toEqual(["logo.png", "bg.png"]);
  });

  it("replace uploads new bytes and repoints a type change", async () => {
    const { open, doc } = await fixture();
    const next = replace(doc, "logo.png", await assetFile("logo.jpg", jpeg(64, 64), "added"));
    expect([...next.assets.keys()]).toContain("logo.jpg");
    expect(usesOf(next.items).get("logo.jpg")).toHaveLength(1);
    const uploaded: string[] = [];
    const back = await storedFromDoc(open.stored, open.profile, next, async (f) => {
      uploaded.push(f.name);
      return `${f.hash}.jpg`;
    });
    expect(uploaded).toEqual(["logo.jpg"]);
    expect(back.assets.find((a) => a.name === "logo.jpg")).toMatchObject({ type: "jpeg", size: jpeg(64, 64).length });
    expect(back.assets.find((a) => a.name === "logo.jpg")?.ext).toBeUndefined();
    expect(JSON.stringify(back.items)).toContain("logo.jpg");
  });

  it("removing clears the uses", async () => {
    const { open, doc } = await fixture();
    const next = removeWithUses(doc, ["bg.png"]);
    expect(scanRefs(next.items).refs.map((r) => r.name)).not.toContain("bg.png");
    const back: StoredCanvas = await storedFromDoc(open.stored, open.profile, next, noUpload);
    expect(back.assets.map((a) => a.name)).not.toContain("bg.png");
  });
});

describe("sizes and notes", () => {
  it("drawn size and optimise targets", async () => {
    const { doc } = await fixture();
    const refs = usesOf(doc.items).get("logo.png")!;
    const file = doc.assets.get("logo.png") as AssetFile;
    expect(drawnSize(refs)).toEqual({ width: 60, height: 60 });
    expect(optimiseTarget(file, refs, "drawn")).toEqual({ width: 60, height: 60 });
    expect(optimiseTarget(file, refs, "half")).toEqual({ width: 256, height: 256 });
    expect(optimiseTarget(file, refs, "none")).toEqual({ width: 512, height: 512 });
    expect(drawnSize([])).toBeUndefined();
  });

  it("notes alpha", async () => {
    expect(typeNote(await assetFile("a.png", png(4, 4), "added"))).toBe("alpha");
    expect(typeNote(await assetFile("a.png", png(4, 4, 0, 2), "added"))).toBe("");
  });
});

describe("replace by name", () => {
  it("lets the user pick a target for an ambiguous file", async () => {
    const table = tableOf(await Promise.all(["a.png", "a.jpg"].map((n, i) => assetFile(n, i ? jpeg(4, 4) : png(4, 4), "export"))));
    const file = await assetFile("a.webp", png(8, 8, 3), "added");
    const plan = matchByName(table, [file]);
    expect(plan.ambiguous).toEqual(["a.webp"]);
    expect(candidatesFor(table, file)).toEqual(["a.png", "a.jpg"]);
    expect(withPicks(plan, [file], new Map())).toHaveLength(0);
    expect(withPicks(plan, [file], new Map([["a.webp", "a.jpg"]]))).toEqual([{ target: "a.jpg", file, byStem: true }]);
  });
});
