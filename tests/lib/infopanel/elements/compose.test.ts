import { describe, expect, it } from "vitest";
import { entriesFromZip, loadExport } from "@/lib/infopanel/archive.ts";
import { storeItems } from "@/lib/infopanel/canvas-edit.ts";
import { applyElement, badgeOf, elementOf, ringVector } from "@/lib/infopanel/elements/apply.ts";
import { staleElements } from "@/lib/infopanel/elements/bake.ts";
import { rowLayout, drivesLayout } from "@/lib/infopanel/elements/compose.ts";
import { elementSize, gradientBar, newComposite, newElement, type CompositeType } from "@/lib/infopanel/elements/create.ts";
import { detectDrives } from "@/lib/infopanel/elements/drives.ts";
import type { RingSpec, RowSpec, SparklineSpec } from "@/lib/infopanel/elements/spec.ts";
import { colorOf } from "@/lib/infopanel/gauges/vector.ts";
import { newItem } from "@/lib/infopanel/editor/create.ts";
import { newStored, readStored } from "@/lib/infopanel/import/stored.ts";
import type { DisplayItem, GroupItem } from "@/lib/infopanel/schema.ts";
import type { DataApiValue } from "@/lib/infopanel/sensors.ts";
import { COMPOSITES, elementExport } from "../export/element-cases.ts";
import { walkItems } from "@/lib/infopanel/parse.ts";
import type { GaugeItem, ImageItem } from "@/lib/infopanel/schema.ts";
import { palette, profile } from "./fixture.ts";

const drive = (n: number, name: string): Record<string, DataApiValue> => ({
  [`used${n}`]: { value: 40, unit: "%", name: `${name} Used Space`, ref: `libre:/nvme/${n}/load/${50 + n}` },
  [`free${n}`]: { value: 900, unit: "GB", name: `${name} Free Space`, ref: `libre:/nvme/${n}/data/${3 + n}` },
  [`temp${n}`]: { value: 44, unit: "°C", name: `${name} Composite Temperature`, ref: `libre:/nvme/${n}/temperature/0` },
  [`warn${n}`]: { value: 80, unit: "°C", name: `${name} Warning Temperature`, ref: `libre:/nvme/${n}/temperature/10` },
});
const sensors = { ...drive(3, "Disk B"), ...drive(2, "Disk A") };

const TYPES: CompositeType[] = ["row", "rows", "stack", "dual", "doublering", "drives", "shadowtext"];
const make = (type: CompositeType) => newComposite(type, profile, palette, type === "drives" ? detectDrives(sensors) : [], 20, 30);
const kidsOf = (g: DisplayItem) => (g as GroupItem).DisplayItems;

describe("each composite as InfoPanel items", () => {
  it.each([
    ["row", ["Text", "Sensor", "Bar"], "native"],
    ["rows", ["Group", "Group", "Group", "Group"], "native"],
    ["stack", ["Text", "Graph", "Text", "Graph", "Text", "Graph"], "native"],
    ["dual", ["Graph", "Graph"], "native"],
    ["doublering", ["Gauge", "Gauge", "Sensor"], "baked"],
    ["drives", ["Group", "Group"], "native"],
    ["shadowtext", ["Sensor", "Sensor"], "approximated"],
  ] as const)("%s is a Group of %j, badge %s", (type, kinds, badge) => {
    const g = make(type);
    expect(g.kind).toBe("Group");
    expect(kidsOf(g).map((k) => k.kind)).toEqual(kinds);
    expect(badgeOf(g)!.kind).toBe(badge);
    expect(elementSize(elementOf(g)!).width).toBeGreaterThan(0);
  });

  it("survives the stored form, and a spec that can't be read is dropped with an issue", () => {
    const items = TYPES.map(make);
    const stored = JSON.parse(JSON.stringify(storeItems(newStored({ name: "C", width: 800, height: 480 }), profile, items)));
    const read = readStored(stored);
    expect(read.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
    expect(read.items.map((i) => elementOf(i)?.type)).toEqual(TYPES);
    stored.items[4].$.element = { type: "doublering", outer: [] };
    const bad = readStored(stored);
    expect(bad.issues.map((i) => i.code)).toContain("invalid-value");
    expect(elementOf(bad.items[4])).toBeNull();
  });
});

describe("Row", () => {
  const spec = (g: GroupItem) => elementOf(g) as RowSpec;
  const row = make("row") as GroupItem;

  it("lays the label left and the value right-aligned, the bar along the bottom", () => {
    const [label, value, bar] = row.DisplayItems as unknown as Record<string, number>[];
    const L = rowLayout(spec(row));
    expect(label).toMatchObject({ X: 20, RightAlign: false });
    expect(value).toMatchObject({ X: 20 + 240 - L.valueW, Width: L.valueW, RightAlign: true });
    expect(bar).toMatchObject({ X: 20, Y: 30 + 28 - L.barH, Width: 240, Height: L.barH });
    expect(label.X + label.Width).toBeLessThanOrEqual(value.X);
  });

  it("relays out on a resize, adds the icon image, and drops the bar", () => {
    const wide = applyElement({ ...row, element: { ...spec(row), width: 400, icon: "cpu", bar: false } } as unknown as DisplayItem) as GroupItem;
    expect(wide.DisplayItems.map((k) => k.kind)).toEqual(["Text", "Sensor", "Image"]);
    const L = rowLayout(spec(wide));
    expect(wide.DisplayItems[1]).toMatchObject({ X: 20 + 400 - L.valueW });
    expect(wide.DisplayItems[0]).toMatchObject({ X: 20 + L.indent });
    expect(wide.DisplayItems[2]).toMatchObject({ Width: L.iconS, Height: L.iconS, X: 20 });
    expect(staleElements([wide])).toEqual(["0.2"]);
  });

  it("keeps the label's text and the value's sensor through a relayout, and the bar follows the value's sensor", () => {
    const bound = { ...row, DisplayItems: row.DisplayItems.map((k, i) => (i === 0 ? { ...k, Name: "CPU" } : i === 1 ? { ...k, SensorType: "Libre", LibreSensorId: "/amdcpu/0/load/0" } : k)) } as GroupItem;
    const again = applyElement({ ...bound, X: 50 } as DisplayItem) as GroupItem;
    expect(again.DisplayItems[0]).toMatchObject({ Name: "CPU", X: 50 });
    expect(again.DisplayItems[2]).toMatchObject({ SensorType: "Libre", LibreSensorId: "/amdcpu/0/load/0" });
  });

  it("Rows spaces N rows evenly and follows a count change", () => {
    const rows = make("rows") as GroupItem;
    expect(rows.DisplayItems.map((r) => r.Y)).toEqual([30, 62, 94, 126]);
    const six = applyElement({ ...rows, element: { ...elementOf(rows)!, count: 2 } } as unknown as DisplayItem) as GroupItem;
    expect(six.DisplayItems).toHaveLength(2);
  });
});

describe("Drives", () => {
  it("finds the drives in device order, with names, used, free and the composite temperature", () => {
    const found = detectDrives(sensors);
    expect(found.map((d) => [d.id, d.name, d.used?.key, d.free?.key, d.temp?.key])).toEqual([
      ["/nvme/2", "Disk A", "used2", "free2", "temp2"],
      ["/nvme/3", "Disk B", "used3", "free3", "temp3"],
    ]);
    expect(detectDrives({})).toEqual([]);
  });

  it("finds HWiNFO drives by their group names when no Libre drive is there (written from HWiNFO's naming, not a real capture)", () => {
    const hw = (name: string, unit: string): DataApiValue => ({ value: 1, unit, name, ref: "hwinfo:0/1/2/3" });
    const found = detectDrives({
      t: hw("Drive: Model X 2TB · Drive Temperature", "°C"),
      a: hw("Drive: Model X 2TB · Total Activity", "%"),
      life: hw("S.M.A.R.T.: Model X 2TB · Drive Remaining Life", "%"),
      t2: hw("Drive: Model Y 1TB - Drive Temperature", "°C"),
      cpu: hw("CPU Package Temp", "°C"),
    });
    expect(found.map((d) => [d.name, d.used?.key, d.temp?.key, d.free])).toEqual([
      ["Model X 2TB", "a", "t", undefined],
      ["Model Y 1TB", undefined, "t2", undefined],
    ]);
  });

  it("binds each tile natively, lays the tiles out and relays them out on a resize", () => {
    const drives = make("drives") as GroupItem;
    const tiles = drives.DisplayItems as GroupItem[];
    expect(tiles.map((t) => t.Name)).toEqual(["Disk A", "Disk B"]);
    expect(tiles[0].DisplayItems.map((k) => k.kind)).toEqual(["Shape", "Image", "Text", "Bar", "Sensor", "Sensor", "Sensor"]);
    expect(tiles[0].DisplayItems[4]).toMatchObject({ SensorType: "Libre", LibreSensorId: "/nvme/2/load/52" });
    expect(tiles[0].DisplayItems[3]).toMatchObject({ LibreSensorId: "/nvme/2/load/52" });
    expect(tiles[1].DisplayItems[6]).toMatchObject({ LibreSensorId: "/nvme/3/data/6" });
    const [a, b] = drivesLayout(elementOf(drives) as never, 20, 30, 2);
    expect(tiles[0].DisplayItems[0]).toMatchObject({ X: a.x, Y: a.y, Width: a.width, Height: a.height });
    expect(b.x).toBe(a.x + a.width + 12);
    const tall = applyElement({ ...drives, element: { ...elementOf(drives)!, orientation: "vertical", width: 200, height: 300 } } as unknown as DisplayItem) as GroupItem;
    expect((tall.DisplayItems[1] as GroupItem).DisplayItems[0]).toMatchObject({ X: 20, Width: 200 });
    expect((tall.DisplayItems[1] as GroupItem).DisplayItems[0].Y).toBeGreaterThan(30 + 100);
  });

  it("shows placeholder tiles, unbound, when no drive is found", () => {
    const none = newComposite("drives", profile, palette, [], 0, 0);
    expect(none.DisplayItems).toHaveLength(3);
  });
});

describe("thresholds on a ring", () => {
  const ring = {
    ...(elementOf(newElement("ring", profile, palette)) as RingSpec),
    fill: [{ color: "#FF00FF00" }],
    thresholds: [{ at: 70, ink: { color: "#FFFFAA00" } }, { at: 90, ink: { color: "#FFFF0000" } }],
  };
  const g = ringVector(ring, 100, 100);

  it("colours a frame by its value at the boundaries", () => {
    const at = (v: number) => colorOf(g, v, v);
    expect([0, 69.9, 70, 89.9, 90, 100].map(at)).toEqual(["#00FF00", "#00FF00", "#FFAA00", "#FFAA00", "#FF0000", "#FF0000"]);
  });

  it("is still baked, with no end dot to disagree with the colour", () => {
    expect(g.dot).toBeUndefined();
    expect(badgeOf(applyElement({ ...newElement("ring", profile, palette), element: ring } as unknown as DisplayItem))!.kind).toBe("baked");
  });
});

describe("Sparkline styles", () => {
  const spark = (patch: Partial<SparklineSpec>) =>
    applyElement({ ...newElement("sparkline", profile, palette), element: { ...(elementOf(newElement("sparkline", profile, palette)) as SparklineSpec), ...patch } } as unknown as DisplayItem);

  it("bars are InfoPanel's histogram, native, with the fill's opacity", () => {
    const bars = spark({ style: "bars", dot: false, gradient: false, fillAlpha: 0.5 });
    expect(bars).toMatchObject({ Type: "HISTOGRAM", Fill: true });
    expect((bars as unknown as { FillColor: string }).FillColor.slice(1, 3)).toBe("80");
    expect(badgeOf(bars)!.kind).toBe("native");
    expect(spark({ style: "line", dot: false, gradient: false })).toMatchObject({ Type: "LINE", Fill: false });
  });
});

describe("Shadow text", () => {
  it("keeps a copy behind the text, offset, dark and on the same sensor", () => {
    const g = make("shadowtext") as GroupItem;
    const bound = { ...g, DisplayItems: [g.DisplayItems[0], { ...g.DisplayItems[1], SensorType: "Libre", LibreSensorId: "/amdcpu/0/load/0", X: 100, Y: 100 }] } as GroupItem;
    const [shadow, text] = (applyElement(bound) as GroupItem).DisplayItems as unknown as Record<string, unknown>[];
    expect(shadow).toMatchObject({ X: 101, Y: 102, Color: "#99000000", LibreSensorId: "/amdcpu/0/load/0", GlowEnabled: false });
    expect(text).toMatchObject({ X: 100, Y: 100 });
  });
});

describe("the new elements exported, then parsed", () => {
  it("reads back as InfoPanel items only, every baked file present and referenced relatively", async () => {
    const out = await elementExport(profile);
    const back = await loadExport(entriesFromZip(out.bytes));
    expect(back.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
    expect(back.items.map((i) => i.kind)).toEqual([...COMPOSITES.map(() => "Group"), "Gauge", "Gauge", "Graph"]);
    expect(back.items.at(-1)).toMatchObject({ Type: "HISTOGRAM" });
    const names = new Set(back.assets.keys());
    const files = [...walkItems(back.items)].flatMap(({ item }) => (item.kind === "Image" ? [item as ImageItem] : item.kind === "Gauge" ? (item as GaugeItem).Images : []));
    expect(files.length).toBeGreaterThan(6);
    for (const f of files) expect(f.RelativePath && names.has(f.FilePath!.toLowerCase()), f.FilePath ?? "").toBe(true);
    expect(new TextDecoder().decode(out.bytes)).not.toMatch(/doublering|shadowtext|innerThresholds|fillAlpha/);
  });
});

describe("the gradient progress bar preset", () => {
  it("rounds a Bar to half its height with a gradient, and changes nothing else about the kind", () => {
    const bar = gradientBar({ ...newItem("Bar", profile, palette), Height: 17 } as DisplayItem, palette);
    expect(bar).toMatchObject({ kind: "Bar", CornerRadius: 8, Gradient: true, GradientColor: palette.accent2, Color: palette.accent1, Frame: false });
    expect(gradientBar(newItem("Text", profile, palette), palette).kind).toBe("Text");
  });
});
