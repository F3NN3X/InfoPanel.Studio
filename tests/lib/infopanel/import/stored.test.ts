/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { assetFile, tableOf } from "@/lib/infopanel/assets/assets.ts";
import { parseDisplayItemsXml, parseProfileXml } from "@/lib/infopanel/parse.ts";
import { groupId } from "@/lib/infopanel/remap/remap.ts";
import type { DisplayItem } from "@/lib/infopanel/schema.ts";
import type { BoundItem } from "@/lib/infopanel/sensors.ts";
import { STARTERS } from "@/lib/infopanel/gauges/presets.ts";
import { DEFAULT_GAUGE } from "@/lib/infopanel/gauges/vector.ts";
import { assetsFrom, newStored, overridesFrom, readStored, remapKeys, toStored, type StoreInput } from "@/lib/infopanel/import/stored.ts";
import { profileXml } from "@/lib/infopanel/export/write.ts";
import { checkValue } from "@/lib/infopanel/editor/registry.ts";
import { defaultItem, PROFILE } from "@/lib/infopanel/schema.ts";
import { newItem } from "@/lib/infopanel/editor/create.ts";
import { defaultPalette } from "@/lib/infopanel/elements/palette.ts";

const xml = import.meta.glob<string>("/lab/infopanel/corpus/*/*.xml", { query: "?raw", import: "default", eager: true });
const ids = [...new Set(Object.keys(xml).map((k) => k.split("/").at(-2)!))];

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

  it("keeps the screenshot kept for Compare through a round trip, and drops a malformed id", () => {
    const shot = `${"d".repeat(64)}.png`;
    expect(roundTrip(toStored(input([], { screenshot: shot }))).stored.screenshot).toBe(shot);
    expect(toStored(input([]))).not.toHaveProperty("screenshot");
    const raw = JSON.parse(JSON.stringify(toStored(input([], { screenshot: shot }))));
    expect(readStored({ ...raw, screenshot: "../../etc/passwd" }).stored).not.toHaveProperty("screenshot");
    expect(readStored({ ...raw, screenshot: 5 }).stored).not.toHaveProperty("screenshot");
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
    const p = parseProfileXml(xml[`/lab/infopanel/corpus/${id}/Profile.xml`]).profile;
    const items = parseDisplayItemsXml(xml[`/lab/infopanel/corpus/${id}/DisplayItems.xml`]).items;
    const back = roundTrip(toStored(input(items, { profile: p })));
    expect(back.profile).toEqual(p);
    expect(back.items).toEqual(items);
    expect(back.issues).toEqual([]);
  });
});

describe("bundle", () => {
  it("saves the stored form with its files and opens it again, checking every hash", async () => {
    const { bundle, openBundle } = await import("@/lib/infopanel/import/bundle.ts");
    const { writeZip, listEntries, readEntry } = await import("@/lib/infopanel/zip.ts");
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

describe("a profile from scratch", () => {
  it("is a stored form readStored takes as it is", () => {
    const s = newStored({ name: "Desk", width: 1920.4, height: 480, now: new Date("2026-10-24T00:00:00Z") });
    const r = readStored(JSON.parse(JSON.stringify(s)));
    expect(r.issues).toEqual([]);
    expect(r.items).toEqual([]);
    expect(r.stored.source).toEqual({ name: "Desk", origin: "new", importedAt: "2026-10-24T00:00:00.000Z" });
    expect(r.profile).toMatchObject({ Name: "Desk", Width: 1920, Height: 480, BackgroundColor: "#FF0A0A0C", Color: "#FFFFFFFF", FontScale: Math.fround(1.33), FontSize: 26 });
    expect(r.profile.Guid).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("profile settings", () => {
  it("every field InfoPanel exports round-trips through the stored form and Profile.xml", () => {
    const edits: Record<string, unknown> = {
      Name: "Side & panel", Width: 1280, Height: 480, BackgroundColor: "#FF112233", Font: "Orbitron", FontSize: 18, Color: "#CCFFEEDD",
      FontScale: 1.5, ShowFps: true, OpenGL: true, WebViewEnabled: true, WebViewUrl: "http://127.0.0.1/x?a=1&b=2", WebViewInteractive: true,
      WebViewDisableCache: true, WebViewAutoRefreshSeconds: 30, WebViewMaxFps: 60,
    };
    let profile = readStored(newStored({ name: "P", width: 800, height: 480 })).profile;
    for (const [k, v] of Object.entries(edits)) {
      const r = checkValue(PROFILE[k as keyof typeof PROFILE], v);
      expect(r.ok, k).toBe(true);
      if (r.ok) profile = { ...profile, [k]: r.value };
    }
    const stored = toStored(input([], { profile }));
    const back = readStored(JSON.parse(JSON.stringify(stored))).profile;
    expect(back).toEqual(profile);
    expect(parseProfileXml(profileXml(back)).profile).toEqual(profile);
  });

  it("refuses what InfoPanel's setters refuse, and clamps what they clamp", () => {
    expect(checkValue(PROFILE.Width, 0).ok).toBe(false);
    expect(checkValue(PROFILE.FontSize, -1).ok).toBe(false);
    expect(checkValue(PROFILE.WebViewAutoRefreshSeconds, 2)).toEqual({ ok: true, value: 5 });
    expect(checkValue(PROFILE.WebViewAutoRefreshSeconds, -3)).toEqual({ ok: true, value: 0 });
    expect(checkValue(PROFILE.WebViewMaxFps, 999)).toEqual({ ok: true, value: 240 });
  });
});

describe("the original binding a remap keeps", () => {
  const [sensor] = parse('<DisplayItem xsi:type="SensorDisplayItem"><SensorName>CPU</SensorName><SensorType>Libre</SensorType><LibreSensorId>/cpu/0</LibreSensorId></DisplayItem>');
  const original = { SensorType: "Libre", SensorName: "CPU", LibreSensorId: "/cpu/0" };

  it("is read back as it was stored", () => {
    const r = roundTrip(toStored(input([sensor], { keyOf: () => ({ key: "k", via: "chosen", original }) })));
    expect(r.keys.get("0")).toEqual({ key: "k", via: "chosen", original });
    expect(r.issues).toEqual([]);
  });

  it("is dropped and reported when a field is not the kind's, or not a value it takes", () => {
    for (const bad of [{ ...original, SensorType: "Bogus" }, { ...original, Font: "x" }, { SensorName: "CPU" }, "libre"]) {
      const r = roundTrip(toStored(input([sensor], { keyOf: () => ({ key: "k", via: "chosen", original: bad as never }) })));
      expect(r.keys.get("0")).toEqual({ key: "k", via: "chosen" });
      expect(r.issues).toEqual([expect.objectContaining({ code: "invalid-value", field: "$.original" })]);
    }
  });
});

describe("studio elements and the palette in the stored form", () => {
  const base = newStored({ name: "Cards", width: 800, height: 480, now: new Date("2026-10-24T00:00:00Z") });
  const profile = readStored(base).profile;
  const ring = {
    ...newItem("Gauge", profile),
    element: { type: "ring", start: -135, sweep: 270, thickness: 12, track: { color: "#FF2C2C2E", slot: "track" }, fill: [{ color: "#FF3B82F6", slot: "accent1" }], rounded: true, dot: true, ticks: 0, segments: 0, gap: 3, glow: 0 },
  } as unknown as DisplayItem;
  const shape = newItem("Shape", profile);
  const storeInput = (items: DisplayItem[]): StoreInput => ({ name: "Cards", origin: "new", dataApi: null, defaultMode: "infopanel", profile, items, assets: new Map(), keyOf: () => null, fonts: [] });
  const store = (items: DisplayItem[], extra: object = {}) => JSON.parse(JSON.stringify({ ...toStored(storeInput(items)), ...extra }));

  it("keeps an element's spec, a baked record, the slots and the palette through JSON", () => {
    const palette = { ...defaultPalette(profile), accent1: "#FFFF0000" };
    const baked = { ...shape, element: { type: "glow", color: { color: "#FFFF0000", slot: "accent1" }, alpha: 0.4, radius: 50 }, elementBaked: "sig" } as unknown as DisplayItem;
    const r = readStored(store([ring, shape], { palette }));
    expect(r.issues).toEqual([]);
    expect(r.items[0]).toMatchObject({ element: { type: "ring", dot: true, fill: [{ slot: "accent1" }] } });
    expect(r.items[1]).toMatchObject({ slots: { FillColor: { slot: "card" } } });
    expect(r.stored.palette).toEqual(palette);
    // A glow is an Image: on a Shape it is refused, its record with it.
    const wrong = readStored(store([baked]));
    expect(wrong.items[0]).not.toHaveProperty("element");
    expect(wrong.items[0]).not.toHaveProperty("elementBaked");
    expect(wrong.issues).toEqual([expect.objectContaining({ code: "invalid-value", field: "$.element" })]);
  });

  it("refuses slots on a field that is not a colour, or with an unknown slot", () => {
    for (const slots of [{ Width: { slot: "card" } }, { FillColor: { slot: "nope" } }, { FillColor: { slot: "card", alpha: 2 } }]) {
      const raw = store([{ ...shape, slots } as unknown as DisplayItem]);
      const r = readStored(raw);
      expect(r.items[0]).not.toHaveProperty("slots");
      expect(r.issues).toEqual([expect.objectContaining({ field: "$.slots" })]);
    }
  });

  it("reads an older stored form, without elements, slots or palette, as before", () => {
    const old = store([{ ...defaultItem("Shape"), Name: "s" } as DisplayItem]);
    delete old.palette;
    const r = readStored(old);
    expect(r.issues).toEqual([]);
    expect(r.stored).not.toHaveProperty("palette");
    expect(r.items[0]).not.toHaveProperty("element");
    // A bad palette slot takes the profile's default.
    expect(readStored({ ...old, palette: { accent1: 7 } }).stored.palette).toEqual(defaultPalette(profile));
  });
});

describe("v15's studio-only fields: cells and letter spacing", () => {
  const text = { ...defaultItem("Text"), Name: "t" } as DisplayItem;
  const cell = { col: 7, row: 5, cols: 2, rows: 1 };

  it("keeps an item's cells, a widget's cells and a text's letter spacing under $, and reads them back", () => {
    const widget = { ...defaultItem("Image"), Name: "Weather", widget: { module: "Weather", cell } } as unknown as DisplayItem;
    const items = [{ ...text, cell, letterSpacing: 5 }, widget] as unknown as DisplayItem[];
    const s = toStored(input(items));
    expect(s.items[0].$).toEqual({ cell, letterSpacing: 5 });
    expect(s.items[1].$).toEqual({ widget: { module: "Weather", cell } });
    const back = roundTrip(s);
    expect(back.items).toEqual(items);
    expect(back.issues).toEqual([]);
  });

  it("never writes a letter spacing of 0", () => {
    expect(toStored(input([{ ...text, letterSpacing: 0 } as unknown as DisplayItem])).items[0]).not.toHaveProperty("$");
  });

  it("reports and drops cells on a Group or out of range, and a letter spacing on a non-text item or out of range; the item stays", () => {
    const raw = toStored(input([text, { ...defaultItem("Group"), Name: "g", DisplayItems: [] } as DisplayItem, { ...defaultItem("Bar"), Name: "b" } as DisplayItem]));
    raw.items[0].$ = { cell: { col: 0, row: 1, cols: 1, rows: 1 }, letterSpacing: 9999 };
    raw.items[1].$ = { cell };
    raw.items[2].$ = { letterSpacing: 3 } as never;
    const r = readStored(JSON.parse(JSON.stringify(raw)));
    expect(r.items.map((i) => i.Name)).toEqual(["t", "g", "b"]);
    for (const i of r.items) {
      expect(i).not.toHaveProperty("cell");
      expect(i).not.toHaveProperty("letterSpacing");
    }
    expect(r.issues.map((i) => i.field).sort()).toEqual(["$.cell", "$.cell", "$.letterSpacing", "$.letterSpacing"]);
  });

  it("a widget whose cells are broken keeps its widget, without the cells", () => {
    const raw = toStored(input([{ ...defaultItem("Image"), Name: "W", widget: { module: "Clock" } } as unknown as DisplayItem]));
    (raw.items[0].$ as unknown as { widget: Record<string, unknown> }).widget.cell = { col: 1, row: "1", cols: 1, rows: 1 };
    const r = readStored(JSON.parse(JSON.stringify(raw)));
    expect((r.items[0] as unknown as { widget: unknown }).widget).toEqual({ module: "Clock" });
  });
});
