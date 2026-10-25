import { describe, expect, it } from "vitest";
import { editItems, importOf, storeItems } from "@/lib/infopanel/canvas-edit";
import { openCanvas } from "@/lib/infopanel/canvas";
import { bindByRoles, componentCanvas, componentPaths, roleOfItem, saveComponent, usedSlots, withComponent } from "@/lib/infopanel/component";
import { newItem } from "@/lib/infopanel/editor/create";
import { itemAt } from "@/lib/infopanel/editor/ops";
import { newComposite } from "@/lib/infopanel/elements/create";
import { defaultPalette } from "@/lib/infopanel/elements/palette";
import { newStored, readStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import type { BoundItem } from "@/lib/infopanel/sensors";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const SENSORS: Record<string, DataApiValue> = {
  "libre.cpu.load": { value: 5, name: "CPU Total", unit: "%", ref: "libre:/amdcpu/0/load/0" },
};

const at = (item: DisplayItem, x: number, y: number, w = 100, h = 40) => ({ ...item, X: x, Y: y, Width: w, Height: h }) as DisplayItem;

function source(items: DisplayItem[], assets: StoredCanvas["assets"] = [], palette = defaultPalette({ BackgroundColor: "#FF0A0A0C", Color: "#FFFFFFFF" })): { stored: StoredCanvas; items: DisplayItem[] } {
  const base = { ...newStored({ name: "Source", width: 800, height: 480 }), assets, palette };
  const stored = storeItems(base, readStored(base).profile, items);
  return { stored, items: editItems(openCanvas(stored)) };
}

const save = (s: ReturnType<typeof source>, selection: string[], name = "Piece") => saveComponent({ stored: s.stored, profile: openCanvas(s.stored).profile, items: s.items, selection, name })!;

describe("saveComponent", () => {
  const image = { ...at(defaultItem("Image"), 300, 200, 64, 64), Name: "logo", Type: "FILE", FilePath: "logo.png", RelativePath: true } as DisplayItem;
  const text = { ...at(defaultItem("Text"), 400, 220, 120, 30), Name: "label" } as DisplayItem;
  const far = at(defaultItem("Shape"), 10, 10, 50, 50);
  const assets = [
    { name: "logo.png", hash: HASH_A, type: "png" as const, size: 4 },
    { name: "unused.png", hash: HASH_B, type: "png" as const, size: 4 },
  ];

  it("re-bases the items to 0,0, sizes the canvas to their bounds and reads back as a v1 stored canvas", () => {
    const made = save(source([far, image, text], assets), ["1", "2"]);
    const read = readStored(JSON.parse(JSON.stringify(made.stored)));
    expect(read.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
    expect([read.profile.Width, read.profile.Height]).toEqual([220, 64]);
    expect(read.items.map((i) => [i.kind, (i as { X: number }).X, (i as { Y: number }).Y])).toEqual([["Image", 0, 0], ["Text", 100, 20]]);
    expect(made.stored.source.origin).toBe("new");
  });

  it("keeps only the files its items use", () => {
    const made = save(source([far, image, text], assets), ["1"]);
    expect(made.stored.assets.map((a) => a.name)).toEqual(["logo.png"]);
    expect(save(source([far, image, text], assets), ["2"]).stored.assets).toEqual([]);
  });

  it("gives each save its own profile identity and leaves the source untouched", () => {
    const s = source([image, text], assets);
    const a = save(s, ["0"]);
    const b = save(s, ["0"]);
    expect(a.stored.profile.Guid).not.toBe(b.stored.profile.Guid);
    expect(s.stored.profile.Name).toBe("Source");
    expect(itemAt(s.items, "0")).toMatchObject({ X: 300, Y: 200 });
  });

  it("uses the measured box of text that sizes itself", () => {
    const auto = at(defaultItem("Text"), 50, 50, 0, 0);
    const s = source([auto]);
    const made = saveComponent({ stored: s.stored, profile: openCanvas(s.stored).profile, items: s.items, selection: ["0"], boxes: { "0": { x: 50, y: 50, width: 300, height: 90 } }, name: "T" })!;
    expect([made.stored.profile.Width, made.stored.profile.Height]).toEqual([300, 90]);
  });

  it("returns null for an empty selection", () => {
    const s = source([image]);
    expect(saveComponent({ stored: s.stored, profile: openCanvas(s.stored).profile, items: s.items, selection: [], name: "x" })).toBeNull();
  });

  it("saves a managed element whole when one of its parts is selected", () => {
    const profile = readStored(newStored({ name: "p", width: 800, height: 480 })).profile;
    const row = newComposite("row", profile, defaultPalette(profile), [], 100, 100);
    const s = source([row]);
    expect(componentPaths(s.items, ["0.0"])).toEqual(["0"]);
  });

  it("records the role of a sensor where the rules know it, by binding group", () => {
    const value = { ...newItem("Sensor", readStored(newStored({ name: "p", width: 10, height: 10 })).profile), SensorType: "Libre", LibreSensorId: "/amdcpu/0/load/0", SensorName: "CPU Total", Unit: "%", Width: 80, Height: 30 } as unknown as BoundItem;
    expect(roleOfItem(value)).toBe("cpu.load");
    const made = save(source([value as unknown as DisplayItem]), ["0"]);
    expect(Object.values(made.roles)).toEqual(["cpu.load"]);
  });

  it("carries the palette slots its items follow", () => {
    const profile = readStored(newStored({ name: "p", width: 800, height: 480 })).profile;
    const bar = newItem("Bar", profile, defaultPalette(profile));
    expect(usedSlots([bar]).sort()).toEqual(["accent1", "track"]);
  });
});

describe("withComponent", () => {
  const logo = { ...at(defaultItem("Image"), 40, 40, 64, 64), Name: "logo", Type: "FILE", FilePath: "logo.png", RelativePath: true } as DisplayItem;
  const bar = { ...newItem("Bar", readStored(newStored({ name: "p", width: 800, height: 480 })).profile, defaultPalette({ BackgroundColor: "#FF0A0A0C", Color: "#FFFFFFFF" })), X: 120, Y: 40, Width: 200, Height: 16 } as DisplayItem;
  const component = () => save(source([logo, bar], [{ name: "logo.png", hash: HASH_A, type: "png", size: 4 }]), ["0", "1"]).stored;
  const target = (palette = defaultPalette({ BackgroundColor: "#FF0A0A0C", Color: "#FFFFFFFF" }), items: DisplayItem[] = [], assets: StoredCanvas["assets"] = []) => {
    const t = source(items, assets, palette);
    return { ...t, profile: openCanvas(t.stored).profile };
  };

  it("lands centred on the point, in front, with the items offset", () => {
    const t = target(undefined, [at(defaultItem("Shape"), 0, 0, 10, 10)]);
    const r = withComponent(t.stored, t.profile, t.items, component(), { at: { x: 400, y: 240 } });
    expect(r.paths).toEqual(["1", "2"]);
    const items = editItems(openCanvas(r.stored));
    // The component is 280 x 64: its top-left is (260, 208).
    expect(items.slice(1).map((i) => [(i as { X: number }).X, (i as { Y: number }).Y])).toEqual([[260, 208], [340, 208]]);
  });

  it("stays on the canvas when dropped near an edge", () => {
    const t = target();
    const r = withComponent(t.stored, t.profile, t.items, component(), { at: { x: 5, y: 5 } });
    expect(editItems(openCanvas(r.stored))[0]).toMatchObject({ X: 0, Y: 0 });
  });

  it("clones: placing twice shares nothing with the component or each other", () => {
    const c = component();
    const before = JSON.stringify(c);
    const t = target();
    const first = withComponent(t.stored, t.profile, t.items, c, { at: { x: 300, y: 200 } });
    const second = withComponent(first.stored, t.profile, editItems(openCanvas(first.stored)), c, { at: { x: 600, y: 300 } });
    expect(JSON.stringify(c)).toBe(before);
    expect(editItems(openCanvas(second.stored))).toHaveLength(4);
  });

  it("merges its files once: the same bytes reuse the name already there", () => {
    const c = component();
    const t = target();
    const first = withComponent(t.stored, t.profile, t.items, c, { at: { x: 300, y: 200 } });
    const second = withComponent(first.stored, t.profile, editItems(openCanvas(first.stored)), c, { at: { x: 600, y: 300 } });
    expect(second.stored.assets).toHaveLength(1);
    expect(second.stored.assets[0]).toMatchObject({ name: "logo.png", hash: HASH_A });
  });

  it("renames a clashing file and points the placed item at it", () => {
    const t = target(undefined, [], [{ name: "logo.png", hash: HASH_B, type: "png", size: 9 }]);
    const r = withComponent(t.stored, t.profile, t.items, component(), { at: { x: 400, y: 240 } });
    expect(r.stored.assets.map((a) => [a.name, a.hash])).toEqual([["logo.png", HASH_B], ["logo (2).png", HASH_A]]);
    expect(editItems(openCanvas(r.stored))[0]).toMatchObject({ FilePath: "logo (2).png" });
  });

  it("maps the palette slots it follows onto the target's palette", () => {
    const palette = { ...defaultPalette({ BackgroundColor: "#FF0A0A0C", Color: "#FFFFFFFF" }), accent1: "#FF112233", track: "#FF445566" };
    const t = target(palette);
    const r = withComponent(t.stored, t.profile, t.items, component(), { at: { x: 400, y: 240 } });
    expect(editItems(openCanvas(r.stored))[1]).toMatchObject({ Color: "#FF112233", BackgroundColor: "#FF445566" });
  });

  it("keeps the sensor records of its bound items", () => {
    const value = { ...newItem("Sensor", readStored(newStored({ name: "p", width: 10, height: 10 })).profile), SensorType: "Libre", LibreSensorId: "/amdcpu/0/load/0", SensorName: "CPU Total", Width: 80, Height: 30, $import: { key: "libre.cpu.load", via: "exact" } } as unknown as DisplayItem;
    const c = save(source([value]), ["0"]).stored;
    const t = target();
    const r = withComponent(t.stored, t.profile, t.items, c, { at: { x: 400, y: 240 } });
    expect(importOf(editItems(openCanvas(r.stored))[0])).toMatchObject({ key: "libre.cpu.load", via: "exact" });
  });
});

describe("bindByRoles", () => {
  const unresolvable = { ...newItem("Sensor", readStored(newStored({ name: "p", width: 10, height: 10 })).profile), SensorType: "Libre", LibreSensorId: "/intelcpu/0/load/0", SensorName: "Package Load" } as unknown as DisplayItem;
  const roles = (_item: DisplayItem) => ({ "libre:/intelcpu/0/load/0|Package Load": "cpu.load" });

  it("binds a group the catalog can't resolve by its saved role", () => {
    const r = bindByRoles([unresolvable], roles(unresolvable), SENSORS);
    expect(r).toMatchObject({ bound: 1, open: 0 });
    expect(importOf(r.items[0])).toMatchObject({ key: "libre.cpu.load" });
    expect(r.items[0]).toMatchObject({ LibreSensorId: "/amdcpu/0/load/0" });
  });

  it("counts a group with no role as left for Remap", () => {
    expect(bindByRoles([unresolvable], {}, SENSORS)).toMatchObject({ bound: 0, open: 1 });
  });

  it("changes nothing while the Data API has no sensors", () => {
    const r = bindByRoles([unresolvable], roles(unresolvable), {});
    expect(r).toMatchObject({ bound: 0, open: 0 });
    expect(r.items[0]).toBe(unresolvable);
  });
});

describe("componentCanvas", () => {
  it("is a stored canvas with an identity of its own", () => {
    const c = save(source([at(defaultItem("Shape"), 0, 0, 20, 20)]), ["0"]).stored;
    const own = componentCanvas(c, "On the desk", new Date("2026-10-25T10:00:00Z"));
    expect(own.source).toMatchObject({ name: "On the desk", origin: "new" });
    expect(own.profile.Guid).not.toBe(c.profile.Guid);
    expect(readStored(JSON.parse(JSON.stringify(own))).issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
  });
});
