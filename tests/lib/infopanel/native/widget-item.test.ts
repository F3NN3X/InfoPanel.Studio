// Studio widgets on a Free page (one-editor SPEC §3.3): the widget item helpers, its `$.widget` record through the
// stored form, and the writer leaving any unconverted one out of an .infopanel.
import { describe, expect, it } from "vitest";
import { newItem } from "@/lib/infopanel/editor/create";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema";
import { decodeWidget, newStored, readStored, toStored, type StoreInput } from "@/lib/infopanel/import/stored";
import { displayItemsXml, infopanelExport } from "@/lib/infopanel/export/write";
import { storeItems } from "@/lib/infopanel/canvas-edit";
import { storedCanvasWidgets } from "@/lib/infopanel/canvas-keys";
import {
  isWidgetItem,
  newWidgetItem,
  replaceWidgets,
  widgetBox,
  widgetChoices,
  widgetOf,
  widgetPaths,
  widgetRule,
  withWidget,
  withoutWidgets,
} from "@/lib/infopanel/native/widget-item";

const base = newStored({ name: "Arc", width: 800, height: 480, now: new Date("2026-10-26T00:00:00Z") });
const { profile } = readStored(base);
const weather = newWidgetItem({ module: "Weather", settings: { units: "metric" } }, { x: 10.4, y: 20, w: 310, h: 150 }, "Weather");
const text = newItem("Text", profile);
const group = (...kids: DisplayItem[]) => ({ ...defaultItem("Group"), Name: "G", DisplayItems: kids }) as DisplayItem;

const input = (items: DisplayItem[]): StoreInput => ({
  name: "Arc", origin: "file", dataApi: null, defaultMode: "infopanel", profile, items, assets: new Map(), keyOf: () => null, fonts: [],
  now: new Date("2026-10-26T00:00:00Z"),
});
const roundTrip = (items: DisplayItem[]) => readStored(JSON.parse(JSON.stringify(toStored(input(items)))));

describe("widget items", () => {
  it("is an Image at its box, named, holding the widget", () => {
    expect(weather).toMatchObject({ kind: "Image", Name: "Weather", X: 10, Y: 20, Width: 310, Height: 150, FilePath: null });
    expect(widgetOf(weather)).toEqual({ module: "Weather", settings: { units: "metric" } });
    expect(isWidgetItem(weather)).toBe(true);
    expect(isWidgetItem(text)).toBe(false);
    expect(widgetOf(undefined)).toBeNull();
    // The record only counts on an Image.
    expect(widgetOf({ ...text, widget: { module: "Weather" } } as unknown as DisplayItem)).toBeNull();
  });

  it("measures its box at its Scale, never below 1 px", () => {
    expect(widgetBox(weather)).toEqual({ x: 10, y: 20, w: 310, h: 150 });
    expect(widgetBox({ ...weather, Scale: 50 } as DisplayItem)).toEqual({ x: 10, y: 20, w: 155, h: 75 });
    expect(newWidgetItem({ module: "Clock" }, { x: 0, y: 0, w: 0, h: -3 }, "Clock")).toMatchObject({ Width: 1, Height: 1 });
  });

  it("replaces the record on an Image only", () => {
    expect(widgetOf(withWidget(weather, { module: "Weather", onInfoPanel: "snapshot" }))?.onInfoPanel).toBe("snapshot");
    expect(withWidget(text, { module: "Weather" })).toBe(text);
  });

  it("defaults to the first rule its tier offers (decision D2), and keeps an offered choice", () => {
    expect(widgetRule({ module: "Weather" })).toBe("recreate");
    expect(widgetRule({ module: "Weather", onInfoPanel: "leave" })).toBe("leave");
    expect(widgetRule({ module: "Timer" })).toBe("leave");
    // A choice the tier doesn't offer falls back to the default.
    expect(widgetRule({ module: "Timer", onInfoPanel: "recreate" })).toBe("leave");
    expect(widgetChoices("Timer")).toEqual(["leave", "snapshot"]);
    expect(widgetRule({ module: "panel" })).toBe("recreate");
    expect(widgetRule({ module: "panel", onInfoPanel: "snapshot" })).toBe("snapshot");
    expect(widgetChoices("panel")).toEqual(["recreate", "snapshot", "leave"]);
  });

  it("finds widget items in groups, and replaces each in its place", () => {
    const items = [text, group(text, weather), weather];
    expect(widgetPaths(items)).toEqual(["1.1", "2"]);
    const out = replaceWidgets(items, (_, path) => (path === "2" ? [text, text] : []));
    expect(out).toHaveLength(4);
    expect((out[1] as Extract<DisplayItem, { kind: "Group" }>).DisplayItems).toEqual([text]);
    expect(withoutWidgets(items).flatMap((i) => (i.kind === "Group" ? i.DisplayItems : [i])).some(isWidgetItem)).toBe(false);
  });

  it("returns the same items when there are no widgets, so an unedited profile writes the same bytes", () => {
    const items = [text, group(text)];
    expect(replaceWidgets(items, () => [])).toBe(items);
    expect(withoutWidgets(items)).toBe(items);
  });
});

describe("$.widget in the stored form", () => {
  it("round-trips the widget record under $", () => {
    const full = withWidget(weather, {
      module: "Weather",
      settings: { units: "metric", compact: true, size: 2 },
      design: { accent: "#ff0000", background: "panel", header: true },
      follow: { colors: false },
      onInfoPanel: "snapshot",
    });
    const stored = toStored(input([text, full]));
    expect(stored.items[1].$).toEqual({ widget: widgetOf(full) });
    expect(stored.items[1]).not.toHaveProperty("widget");
    const back = readStored(JSON.parse(JSON.stringify(stored)));
    expect(back.items).toEqual([text, full]);
    expect(back.issues).toEqual([]);
  });

  it("keeps a widget inside a group, and through the editor's store", () => {
    const back = roundTrip([group(weather)]);
    expect(widgetPaths(back.items)).toEqual(["0.0"]);
    const again = readStored(JSON.parse(JSON.stringify(storeItems(base, profile, back.items))));
    expect(again.items).toEqual(back.items);
  });

  it("drops a widget on anything but an Image, and reports it", () => {
    const stored = JSON.parse(JSON.stringify(toStored(input([text])))) as { items: { $?: unknown }[] };
    stored.items[0].$ = { widget: { module: "Weather" } };
    const back = readStored({ ...base, items: stored.items });
    expect(back.items[0]).not.toHaveProperty("widget");
    expect(back.issues).toEqual([expect.objectContaining({ code: "invalid-value", field: "$.widget" })]);
  });

  it("drops a record that isn't one, and keeps the Image (what an older build sees)", () => {
    const stored = JSON.parse(JSON.stringify(toStored(input([weather])))) as { items: { $?: unknown }[] };
    stored.items[0].$ = { widget: { module: "../evil" } };
    const back = readStored({ ...base, items: stored.items });
    expect(back.items[0]).toMatchObject({ kind: "Image", Name: "Weather", Width: 310 });
    expect(back.items[0]).not.toHaveProperty("widget");
    expect(back.issues.map((i) => i.field)).toEqual(["$.widget"]);
  });

  it("checks each field: a bad optional one is dropped, the rest kept", () => {
    expect(decodeWidget(null)).toBeNull();
    expect(decodeWidget({ module: "" })).toBeNull();
    expect(decodeWidget({ module: 3 })).toBeNull();
    expect(
      decodeWidget({
        module: "Clock",
        settings: { ok: "x", n: 2, nan: Number.NaN, obj: { a: 1 }, long: "y".repeat(20_000) },
        design: { accent: "#fff", background: "glass", header: "yes" },
        follow: { colors: false, "bad key": true, size: "no" },
        panel: { title: "no widgets" },
        onInfoPanel: "explode",
      }),
    ).toEqual({ module: "Clock", settings: { ok: "x", n: 2 }, design: { accent: "#fff" }, follow: { colors: false } });
    expect(decodeWidget({ module: "panel", panel: { widgets: [] } })).toEqual({ module: "panel", panel: { widgets: [] } });
  });

  it("is listed by the zone's subscription straight from the JSON", () => {
    expect(storedCanvasWidgets(toStored(input([text, group(weather)])))).toEqual([{ module: "Weather", settings: { units: "metric" } }]);
    expect(storedCanvasWidgets(null)).toEqual([]);
  });
});

describe("the .infopanel writer", () => {
  it("leaves out a widget item nothing converted: InfoPanel would show an empty Image", () => {
    const out = infopanelExport(profile, [text, weather, group(weather)], []);
    expect(out).toEqual(infopanelExport(profile, [text, group()], []));
    expect(displayItemsXml([text, group()])).not.toContain("ImageDisplayItem");
  });
});
