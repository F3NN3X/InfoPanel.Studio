import { describe, expect, it } from "vitest";
import { parseDisplayItemsXml, parseProfileXml } from "./parse.ts";
import type { DisplayItem } from "./schema.ts";
import { isBound, type BoundItem } from "./sensors.ts";
import { toStored, type StoreInput } from "./import/stored.ts";
import { ZEROS } from "./render/scene.ts";
import { assetUrl, canvasSensor, fitScale, keyOf, KeyHistory, openCanvas } from "./canvas.ts";
import { storedCanvasKeys } from "./canvas-keys.ts";

const parse = (body: string) => parseDisplayItemsXml(`<ArrayOfDisplayItem xmlns:xsi="x">${body}</ArrayOfDisplayItem>`).items;
const profile = parseProfileXml("<Profile><Name>P</Name><Width>800</Width><Height>480</Height></Profile>").profile;
const HASH = "a".repeat(64);

const ITEMS = parse(
  '<DisplayItem xsi:type="SensorDisplayItem"><Name>cpu</Name><SensorType>Libre</SensorType><LibreSensorId>/cpu/0</LibreSensorId></DisplayItem>' +
    '<DisplayItem xsi:type="GroupDisplayItem"><DisplayItems>' +
    '<DisplayItem xsi:type="GraphDisplayItem"><Name>g</Name><SensorType>Libre</SensorType><LibreSensorId>/gpu/0</LibreSensorId></DisplayItem>' +
    '<DisplayItem xsi:type="TextDisplayItem"><Name>t</Name><Font>Orbitron</Font></DisplayItem>' +
    "</DisplayItems></DisplayItem>",
);

function stored(over: Partial<StoreInput> = {}) {
  const keys = new Map<DisplayItem, string>([[ITEMS[0], "libre.cpu"]]);
  const group = ITEMS[1] as Extract<DisplayItem, { kind: "Group" }>;
  keys.set(group.DisplayItems[0], "libre.gpu");
  const s = toStored({
    name: "ARCv2", origin: "file", dataApi: null, defaultMode: "infopanel", profile, items: ITEMS, fonts: [],
    assets: new Map(),
    keyOf: (item) => (keys.has(item) ? { key: keys.get(item), via: "exact" } : isBound(item) ? { via: "unresolved" } : null),
    ...over,
  });
  // As the config holds it: plain JSON.
  return JSON.parse(JSON.stringify({ ...s, assets: [{ name: "Logo.PNG", hash: HASH, type: "png", size: 10 }, { name: "x.svg", hash: HASH, type: "svg", size: 1 }] }));
}

describe("openCanvas", () => {
  it("decodes the stored form and indexes keys, history keys and fonts", () => {
    const c = openCanvas(stored());
    expect(c.profile.Width).toBe(800);
    expect(c.keys).toEqual(["libre.cpu", "libre.gpu"]);
    expect([...c.historyKeys]).toEqual(["libre.gpu"]);
    expect(c.fonts.map((f) => f.font)).toContain("Orbitron");
    const graph = (c.items[1] as Extract<DisplayItem, { kind: "Group" }>).DisplayItems[0];
    expect(keyOf(c, graph)).toBe("libre.gpu");
    expect(keyOf(c, c.items[0])).toBe("libre.cpu");
  });

  it("caches per stored object", () => {
    const raw = stored();
    expect(openCanvas(raw)).toBe(openCanvas(raw));
    expect(openCanvas(stored())).not.toBe(openCanvas(raw));
  });

  it("maps assets by lower-case name to the asset store, none for types it does not take", () => {
    const c = openCanvas(stored());
    expect(c.assets.get("logo.png")).toEqual({ hash: HASH, url: `/api/assets/${HASH}.png` });
    expect(c.assets.get("x.svg")?.url).toBeNull();
  });

  it("throws for something that is not a stored canvas", () => {
    expect(() => openCanvas({ format: "nope" })).toThrow("Not an imported InfoPanel canvas");
  });
});

describe("storedCanvasKeys", () => {
  it("reads the keys straight from the JSON, groups included", () => {
    expect(storedCanvasKeys(stored())).toEqual(["libre.cpu", "libre.gpu"]);
  });

  it("tolerates anything", () => {
    expect(storedCanvasKeys(undefined)).toEqual([]);
    expect(storedCanvasKeys({ items: [null, 1, { $: { key: 5 } }, { DisplayItems: "x" }] })).toEqual([]);
  });
});

describe("assetUrl", () => {
  it("uses the asset store's extensions", () => {
    expect(assetUrl(HASH, "jpeg")).toBe(`/api/assets/${HASH}.jpg`);
    expect(assetUrl(HASH, "bmp")).toBeNull();
  });
});

describe("canvasSensor", () => {
  const sensor = ITEMS[0] as BoundItem;
  const plugin = { ...sensor, SensorType: "Plugin" } as BoundItem;

  it("reads unbound as InfoPanel does", () => {
    expect(canvasSensor(sensor, null, {}, () => [])).toEqual({ reading: null, history: ZEROS });
    expect(canvasSensor(plugin, null, {}, () => [])).toEqual({ reading: null, history: [] });
  });

  it("reads the key's value and history", () => {
    const s = canvasSensor(sensor, "libre.cpu", { "libre.cpu": { value: 42, unit: "°C", min: 1, max: 50, avg: 30 } }, () => [1, 2]);
    expect(s.reading).toEqual({ now: 42, min: 1, max: 50, avg: 30, unit: "°C" });
    expect(s.history).toEqual([1, 2]);
  });
});

describe("KeyHistory", () => {
  it("records numbers per key, once per values object", () => {
    const h = new KeyHistory();
    const v1 = { a: { value: 1 }, b: { text: "x" } };
    h.record(["a", "b"], v1);
    h.record(["a", "b"], v1);
    h.record(["a", "b"], { a: { value: 2 } });
    expect(h.get("a")).toEqual([1, 2]);
    expect(h.get("b")).toEqual([]);
  });

  it("keeps at most InfoPanel's 4096 samples", () => {
    const h = new KeyHistory();
    for (let i = 0; i < 4100; i++) h.record(["a"], { a: { value: i } });
    expect(h.get("a")).toHaveLength(4096);
    expect(h.get("a")[0]).toBe(4);
  });
});

describe("fitScale", () => {
  it("fits keeping the aspect ratio", () => {
    expect(fitScale({ Width: 800, Height: 480 }, 400, 400)).toBe(0.5);
    expect(fitScale({ Width: 800, Height: 480 }, 1600, 480)).toBe(1);
    expect(fitScale({ Width: 0, Height: 480 }, 100, 100)).toBe(1);
  });
});
