/// <reference types="vite/client" />
// InfoPanel's own profiles (the corpus stands in for them) imported, edited and exported again: the first export may
// normalise (window state, field order), and from then on export, import, export gives the same bytes.
import { describe, expect, it } from "vitest";
import { entriesFromZip, loadExport } from "@/lib/infopanel/archive.ts";
import { infopanelExport } from "@/lib/infopanel/export/write.ts";
import { toStored, readStored } from "@/lib/infopanel/import/stored.ts";
import { parseDisplayItemsXml, parseProfileXml } from "@/lib/infopanel/parse.ts";
import type { DisplayItem } from "@/lib/infopanel/schema.ts";

const xml = import.meta.glob<string>("../corpus/*/*.xml", { query: "?raw", import: "default", eager: true });
const ids = [...new Set(Object.keys(xml).map((k) => k.split("/").at(-2) as string))];

const reimport = async (bytes: Uint8Array) => {
  const { profile, items } = await loadExport(entriesFromZip(bytes));
  return { profile, items };
};

describe.skipIf(ids.length === 0)("corpus: export, import, export", () => {
  it.each(ids)("%s is byte-identical the second time, and through the stored form", async (id) => {
    const profile = parseProfileXml(xml[`../corpus/${id}/Profile.xml`]).profile;
    const items = parseDisplayItemsXml(xml[`../corpus/${id}/DisplayItems.xml`]).items;

    const first = infopanelExport(profile, items, []);
    const back = await reimport(first);
    const second = infopanelExport(back.profile, back.items, []);
    expect(second).toEqual(first);

    // The studio keeps the document as its stored form between import and export.
    const stored = toStored({ name: "x", origin: "file", dataApi: null, defaultMode: "infopanel", profile: back.profile, items: back.items, assets: new Map(), keyOf: () => null, fonts: [] });
    const kept = readStored(JSON.parse(JSON.stringify(stored)));
    expect(infopanelExport(kept.profile, kept.items, [])).toEqual(first);
  });

  it.each(ids)("%s: an edit changes that item and nothing else", async (id) => {
    const items = parseDisplayItemsXml(xml[`../corpus/${id}/DisplayItems.xml`]).items;
    const profile = parseProfileXml(xml[`../corpus/${id}/Profile.xml`]).profile;
    const imported = await reimport(infopanelExport(profile, items, []));
    const edited: DisplayItem[] = imported.items.map((item, i) => (i === 0 ? { ...item, X: item.X + 1 } : item));
    const back = await reimport(infopanelExport(imported.profile, edited, []));
    expect(back.items).toEqual(edited);
    expect(back.items.slice(1)).toEqual(imported.items.slice(1));
    expect(back.profile).toEqual(imported.profile);
  });
});
