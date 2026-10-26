// @vitest-environment happy-dom
// A Free page's Studio widgets in an .infopanel export (one-editor SPEC §7.4): each by its rule, in its place.
import { describe, expect, it, vi } from "vitest";

// One transparent pixel: the picture the conversion takes of a widget.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
vi.mock("modern-screenshot", () => ({ domToPng: vi.fn(async () => PNG) }));

import { assetFile, type AssetTable } from "@/lib/infopanel/assets/assets";
import { newItem } from "@/lib/infopanel/editor/create";
import { newStored, readStored } from "@/lib/infopanel/import/stored";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema";
import { exportWidgets, withRule } from "@/lib/infopanel/native/widget-export";
import { joinFiles, newWidgetItem, placeConverted, widgetPaths } from "@/lib/infopanel/native/widget-item";
import { readChoices } from "@/lib/infopanel/export/native-choices";
import { knownWidget, widgetPlacement } from "@/components/studio/placement-content";

const { profile } = readStored(newStored({ name: "Arc", width: 800, height: 480 }));
const text = newItem("Text", profile);
const widget = (module: string, onInfoPanel?: "recreate" | "snapshot" | "leave") =>
  newWidgetItem({ module, ...(onInfoPanel ? { onInfoPanel } : {}) }, { x: 40, y: 60, w: 300, h: 150 }, module);

/** The editor's canvas root with the widget items it draws (`data-widget-item`). */
function root(paths: string[]): HTMLElement {
  const el = document.createElement("div");
  for (const p of paths) {
    const w = document.createElement("div");
    w.dataset.widgetItem = p;
    el.append(w);
  }
  document.body.append(el);
  return el;
}

const request = (r: ParentNode | null) => ({ root: r, sensors: {}, look: profile, zoneOf: widgetPlacement, known: knownWidget });

describe("exportWidgets", () => {
  it("leaves the document alone without widget items", async () => {
    const doc = { items: [text], assets: new Map() as AssetTable };
    const out = await exportWidgets(doc, request(null));
    expect(out.doc).toBe(doc);
    expect(out.report).toEqual([]);
  });

  it("pictures a snapshot in its place, and leaves out Leave out, a widget it doesn't have and one that isn't drawn", async () => {
    const items = [text, widget("Weather", "snapshot"), widget("Timer"), widget("FutureWidget"), widget("Weather")];
    const out = await exportWidgets({ items, assets: new Map() }, request(root(["1", "2"])));
    expect(out.doc.items).toHaveLength(2);
    expect(out.doc.items[0]).toBe(text);
    const shot = out.doc.items[1] as Extract<DisplayItem, { kind: "Image" }>;
    expect(shot).toMatchObject({ kind: "Image", Name: "Weather", Type: "FILE", RelativePath: true });
    expect(widgetPaths(out.doc.items)).toEqual([]);
    expect([...out.doc.assets.values()].map((a) => a.name)).toEqual([shot.FilePath]);
    expect(out.report.map((r) => [r.name, r.rule, r.outcome])).toEqual([
      ["Weather", "snapshot", "a picture of it now"],
      ["Timer", "leave", "left out"],
      ["FutureWidget", "leave", "left out: not available in this version"],
      ["Weather", "recreate", "left out: it isn't drawn"],
    ]);
  });
});

describe("the pieces", () => {
  it("passes the rule to the conversion as the zone's stored choice", () => {
    expect(readChoices(withRule(widgetPlacement({ module: "Weather" }), "snapshot").settings)).toEqual({ zone: "snapshot" });
    const panel = widgetPlacement({ module: "panel", panel: { widgets: [{ id: "a", kind: "text", visible: true }, { id: "b", kind: "text", visible: true }] } });
    expect(readChoices(withRule(panel, "leave").settings)).toEqual({ a: "leave", b: "leave" });
  });

  it("joins picture files without clashing: the same bytes reuse a name, other bytes get a free one", async () => {
    const a = await assetFile("Weather_1.png", new Uint8Array([1, 2, 3]), "added");
    const b = await assetFile("Weather_1.png", new Uint8Array([4, 5, 6]), "added");
    const img = { ...defaultItem("Image"), FilePath: "Weather_1.png" } as DisplayItem;
    const once = joinFiles(new Map([["weather_1.png", a]]), [a], [img]);
    expect([...once.assets.keys()]).toEqual(["weather_1.png"]);
    const twice = joinFiles(once.assets, [b], [img]);
    expect([...twice.assets.keys()]).toEqual(["weather_1.png", "weather_1_2.png"]);
    expect((twice.items[0] as { FilePath: string }).FilePath).toBe("Weather_1_2.png");
  });

  it("splices a recreate in as one Group named after the widget, a snapshot as its Image", () => {
    const host = widget("Weather");
    const made = [newItem("Text", profile), newItem("Sensor", profile)];
    expect(placeConverted(made, host, "recreate")).toEqual([expect.objectContaining({ kind: "Group", Name: "Weather", X: 40, Y: 60, DisplayItems: made })]);
    const group = { ...defaultItem("Group"), Name: "Weather background", DisplayItems: made } as DisplayItem;
    expect(placeConverted([group], host, "recreate")).toEqual([{ ...group, Name: "Weather" }]);
    expect(placeConverted([defaultItem("Image")], host, "snapshot")[0].Name).toBe("Weather");
    expect(placeConverted([], host, "recreate")).toEqual([]);
  });
});
