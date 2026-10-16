/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { assetFile, tableOf } from "../assets/assets.ts";
import { parseDisplayItemsXml, parseProfileXml } from "../parse.ts";
import { groupId } from "../remap/remap.ts";
import type { DisplayItem } from "../schema.ts";
import type { BoundItem } from "../sensors.ts";
import { DEFAULT_GAUGE, STARTERS } from "../gauges/vector.ts";
import { assetsFrom, overridesFrom, readStored, remapKeys, toStored, type StoreInput } from "./stored.ts";

const xml = import.meta.glob<string>("../../corpus/*/*.xml", { query: "?raw", import: "default", eager: true });
const ids = [...new Set(Object.keys(xml).map((k) => k.split("/")[3]))];

const parse = (body: string) => parseDisplayItemsXml(`<ArrayOfDisplayItem xmlns:xsi="x">${body}</ArrayOfDisplayItem>`).items;
const profile = parseProfileXml("<Profile><Name>P</Name><Width>800</Width></Profile>").profile;

const input = (items: DisplayItem[], over: Partial<StoreInput> = {}): StoreInput => ({
  name: "P", origin: "file", dataApi: null, defaultMode: "infopanel", profile, items, assets: new Map(), keyOf: () => null, fonts: [],
  now: new Date("2026-10-16T12:00:00Z"), ...over,
});
const roundTrip = (s: unknown) => readStored(JSON.parse(JSON.stringify(s)));

describe("stored form", () => {
  it("keeps lab decisions under $ and reads them back into lab fields", () => {
    const [text, gauge] = parse('<DisplayItem xsi:type="TextDisplayItem"><Name>t</Name></DisplayItem><DisplayItem xsi:type="GaugeDisplayItem"><Images><ImageDisplayItem><FilePath>a.png</FilePath></ImageDisplayItem></Images></DisplayItem>');
    const items = [{ ...text, native: true }, { ...gauge, vector: DEFAULT_GAUGE, vectorBaked: "sig" }] as unknown as DisplayItem[];
    const s = toStored(input(items));
    expect(s.items[0]).toMatchObject({ kind: "Text", Name: "t", $: { mode: "native" } });
    expect(s.items[0]).not.toHaveProperty("native");
    expect(s.items[1].$).toEqual({ vector: DEFAULT_GAUGE, vectorBaked: "sig" });
    const back = roundTrip(s);
    expect(back.items).toEqual(items);
    expect(back.issues).toEqual([]);
  });

  it("keeps an SVG template gauge's template", () => {
    const [gauge] = parse('<DisplayItem xsi:type="GaugeDisplayItem"></DisplayItem>');
    const svg = STARTERS.find((s) => s.gauge.shape === "svg")!.gauge;
    const items = [{ ...gauge, vector: svg }] as unknown as DisplayItem[];
    expect(roundTrip(toStored(input(items))).items).toEqual(items);
  });

  it("stores each bound item's key and how it was found; the user's choices come back as overrides", () => {
    const items = parse(
      '<DisplayItem xsi:type="SensorDisplayItem"><SensorName>A</SensorName><SensorType>Plugin</SensorType><PluginSensorId>p1</PluginSensorId></DisplayItem>' +
        '<DisplayItem xsi:type="SensorDisplayItem"><SensorName>B</SensorName><SensorType>Plugin</SensorType><PluginSensorId>p2</PluginSensorId></DisplayItem>' +
        '<DisplayItem xsi:type="SensorDisplayItem"><SensorName>C</SensorName><SensorType>Plugin</SensorType><PluginSensorId>p3</PluginSensorId></DisplayItem>',
    );
    const [a, b, c] = items.map((i) => groupId(i as BoundItem));
    const resolved = new Map([[a, { key: "plugin.p1", via: "plugin-key" as const }], [b, { key: "plugin.x", via: "plugin-key" as const }], [c, null]]);
    const overrides = new Map([[b, "plugin.x"]]);
    const s = toStored(input(items, { keyOf: remapKeys(resolved, overrides) }));
    expect(s.items.map((i) => i.$)).toEqual([{ key: "plugin.p1", via: "exact" }, { key: "plugin.x", via: "chosen" }, { via: "unresolved" }]);
    const back = roundTrip(s);
    expect(back.items).toEqual(items);
    expect(overridesFrom(back.items, back.keys)).toEqual(new Map([[b, "plugin.x"]]));
    const unbound = roundTrip(toStored(input(items, { keyOf: remapKeys(resolved, new Map([[c, ""]])) })));
    expect(overridesFrom(unbound.items, unbound.keys)).toEqual(new Map([[c, ""]]));
  });

  it("carries non-finite doubles through JSON", () => {
    const [s] = parse('<DisplayItem xsi:type="SensorDisplayItem"><Threshold1>INF</Threshold1></DisplayItem>');
    const back = roundTrip(toStored(input([s])));
    expect((back.items[0] as { Threshold1: number }).Threshold1).toBe(Infinity);
  });

  it("refuses what is not a stored canvas, and checks every field of one that is", () => {
    expect(() => readStored({ format: "x" })).toThrow(/Not an imported/);
    expect(() => readStored({ format: "infopanel-canvas", version: 9 })).toThrow(/version 9/);
    const back = readStored({
      format: "infopanel-canvas",
      version: 1,
      profile: { Width: -5, Name: 3 },
      items: [
        { kind: "Text", X: "12", FontSize: 0, unknown: { "bad name": "x", Future: "1" }, $: { mode: "evil", key: 5 } },
        { kind: "Script" },
        { kind: "Gauge", Images: [{ kind: "Text" }, { kind: "Image", FilePath: "a.png" }] },
      ],
      assets: [{ name: "../../x.png", hash: "a".repeat(64), type: "png", size: 1 }, { name: "y.png", hash: "nope", type: "png" }],
    });
    expect(back.profile).toMatchObject({ Width: 600, Name: "Profile" });
    expect(back.items).toHaveLength(2);
    expect(back.items[0]).toMatchObject({ kind: "Text", X: 100, FontSize: 20, unknown: { Future: "1" } });
    expect(back.items[0]).not.toHaveProperty("native");
    expect((back.items[1] as { Images: unknown[] }).Images).toHaveLength(1);
    expect(back.stored.assets).toEqual([{ name: "x.png", hash: "a".repeat(64), type: "png", size: 1 }]);
    expect(back.issues.map((i) => `${i.code}:${i.field ?? i.value}`)).toEqual(
      expect.arrayContaining(["rejected-value:Width", "invalid-value:Name", "invalid-value:X", "rejected-value:FontSize", "invalid-value:unknown.bad name", "unknown-type:Script", "unknown-type:Text"]),
    );
  });

  it("rebuilds the asset files by hash and lists the missing", async () => {
    const f = await assetFile("Logo.png", new Uint8Array([1, 2]), "export");
    const s = toStored(input([], { assets: tableOf([f]) }));
    expect(s.assets).toEqual([{ name: "Logo.png", hash: f.hash, type: "other", size: 2 }]);
    expect(assetsFrom(s.assets, new Map([[f.hash, f.bytes]]))).toEqual({ names: [{ name: "Logo.png", bytes: f.bytes }], missing: [] });
    expect(assetsFrom(s.assets, new Map()).missing).toEqual(["Logo.png"]);
  });
});

describe.skipIf(ids.length === 0)("corpus through the stored form", () => {
  it.each(ids)("%s comes back unchanged", (id) => {
    const p = parseProfileXml(xml[`../../corpus/${id}/Profile.xml`]).profile;
    const items = parseDisplayItemsXml(xml[`../../corpus/${id}/DisplayItems.xml`]).items;
    const back = roundTrip(toStored(input(items, { profile: p })));
    expect(back.profile).toEqual(p);
    expect(back.items).toEqual(items);
    expect(back.issues).toEqual([]);
  });
});

describe("bundle", () => {
  it("saves the stored form with its files and opens it again, checking every hash", async () => {
    const { bundle, openBundle } = await import("./bundle.ts");
    const { writeZip, listEntries, readEntry } = await import("../zip.ts");
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
