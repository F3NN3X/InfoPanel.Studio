import { describe, expect, it } from "vitest";
import { applyElement, elementOf } from "@/lib/infopanel/elements/apply.ts";
import { newComposite, newElement } from "@/lib/infopanel/elements/create.ts";
import type { ElementSpec } from "@/lib/infopanel/elements/spec.ts";
import { newItem } from "@/lib/infopanel/editor/create.ts";
import {
  checkItems,
  exportCheck,
  freeCanvasOf,
  itemRows,
  madeForInfoPanel,
  studioOnlyOf,
  widgetChoice,
  widgetItemRow,
  widgetRow,
} from "@/lib/infopanel/export-check.ts";
import { newWidgetItem } from "@/lib/infopanel/native/widget-item.ts";
import { openStored } from "@/lib/infopanel/import/session.ts";
import { newStored, type StoredCanvas } from "@/lib/infopanel/import/stored.ts";
import { storeItems } from "@/lib/infopanel/canvas-edit.ts";
import { openCanvas } from "@/lib/infopanel/canvas.ts";
import type { DisplayItem } from "@/lib/infopanel/schema.ts";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog.ts";
import { instantiate } from "@/lib/infopanel/templates/instantiate.ts";
import { MOCK_SENSORS } from "@/lib/infopanel/templates/mock.ts";
import { CANVAS_ID, type MonitorProfile, type Placement } from "@/lib/layout";
import { palette, profile } from "./elements/fixture.ts";

const withSpec = (item: DisplayItem, patch: Partial<ElementSpec>) => applyElement({ ...item, element: { ...elementOf(item)!, ...patch } } as unknown as DisplayItem);
const zone = (id: string, module: string, extra: Partial<Placement> = {}): Placement => ({ id, module, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, ...extra });
const canvasWith = (items: DisplayItem[], origin: StoredCanvas["source"]["origin"] = "new"): StoredCanvas => {
  const base = newStored({ name: "Desk", width: 800, height: 480 });
  const open = openCanvas(base);
  return { ...storeItems(base, open.profile, items), source: { ...base.source, origin } };
};
const screen = { cols: 2, rows: 1 };

describe("an InfoPanel item's status", () => {
  it("is as is for a plain item, worded by where it came from", () => {
    const text = newItem("Text", profile, palette);
    expect(itemRows([text], true)).toEqual([{ path: "0", name: "Custom Text", kind: "item", status: "ok", why: "Original InfoPanel item" }]);
    expect(itemRows([text], false)[0].why).toBe("InfoPanel Text item");
  });

  it("is as is for a baked or native element, with the element's own note", () => {
    const ring = newElement("ring", profile, palette);
    const card = newElement("card", profile, palette);
    const [r, c] = itemRows([ring, card], false);
    expect(r).toMatchObject({ status: "ok", why: expect.stringContaining("image frames") });
    expect(c).toMatchObject({ status: "ok", why: expect.stringContaining("Shape") });
  });

  it("is approximated for each studio-only look set, naming it and its value", () => {
    const blurred = withSpec(newElement("card", profile, palette), { blur: 16 } as Partial<ElementSpec>);
    const graph = withSpec(newElement("sparkline", profile, palette), { style: "area", gradient: true, dot: false } as Partial<ElementSpec>);
    const [b, g] = itemRows([blurred, graph], false);
    expect(b).toMatchObject({ status: "approx", why: "Backdrop blur (16 px) is baked into the card's picture, so values behind it aren't blurred" });
    expect(g).toMatchObject({ status: "approx", why: "Gradient fill under the graph (on) is dropped" });
    const both = withSpec(graph, { dot: true } as Partial<ElementSpec>);
    expect(itemRows([both], false)[0].why).toBe("Gradient fill under the graph (on) is dropped; End dot (on) is dropped");
    expect(studioOnlyOf(both).map((s) => s.field.key)).toEqual(["gradient", "dot"]);
    expect(studioOnlyOf(newItem("Text", profile, palette))).toEqual([]);
  });

  it("lists a plain group's children by path, and a studio element group as one part", () => {
    const group = { ...newItem("Group", profile, palette), Name: "Temps", DisplayItems: [newItem("Text", profile, palette), newItem("Bar", profile, palette)] } as DisplayItem;
    const shadow = newComposite("shadowtext", profile, palette, [], 0, 0);
    const rows = itemRows([group, shadow], false);
    expect(rows.map((r) => [r.path, r.status])).toEqual([
      ["0.0", "ok"],
      ["0.1", "ok"],
      ["1", "approx"],
    ]);
    expect(rows[2].why).toBe("Blurred shadow (on) becomes a sharp copy");
  });
});

describe("a Studio widget's status", () => {
  it("becomes a picture when recreated or snapshot, with what is approximated", () => {
    expect(widgetChoice("Weather")).toBe("recreate");
    expect(widgetRow(zone("w", "Weather"), "Weather")).toMatchObject({ kind: "widget", status: "pic", why: "Recreate: picture of the widget, live values on top; the animated sky becomes a static icon" });
    expect(widgetRow(zone("w", "Weather", { settings: { $onInfoPanel: "snapshot" } }), "Weather")).toMatchObject({ status: "pic", why: "Snapshot: a still picture" });
  });

  it("is left out when native-only by default, or when the user leaves it out", () => {
    expect(widgetChoice("Timer")).toBe("leave");
    expect(widgetRow(zone("t", "Timer"), "Timer")).toMatchObject({ status: "out", why: "Can't be converted" });
    expect(widgetRow(zone("w", "Weather", { settings: { $onInfoPanel: "leave" } }), "Weather")).toMatchObject({ status: "out", why: "Left out by you" });
    // A choice the tier doesn't offer falls back to the default.
    expect(widgetChoice("Timer", "recreate")).toBe("leave");
  });

  it("exports as is when it has a direct item: a digital clock, a panel", () => {
    expect(widgetRow(zone("c", "Clock"), "Clock")).toMatchObject({ status: "ok", why: "Becomes an InfoPanel Clock item" });
    expect(widgetRow(zone("c", "Clock", { settings: { face: "analog" } }), "Clock").status).toBe("pic");
    expect(widgetRow(zone("p", "panel"), "Panel")).toMatchObject({ status: "ok" });
  });
});

describe("a page's check", () => {
  const canvas = canvasWith([newItem("Text", profile, palette), withSpec(newElement("card", profile, palette), { blur: 8 } as Partial<ElementSpec>)], "file");
  const free = { placements: [zone("z", CANVAS_ID, { colSpan: 2, canvas })] };

  it("reads a Free page's items, counted by status", () => {
    const check = exportCheck(screen, free);
    expect(check.rows.map((r) => [r.path, r.status])).toEqual([
      ["0", "ok"],
      ["1", "approx"],
    ]);
    expect(check.counts).toEqual({ ok: 1, approx: 1, pic: 0, out: 0 });
  });

  it("reads a grid page's zones as widgets and its free areas' items, skipping blank and hidden zones", () => {
    const page = {
      placements: [
        zone("w", "Weather"),
        zone("b", "blank"),
        zone("h", "Timer", { visible: false }),
        zone("z", CANVAS_ID, { colStart: 2, canvas }),
      ],
    };
    const check = exportCheck(screen, page, (z) => `${z.module}!`);
    expect(check.rows.map((r) => [r.path, r.name, r.status])).toEqual([
      ["w", "Weather!", "pic"],
      ["z:0", "Custom Text", "ok"],
      ["z:1", "Card", "approx"],
    ]);
  });

  it("is empty for a Free page whose canvas isn't loaded", () => {
    expect(exportCheck(screen, { placements: [zone("z", CANVAS_ID, { colSpan: 2 })] }).rows).toEqual([]);
  });

  it("tells a Free page and an InfoPanel screen from the rest", () => {
    expect(freeCanvasOf(screen, free)?.id).toBe("z");
    expect(freeCanvasOf(screen, { placements: [zone("z", CANVAS_ID)] })).toBeNull();
    expect(freeCanvasOf(screen, { placements: [...free.placements, zone("w", "Weather")] })).toBeNull();
  });

  it("is on for a screen made for InfoPanel only, whatever its pages are (decision D5)", () => {
    const allFree: MonitorProfile = { id: "s", name: "S", width: 800, height: 480, fit: "fill", ...screen, pages: [{ id: "a", name: "A", ...free }] };
    const mixed: MonitorProfile = { ...allFree, pages: [...allFree.pages, { id: "b", name: "B", placements: [] }] };
    expect(madeForInfoPanel({ ...allFree, madeFor: "infopanel" })).toBe(true);
    expect(madeForInfoPanel({ ...mixed, madeFor: "infopanel" })).toBe(true);
    // An all-Free screen made for Studio panels, or one that never said (unset = Studio), has no check.
    expect(madeForInfoPanel({ ...allFree, madeFor: "studio" })).toBe(false);
    expect(madeForInfoPanel(allFree)).toBe(false);
  });
});

describe("a Studio widget item's status (one-editor SPEC §7.1)", () => {
  const widget = (module: string, extra: Record<string, unknown> = {}) => newWidgetItem({ module, ...extra }, { x: 0, y: 0, w: 300, h: 150 }, module);

  it("is a widget, by its rule: Recreate by default, then Snapshot or Leave out", () => {
    expect(itemRows([widget("Weather")], true)).toEqual([
      { path: "0", name: "Weather", kind: "widget", status: "pic", why: "Recreate: picture of the widget, live values on top; the animated sky becomes a static icon" },
    ]);
    expect(widgetItemRow(widget("Weather", { onInfoPanel: "snapshot" }), "0")).toMatchObject({ status: "pic", why: "Snapshot: a still picture" });
    expect(widgetItemRow(widget("Weather", { onInfoPanel: "leave" }), "0")).toMatchObject({ status: "out", why: "Left out by you" });
  });

  it("shows Left out for a widget that can't convert (decision D2), and for one this build doesn't have", () => {
    for (const m of ["CodingAgents", "Countdown", "Timer", "WebPage", "WaveLink", "DayPlanner", "RadialClockStack", "OnAirBeacon"]) {
      expect(widgetItemRow(widget(m), "0")).toMatchObject({ status: "out", why: "Can't be converted" });
    }
    expect(widgetItemRow(widget("Timer", { onInfoPanel: "snapshot" }), "0")?.status).toBe("pic");
    expect(widgetItemRow(widget("FutureWidget"), "0")).toMatchObject({ status: "out", why: "Not available in this version" });
  });

  it("a digital Clock becomes a Clock item, a panel its items", () => {
    expect(widgetItemRow(widget("Clock"), "0")).toMatchObject({ status: "ok", why: "Becomes an InfoPanel Clock item" });
    expect(widgetItemRow(widget("panel", { panel: { widgets: [] } }), "0")).toMatchObject({ status: "ok", why: "Rebuilt as InfoPanel items" });
    expect(widgetItemRow(widget("panel", { onInfoPanel: "leave" }), "0")?.status).toBe("out");
  });

  it("counts widget items on a Free page with the InfoPanel items", () => {
    const text = newItem("Text", profile, palette);
    const page = { placements: [zone("z", CANVAS_ID, { colSpan: 2, canvas: canvasWith([text, widget("Weather"), widget("Timer")], "file") })] };
    expect(exportCheck(screen, page).counts).toEqual({ ok: 1, approx: 0, pic: 1, out: 1 });
  });
});

describe("the live check and the export dialog's report", () => {
  it.each(TEMPLATES.map((t) => t.id))("%s: list the same parts with the same status", async (id) => {
    const { stored } = instantiate(TEMPLATES.find((t) => t.id === id)!, { name: "Desk", width: 800, height: 480, sensors: MOCK_SENSORS });
    const live = exportCheck(screen, { placements: [zone("z", CANVAS_ID, { colSpan: 2, canvas: stored })] });
    // The dialog reads the items of the stored form it opened, as the export writes them.
    const opened = await openStored(JSON.parse(JSON.stringify(stored)), async () => null);
    const report = checkItems(opened.parsed.items, opened.origin !== "new");
    expect(report).toEqual(live);
    expect(live.rows.length).toBeGreaterThan(0);
  });
});
