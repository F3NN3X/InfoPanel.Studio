import { describe, expect, it } from "vitest";
import { defaultPalette } from "../../../../src/lib/infopanel/elements/palette.ts";
import type { ConvertContext } from "../../../../src/lib/infopanel/native/items.ts";
import { panelToItems, stackBoxes, widgetItems, type Measured } from "../../../../src/lib/infopanel/native/to-infopanel.ts";
import { PANEL_KIND_TIERS } from "../../../../src/lib/infopanel/native/tiers.ts";
import { defaultItem, type GroupItem } from "../../../../src/lib/infopanel/schema.ts";
import type { PanelDef, Widget, WidgetKind } from "../../../../src/lib/panel-model.ts";
import type { Note } from "../../../../src/lib/infopanel/native/items.ts";

const look = { Font: "Segoe UI", FontSize: 20, Color: "#FFFFFFFF", BackgroundColor: "#FF101010" };
const notes: Note[] = [];
const ctx = (): ConvertContext => ({
  look,
  palette: defaultPalette(look),
  notes: (notes.length = 0) || notes,
  sensors: { cpu: { value: 4, name: "CPU Total", unit: "%", ref: "libre:/amdcpu/0/load/0" }, "system.bridge.time": { text: "x" } },
});
const m: Measured = { x: 10, y: 20, w: 200, h: 60 };
const widget = (kind: WidgetKind, rest: Partial<Widget> = {}): Widget => ({ id: kind, kind, visible: true, ...rest });

describe("widgetItems", () => {
  it("stat: a label over a bound Sensor with its number settings", () => {
    const [label, value] = widgetItems(widget("stat", { label: "CPU", sensor: "cpu", decimals: 1, unit: "%", scale: 2, fontSize: 30 }), m, ctx());
    expect(label).toMatchObject({ kind: "Text", Name: "CPU" });
    expect(value).toMatchObject({ kind: "Sensor", SensorType: "Libre", LibreSensorId: "/amdcpu/0/load/0", Precision: 1, OverridePrecision: true, Unit: "%", MultiplicationModifier: 2, FontSize: 23 });
    expect(value.Y).toBeGreaterThan(m.y);
  });

  it("value: one Sensor, left unbound with a note when the key has no reference", () => {
    const c = ctx();
    const items = widgetItems(widget("value", { sensor: "system.bridge.time" }), m, c);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "Sensor", SensorName: "" });
    expect(c.notes[0].text).toContain("not bound");
  });

  it("bar: a Bar with the widget's range, flipped when inverted", () => {
    expect(widgetItems(widget("bar", { sensor: "cpu", max: 80, inverted: true }), m, ctx())[0]).toMatchObject({ kind: "Bar", MaxValue: 80, FlipX: true, LibreSensorId: "/amdcpu/0/load/0" });
  });

  it("gauge: a square ring Gauge of the widget's size", () => {
    expect(widgetItems(widget("gauge", { sensor: "cpu", size: 90 }), m, ctx())[0]).toMatchObject({ kind: "Gauge", Width: 90, Height: 90 });
  });

  it("customGauge: a Gauge carrying the widget's vector spec", () => {
    const vector = { marker: 1 } as never;
    expect(widgetItems(widget("customGauge", { sensor: "cpu", vector }), m, ctx())[0]).toMatchObject({ kind: "Gauge", vector });
  });

  it("sparkline: a Graph", () => {
    expect(widgetItems(widget("sparkline", { sensor: "cpu", color: "#22D3EE" }), m, ctx())[0]).toMatchObject({ kind: "Graph", Color: "#FF22D3EE" });
  });

  it("table: a TableSensor on a plugin table, else a Sensor", () => {
    const c = ctx();
    c.sensors = { t: { text: "a", ref: "plugin:/p/c/e" }, l: { value: 1, ref: "libre:/x/0/load/0" } };
    expect(widgetItems(widget("table", { sensor: "t", rows: 3 }), m, c)[0]).toMatchObject({ kind: "TableSensor", MaxRows: 3, PluginSensorId: "/p/c/e" });
    expect(widgetItems(widget("table", { sensor: "l" }), m, c)[0]).toMatchObject({ kind: "Sensor", LibreSensorId: "/x/0/load/0" });
  });

  it("text: static text is the item's Name; bound text is a Sensor", () => {
    expect(widgetItems(widget("text", { text: "Hello", scroll: true, align: "center" }), m, ctx())[0]).toMatchObject({ kind: "Text", Name: "Hello", Marquee: true, CenterAlign: true });
    expect(widgetItems(widget("text", { sensor: "cpu" }), m, ctx())[0]).toMatchObject({ kind: "Sensor", ShowUnit: false });
  });

  it("image: a URL Image, or an HttpImage when bound", () => {
    expect(widgetItems(widget("image", { text: "https://example.com/a.png" }), m, ctx())[0]).toMatchObject({ kind: "Image", Type: "URL", HttpUrl: "https://example.com/a.png" });
    expect(widgetItems(widget("image", { sensor: "cpu" }), m, ctx())[0]).toMatchObject({ kind: "HttpImage" });
  });

  it("clock: time, date, or both stacked, with the widget's .NET format", () => {
    expect(widgetItems(widget("clock", { clock: "time", format: "hh:mm tt" }), m, ctx())).toMatchObject([{ kind: "Clock", Format: "hh:mm tt" }]);
    const both = widgetItems(widget("clock", { clock: "both" }), m, ctx());
    expect(both.map((i) => i.kind)).toEqual(["Clock", "Calendar"]);
    expect(both[1].Y).toBeGreaterThan(both[0].Y);
  });

  it("shape: a circle is an Ellipse, a bar a square-cornered Rectangle", () => {
    expect(widgetItems(widget("shape", { shape: "circle", color: "#FF0000" }), m, ctx())[0]).toMatchObject({ kind: "Shape", Type: "Ellipse", FillColor: "#FFFF0000" });
    expect(widgetItems(widget("shape", { shape: "hbar" }), m, ctx())[0]).toMatchObject({ Type: "Rectangle", CornerRadius: 0 });
  });

  it("converts every panel widget kind", () => {
    for (const kind of Object.keys(PANEL_KIND_TIERS) as WidgetKind[]) expect(widgetItems(widget(kind), m, ctx()).length).toBeGreaterThan(0);
  });
});

describe("panelToItems", () => {
  const panel = (widgets: Widget[]): PanelDef => ({ id: "p", title: "Stats", titleVisible: true, visible: true, background: "none", widgets }) as PanelDef;

  it("puts the measured box on each widget and skips hidden ones", () => {
    const g = panelToItems(panel([widget("text", { id: "a", text: "A" }), widget("text", { id: "b", text: "B", visible: false })]), { x: 0, y: 0, w: 400, h: 200 }, new Map([["a", { x: 33, y: 44, w: 120, h: 30 }]]), ctx()) as GroupItem;
    expect(g.kind).toBe("Group");
    expect(g.DisplayItems).toHaveLength(1);
    expect(g.DisplayItems[0]).toMatchObject({ X: 33, Y: 44, Width: 120 });
  });

  it("falls back to the zone shared evenly when nothing was measured", () => {
    const g = panelToItems(panel([widget("text", { id: "a", text: "A" }), widget("text", { id: "b", text: "B" })]), { x: 50, y: 10, w: 300, h: 100 }, new Map(), ctx()) as GroupItem;
    expect(g.DisplayItems.map((i) => [i.X, i.Y])).toEqual([[50, 10], [50, 60]]);
    expect(stackBoxes([widget("text")], { x: 0, y: 0, w: 5, h: 8 }).get("text")).toEqual({ x: 0, y: 0, w: 5, h: 8 });
  });

  it("notes what a kind approximates", () => {
    const c = ctx();
    panelToItems(panel([widget("sparkline", { id: "s" })]), { x: 0, y: 0, w: 100, h: 50 }, new Map(), c);
    expect(c.notes.some((n) => n.text.includes("approximated"))).toBe(true);
    expect(defaultItem("Group").kind).toBe("Group");
  });
});
