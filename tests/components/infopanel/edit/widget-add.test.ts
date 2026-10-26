// Adding Studio widgets to a Free page (one-editor SPEC §5.3) and editing them as zones (§5.5).
import { describe, expect, it } from "vitest";
import { addCatalog } from "@/components/studio/add-catalog";
import { freeSize } from "@/components/studio/add-place";
import { parseAddFilter } from "@/components/studio/add-prefs";
import { mergePrefixes, placementPrefixes, widgetPlacement } from "@/components/studio/placement-content";
import { addedMessage, widgetFromZone, widgetRecordFor, zoneOfWidget } from "@/components/infopanel/edit/widget-add";
import { newStored, readStored, toStored } from "@/lib/infopanel/import/stored";
import { newWidgetItem } from "@/lib/infopanel/native/widget-item";
import { CANVAS_ID, PANEL_ID, type Placement } from "@/lib/layout";

const catalog = addCatalog();
const row = (id: string) => catalog.widget.find((w) => w.id === id)!;

describe("an Add row as a widget record", () => {
  it("is the widget, with the settings its view adds", () => {
    expect(widgetRecordFor(row("Weather"))).toEqual({ module: "Weather" });
    const view = catalog.widget.find((w) => w.id.includes(":") && w.drop.settings)!;
    expect(widgetRecordFor(view)).toEqual({ module: view.drop.id, settings: view.drop.settings });
  });

  it("is a panel built from its preset, or nothing for a layout or a missing preset", () => {
    const panel = widgetRecordFor(catalog.panel[0]);
    expect(panel?.module).toBe(PANEL_ID);
    expect(Array.isArray(panel?.panel?.widgets)).toBe(true);
    expect(widgetRecordFor(catalog.layout[0])).toBeNull();
    expect(widgetRecordFor({ ...catalog.panel[0], drop: { kind: "panel", id: "gone" } })).toBeNull();
  });
});

describe("a widget item edited as a zone", () => {
  it("round-trips its widget through the zone the inspector edits", () => {
    const widget = { module: "Weather", settings: { units: "imperial" }, design: { header: true }, follow: { colors: false }, onInfoPanel: "snapshot" as const };
    const zone = zoneOfWidget(widget, "3.1");
    expect(zone).toMatchObject({ id: "widget:3.1", module: "Weather", settings: { units: "imperial" }, design: { header: true }, follow: { colors: false }, visible: true });
    expect(widgetFromZone(zone, widget.onInfoPanel)).toEqual(widget);
    expect(widgetFromZone({ ...zone, settings: {}, design: undefined, follow: {} })).toEqual({ module: "Weather" });
  });
});

describe("the default size on a Free page", () => {
  it("is the widget's cells at the preview's native size, shrunk with its shape kept to fit the canvas", () => {
    expect(freeSize({ cols: 2, rows: 1 }, { width: 1024, height: 600 })).toEqual({ w: 310, h: 150 });
    const big = freeSize({ cols: 6, rows: 4 }, { width: 800, height: 480 });
    expect(big.w).toBeLessThanOrEqual(760);
    expect(big.h).toBeLessThanOrEqual(456);
    expect(Math.abs(big.w / big.h - 950 / 630)).toBeLessThan(0.02);
  });
});

describe("the Add filter", () => {
  it("is All unless a known one is stored", () => {
    expect(parseAddFilter(null)).toBe("all");
    expect(parseAddFilter("items")).toBe("items");
    expect(parseAddFilter("everything")).toBe("all");
  });
});

describe("the toast after adding a widget to a screen made for InfoPanel", () => {
  it("says what an export makes of it", () => {
    expect(addedMessage("Weather", { module: "Weather" })).toBe("Weather added. On InfoPanel export it becomes a picture with its live values on top.");
    expect(addedMessage("Timer", { module: "Timer" })).toBe("Timer added. On InfoPanel export it is left out.");
    expect(addedMessage("Clock", { module: "Clock" })).toBe("Clock added. On InfoPanel export it exports as an InfoPanel item.");
    expect(addedMessage("Weather", { module: "Weather", onInfoPanel: "snapshot" })).toBe("Weather added. On InfoPanel export it becomes a still picture.");
  });
});

describe("the canvas zone's subscription", () => {
  it("reads its widget items' keys too, and every sensor when one reads all", () => {
    const base = newStored({ name: "Arc", width: 800, height: 480 });
    const { profile } = readStored(base);
    const zone = (canvas: unknown): Placement => ({ id: "z", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas: canvas as Placement["canvas"] });
    const store = (modules: string[]) =>
      toStored({ name: "Arc", origin: "file", dataApi: null, defaultMode: "infopanel", profile, items: modules.map((m) => newWidgetItem({ module: m }, { x: 0, y: 0, w: 10, h: 10 }, m)), assets: new Map(), keyOf: () => null, fonts: [] });
    expect(placementPrefixes(zone(store([])))).toEqual([]);
    const weather = placementPrefixes(widgetPlacement({ module: "Weather" }));
    expect(placementPrefixes(zone(store(["Weather"])))).toEqual([...new Set(weather)].sort());
    expect(mergePrefixes([["b", "a"], ["a"]])).toEqual(["a", "b"]);
    expect(mergePrefixes([["a"], null])).toBeNull();
  });
});
