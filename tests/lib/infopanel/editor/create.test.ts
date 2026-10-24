import { describe, expect, it } from "vitest";
import { loadExport, entriesFromZip } from "@/lib/infopanel/archive.ts";
import { withNewItem } from "@/lib/infopanel/canvas-edit.ts";
import { centred, insertItem, namedFor, newItem, PALETTE, placed } from "@/lib/infopanel/editor/create.ts";
import { ACCENT, lookOf } from "@/lib/infopanel/editor/look.ts";
import { checkValue } from "@/lib/infopanel/editor/registry.ts";
import { infopanelExport } from "@/lib/infopanel/export/write.ts";
import { newStored, readStored } from "@/lib/infopanel/import/stored.ts";
import { defaultItem, SCHEMAS, type DisplayItem, type FieldSpec, type GroupItem } from "@/lib/infopanel/schema.ts";

const profile = readStored(newStored({ name: "Desk", width: 800, height: 480 })).profile;
const group = (name: string, kids: DisplayItem[], locked = false): GroupItem => ({ ...defaultItem("Group"), Name: name, IsLocked: locked, DisplayItems: kids });
const text = (name: string): DisplayItem => ({ ...defaultItem("Text"), Name: name });

describe("the Add palette", () => {
  it("lists every native kind once", () => {
    expect(PALETTE.map((p) => p.kind).sort()).toEqual(Object.keys(SCHEMAS).sort());
  });
});

describe("newItem (InfoPanel's creation defaults)", () => {
  it("gives text kinds the profile's font, size and colour", () => {
    for (const kind of ["Text", "Sensor", "Clock", "Calendar"] as const) {
      expect(newItem(kind, profile)).toMatchObject({ Font: "Segoe UI", FontSize: 26, Color: "#FFFFFFFF" });
    }
    expect(newItem("Text", profile).Name).toBe("Custom Text");
    expect(newItem("Clock", profile)).toMatchObject({ Uppercase: true, Format: "hh:mm:ss tt" });
    expect(newItem("Calendar", profile)).toMatchObject({ Uppercase: true, Format: "dd/MM/yyyy" });
  });

  it("makes Donut, Bar and the sensor images as InfoPanel's constructors do", () => {
    expect(newItem("Donut", profile)).toMatchObject({ Frame: false, Width: 100, Height: 100, Rotation: 90 });
    expect(newItem("Bar", profile)).toMatchObject({ MinValue: 0, MaxValue: 100, Background: true });
    expect(newItem("Graph", profile)).toMatchObject({ Type: "LINE" });
    expect(newItem("SensorImage", profile)).toMatchObject({ Width: 100, Height: 100, Threshold1: 0, Threshold2: 100 });
    expect(newItem("HttpImage", profile)).toMatchObject({ Width: 100, Height: 100 });
    expect(newItem("Group", profile)).toMatchObject({ Name: "New Group", DisplayItems: [] });
  });

  it("names a sensor item for its sensor, and a value takes its unit", () => {
    expect(namedFor(newItem("Sensor", profile), { name: "CPU Package", unit: "°C" })).toMatchObject({ Name: "CPU Package", Unit: "°C" });
    expect(namedFor(newItem("Bar", profile), { name: "GPU Load", unit: "%" })).not.toHaveProperty("Unit");
  });

  it("centres an item with a box, and estimates text", () => {
    expect(centred(newItem("Shape", profile), profile)).toMatchObject({ X: 300, Y: 180 });
    const t = centred(newItem("Text", profile), profile);
    expect(t.X).toBeGreaterThan(0);
    expect(t.X).toBeLessThan(400);
  });
});

describe("the styled new-item look", () => {
  const look = lookOf(profile);

  it("derives the track and card from the profile, and fills with one accent", () => {
    // Near black #0A0A0C moved 14 % and 7 % toward white text.
    expect(look).toEqual({ text: "#FFFFFFFF", accent: ACCENT, track: "#FF2C2C2E", card: "#FF1B1B1D" });
    for (const kind of ["Bar", "Graph", "Donut"] as const) {
      expect(newItem(kind, profile)).toMatchObject({ Frame: false, Background: true, BackgroundColor: look.track, Color: ACCENT });
    }
    expect(newItem("Bar", profile)).toMatchObject({ Gradient: false });
    expect(newItem("Shape", profile)).toMatchObject({ FillColor: look.card, ShowFrame: false, ShowGradient: false, CornerRadius: 12 });
    expect(newItem("TableSensor", profile)).toMatchObject({ Font: "Segoe UI", Color: "#FFFFFFFF" });
    expect(newItem("Gauge", profile)).toMatchObject({ vector: { track: "#2C2C2E", fill: { mode: "solid", color: "#3B82F6" } } });
  });

  it.each(PALETTE.map((p) => p.kind))("%s passes InfoPanel's setter checks and survives export, then parse", async (kind) => {
    const item = newItem(kind, profile);
    for (const [field, spec] of Object.entries(SCHEMAS[kind] as Record<string, FieldSpec<unknown>>)) {
      const value = (item as unknown as Record<string, unknown>)[field];
      if (value === null) continue;
      expect(checkValue(spec, value), field).toEqual({ ok: true, value });
    }
    const { vector: _studioOnly, slots: _slots, ...plain } = item as DisplayItem & { vector?: unknown; slots?: unknown };
    const back = await loadExport(entriesFromZip(infopanelExport(profile, [item], [])));
    expect(back.items).toEqual([plain]);
  });
});

describe("placed (where a new item lands)", () => {
  it("centres on a drop point, then takes the snap's shift", () => {
    const shape = newItem("Shape", profile);
    expect(placed(shape, profile, { x: 150, y: 100 })).toMatchObject({ X: 50, Y: 40 });
    expect(placed(shape, profile, { x: 150, y: 100 }, () => ({ dx: -2, dy: 3 }))).toMatchObject({ X: 48, Y: 43 });
    const g = newItem("Group", profile);
    expect(placed(g, profile, { x: 1, y: 1 })).toBe(g);
  });
});

describe("insertItem (AddDisplayItem's rules)", () => {
  const items = [text("a"), group("g", [text("b")]), group("locked", [text("c")], true)];

  it("goes into the selected group, at its end", () => {
    const r = insertItem(items, text("new"), "1");
    expect(r.path).toBe("1.1");
    expect((r.items[1] as GroupItem).DisplayItems.map((i) => i.Name)).toEqual(["b", "new"]);
  });

  it("goes into the group holding the selected item", () => {
    expect(insertItem(items, text("new"), "1.0").path).toBe("1.1");
  });

  it("goes to the top level's end when the group is locked, nothing or a top-level item is selected", () => {
    for (const sel of ["2", "2.0", "0", null]) {
      const r = insertItem(items, text("new"), sel);
      expect(r.path).toBe("3");
      expect(r.items[3].Name).toBe("new");
    }
  });

  it("never puts a group in a group: after a selected top-level item, else at the end", () => {
    expect(insertItem(items, group("n", []), "0").path).toBe("1");
    expect(insertItem(items, group("n", []), "1.0").path).toBe("3");
    expect(insertItem(items, group("n", []), null).path).toBe("3");
  });
});

describe("a profile from scratch, exported", () => {
  it("keeps every kind's creation defaults through .infopanel and back", async () => {
    let items: DisplayItem[] = [];
    for (const { kind } of PALETTE) items = withNewItem(items, profile, newItem(kind, profile), null).items;
    const back = await loadExport(entriesFromZip(infopanelExport(profile, items, [])));
    // A new gauge's ring is a vector spec (studio-only), baked to frames by the Export dialog; the palette slots are studio-only too.
    expect(back.items).toEqual(items.map(({ vector: _v, slots: _s, ...plain }: DisplayItem & { vector?: unknown; slots?: unknown }) => plain));
    expect(back.profile).toEqual(profile);
    expect(back.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
  });
});
