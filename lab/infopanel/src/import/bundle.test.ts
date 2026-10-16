import { describe, expect, it } from "vitest";
import { assetFile, tableOf } from "@/lib/infopanel/assets/assets.ts";
import { parseDisplayItemsXml, parseProfileXml } from "@/lib/infopanel/parse.ts";
import { toStored, type StoreInput } from "@/lib/infopanel/import/stored.ts";
import type { DisplayItem } from "@/lib/infopanel/schema.ts";
import { listEntries, readEntry, writeZip } from "@/lib/infopanel/zip.ts";
import { bundle, openBundle } from "./bundle.ts";

const parse = (body: string) => parseDisplayItemsXml(`<ArrayOfDisplayItem xmlns:xsi="x">${body}</ArrayOfDisplayItem>`).items;
const profile = parseProfileXml("<Profile><Name>P</Name><Width>800</Width></Profile>").profile;
const input = (items: DisplayItem[], over: Partial<StoreInput> = {}): StoreInput => ({
  name: "P", origin: "file", dataApi: null, defaultMode: "infopanel", profile, items, assets: new Map(), keyOf: () => null, fonts: [],
  now: new Date("2026-10-16T12:00:00Z"), ...over,
});

describe("bundle", () => {
  it("saves the stored form with its files and opens it again, checking every hash", async () => {
    const items = parse('<DisplayItem xsi:type="ImageDisplayItem"><FilePath>Logo.png</FilePath><RelativePath>true</RelativePath></DisplayItem>');
    const logo = await assetFile("Logo.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "export");
    const font = new Uint8Array([0, 1, 0, 0]);
    const fontHash = (await assetFile("f", font, "added")).hash;
    const zip = bundle(toStored(input(items, { assets: tableOf([logo]) })), tableOf([logo]), new Map([[fontHash, font]]));
    const opened = await openBundle(zip);
    expect(opened.parsed.items).toEqual(items);
    expect([...opened.assets.keys()]).toEqual(["logo.png"]);
    expect(await opened.parsed.assets.get("logo.png")!.read()).toEqual(logo.bytes);
    expect([...opened.fonts.keys()]).toEqual([fontHash]);
    expect(opened.missing).toEqual([]);

    // A file whose bytes do not match its name is dropped and reported.
    const entries = await Promise.all(listEntries(zip).map(async (e) => ({ name: e.name, data: await readEntry(zip, e) })));
    const tampered = writeZip(entries.map((e) => (e.name.startsWith("assets/") ? { ...e, data: new Uint8Array([9]) } : e)));
    expect((await openBundle(tampered)).missing).toEqual(["Logo.png", `assets/${logo.hash}`]);
  });
});
