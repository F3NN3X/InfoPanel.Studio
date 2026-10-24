import { describe, expect, it } from "vitest";
import { loadExport, entriesFromZip } from "@/lib/infopanel/archive.ts";
import { withNewItem } from "@/lib/infopanel/canvas-edit.ts";
import { centred, insertItem, namedFor, newItem, PALETTE } from "@/lib/infopanel/editor/create.ts";
import { infopanelExport } from "@/lib/infopanel/export/write.ts";
import { newStored, readStored } from "@/lib/infopanel/import/stored.ts";
import { defaultItem, SCHEMAS, type DisplayItem, type GroupItem } from "@/lib/infopanel/schema.ts";

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
    expect(newItem("Donut", profile)).toMatchObject({ Frame: false, BackgroundColor: "#FFDCDCDC", Width: 100, Height: 100, Rotation: 90 });
    expect(newItem("Bar", profile)).toMatchObject({ Width: 400, Height: 50, MinValue: 0, MaxValue: 100, Frame: true, Background: true });
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
    expect(centred(newItem("Shape", profile), profile)).toMatchObject({ X: 350, Y: 190 });
    const t = centred(newItem("Text", profile), profile);
    expect(t.X).toBeGreaterThan(0);
    expect(t.X).toBeLessThan(400);
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
    expect(back.items).toEqual(items);
    expect(back.profile).toEqual(profile);
    expect(back.issues.filter((i) => i.code !== "unknown-field")).toEqual([]);
  });
});
