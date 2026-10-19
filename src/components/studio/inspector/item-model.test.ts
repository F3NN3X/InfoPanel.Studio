import { describe, expect, it } from "vitest";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { normalizeGauge } from "@/lib/infopanel/gauges/vector";
import { convertKind, WIDGET_KINDS, type Widget, type WidgetKind } from "@/lib/panel-model";
import { resolveWith } from "@/lib/style-resolve";
import { allSections, changedCount, type InspectorSection, type PanelLayoutKind, type TabId } from "../inspector-model";
import {
  itemFields,
  itemLookValues,
  itemOwn,
  itemSections,
  kindChoices,
  withItemValues,
  withoutItemValues,
  type ItemFieldsInput,
} from "./item-model";

const widget = (kind: WidgetKind, extra: Partial<Widget> = {}): Widget => ({ id: "w", kind, visible: true, ...extra });

const sections = (w: Widget, layout: PanelLayoutKind = "stack", unit?: string) => itemSections({ kind: "item", widget: w, layout, unit });
const ids = (list: InspectorSection[], tab: TabId) => list.filter((s) => s.tab === tab).map((s) => s.id);
const keys = (list: InspectorSection[], id: string) => list.find((s) => s.id === id)?.settings.map((d) => d.key) ?? [];

describe("KIND_TABS: the sections of each kind", () => {
  it("a stat has every tab: Kind, Content, Size & placement; Typography, Color, CSS; Binding, format; Thresholds", () => {
    const s = sections(widget("stat"));
    expect(ids(s, "show")).toEqual(["item-kind", "item-content", "item-place"]);
    expect(ids(s, "style")).toEqual(["type", "colors", "css"]);
    expect(ids(s, "data")).toEqual(["panel-data", "item-bind", "format"]);
    expect(ids(s, "behaviour")).toEqual(["thresholds"]);
    expect(keys(s, "item-bind")).toEqual(["sensor", "subSensor"]);
    expect(keys(s, "format")).toEqual(["unit", "decimals", "scale"]);
  });

  it.each<[WidgetKind, string[], string[], string[]]>([
    ["value", ["type", "colors", "css"], ["panel-data", "item-bind", "format"], ["thresholds"]],
    ["bar", ["colors", "css"], ["panel-data", "item-bind", "format"], ["thresholds", "item-fill"]],
    ["gauge", ["type", "colors", "css"], ["panel-data", "item-bind", "format"], ["thresholds", "item-fill"]],
    ["sparkline", ["colors", "css"], ["panel-data", "item-bind", "format"], ["item-history"]],
    ["table", ["type", "css"], ["panel-data", "item-bind"], []],
    ["text", ["type", "colors", "css"], ["panel-data", "item-bind", "format"], []],
    ["image", ["css"], ["panel-data", "item-bind"], []],
    ["clock", ["type", "colors", "css"], ["panel-data"], []],
    ["shape", ["colors", "css"], ["panel-data"], []],
    ["customGauge", ["css"], ["panel-data", "item-bind"], []],
  ])("%s: style %j, data %j, behaviour %j", (kind, style, data, behaviour) => {
    const s = sections(widget(kind));
    expect(ids(s, "style")).toEqual(style);
    expect(ids(s, "data")).toEqual(data);
    expect(ids(s, "behaviour")).toEqual(behaviour);
  });

  it("lists each kind's own content rows", () => {
    expect(keys(sections(widget("clock")), "item-content")).toEqual(["label", "clock"]);
    expect(keys(sections(widget("shape")), "item-content")).toEqual(["shape", "thickness"]);
    expect(keys(sections(widget("table")), "item-content")).toEqual(["label", "rows", "columns", "header"]);
    expect(keys(sections(widget("image")), "item-content")).toEqual(["label", "text", "height"]);
    expect(keys(sections(widget("customGauge")), "item-content")).toEqual(["label", "gauge", "width"]);
    expect(keys(sections(widget("bar")), "format")).toEqual(["unit", "decimals", "max", "scale"]);
    const decimals = sections(widget("stat")).flatMap((sec) => sec.settings).find((d) => d.key === "decimals")!;
    expect(decimals.options?.map((o) => o.value)).toEqual(["auto", "0", "1", "2", "3", "4", "5", "6"]);
    expect(keys(sections(widget("gauge")), "type")).toEqual(["size"]);
  });

  it("places by the panel's layout: size and self in a stack, span and cell in a grid, the band in an overlay", () => {
    expect(keys(sections(widget("stat")), "item-place")).toEqual(["boxW", "self", "boxH"]);
    expect(keys(sections(widget("stat", { box: { w: 200 } })), "item-place")).toEqual(["boxW", "boxWpx", "self", "boxH"]);
    expect(keys(sections(widget("stat"), "grid"), "item-place")).toEqual(["boxW", "self", "boxH", "span", "rowSpan", "col", "row"]);
    expect(keys(sections(widget("image"), "overlay"), "item-place")).toEqual(["asBackground", "band"]);
    expect(keys(sections(widget("stat"), "overlay"), "item-place")).toEqual(["band"]);
  });

  it("measures thresholds by the bound sensor's unit", () => {
    const thr = (unit?: string) => sections(widget("stat"), "stack", unit).find((s) => s.id === "thresholds")!.settings[0];
    expect(thr("%")).toMatchObject({ key: "thr.warn", keyY: "thr.crit", quantity: "load", label: "Load", default: "off", defaultY: "off" });
    expect(thr("°C").quantity).toBe("temp");
    expect(thr("MB/s").quantity).toBe("value");
    expect(thr(undefined).quantity).toBe("value");
  });

  it("is what the inspector lists for the item context", () => {
    const w = widget("bar");
    expect(allSections({ kind: "item", widget: w, layout: "stack" })).toEqual(sections(w));
  });

  it("offers Custom gauge as a kind only on a widget that already is one", () => {
    expect(kindChoices(WIDGET_KINDS, "stat")).not.toContain("customGauge");
    expect(kindChoices(WIDGET_KINDS, "stat")).toHaveLength(10);
    expect(kindChoices(WIDGET_KINDS, "customGauge")).toContain("customGauge");
  });
});

describe("a change of kind", () => {
  it("keeps the convertKind fields and drops the sections the new kind does not have", () => {
    const stat = widget("stat", { label: "CPU", sensor: "cpu.load", unit: "%", color: "#ff0000", fontSize: 40, thr: { warn: 70 }, box: { w: "fill" } });
    const spark = convertKind(stat, "sparkline");
    expect(spark).toMatchObject({ label: "CPU", sensor: "cpu.load", unit: "%", color: "#ff0000", box: { w: "fill" } });
    expect(spark).not.toHaveProperty("thr");
    expect(spark).not.toHaveProperty("fontSize");
    const s = sections(spark);
    expect(s.map((x) => x.id)).not.toContain("thresholds");
    expect(s.map((x) => x.id)).not.toContain("type");
    expect(s.map((x) => x.id)).toContain("item-history");
    expect(itemOwn(spark, "stack")).toMatchObject({ label: "CPU", sensor: "cpu.load", color: "#ff0000" });
  });
});

describe("the item's values", () => {
  it("maps the widget's fields onto the rows' keys, defaults left out", () => {
    const w = widget("bar", { box: { w: "fill", self: "center" }, decimals: 1, thr: { warn: 60, crit: "off" }, inverted: true });
    // A bar fills its row by default: that is no own value.
    expect(itemOwn(w, "stack")).toEqual({ self: "center", decimals: "1", "thr.warn": 60, "thr.crit": "off", inverted: true });
    expect(itemOwn(widget("stat", { box: { w: 180 } }), "stack")).toEqual({ boxW: "px", boxWpx: 180 });
    expect(itemOwn(widget("stat", { box: { w: "hug" } }), "grid")).toEqual({});
  });

  it("writes the rows back onto the widget (0 / auto / empty = unset)", () => {
    const w = widget("stat");
    expect(withItemValues(w, { boxW: "px" }).box).toEqual({ w: 120 });
    expect(withItemValues(w, { boxW: "px", boxWpx: 240 }).box).toEqual({ w: 240 });
    expect(withItemValues(widget("stat", { box: { self: "end" } }), { self: "auto" })).not.toHaveProperty("box");
    expect(withItemValues(w, { decimals: "2" }).decimals).toBe(2);
    expect(withItemValues(widget("stat", { decimals: 2 }), { decimals: "auto" })).not.toHaveProperty("decimals");
    expect(withItemValues(w, { fontSize: 0 })).not.toHaveProperty("fontSize");
    expect(withItemValues(widget("gauge"), { size: 64 }).size).toBe(64);
    expect(withItemValues(widget("gauge", { size: 64 }), { size: 0 })).not.toHaveProperty("size");
    expect(withItemValues(w, { fontSize: 32, align: "center", label: "" })).toMatchObject({ fontSize: 32, align: "center" });
    expect(withItemValues(w, { "thr.warn": 70, "thr.crit": "off" }).thr).toEqual({ warn: 70, crit: "off" });
    expect(withItemValues(widget("image"), { band: "bottom", asBackground: true })).toMatchObject({ overlayZone: "bottom", asBackground: true });
    const bar = STARTERS.find((s) => s.name === "Bar")!;
    expect(withItemValues(widget("customGauge"), { gauge: "Bar" }).vector).toEqual(normalizeGauge(bar.gauge));
    expect(withItemValues(widget("customGauge"), { gauge: "custom" })).not.toHaveProperty("vector");
  });

  it("drops own values (a section's Reset)", () => {
    const w = widget("stat", { thr: { warn: 70, crit: 90 }, box: { w: 200, self: "end" }, color: "#fff" });
    expect(withoutItemValues(w, ["thr.warn"]).thr).toEqual({ crit: 90 });
    expect(withoutItemValues(w, ["thr.warn", "thr.crit", "color"])).not.toHaveProperty("thr");
    expect(withoutItemValues(w, ["boxW", "boxWpx", "self"])).not.toHaveProperty("box");
  });
});

describe("following the panel", () => {
  const levels = { profile: { values: { accent: "#00ff00", decimals: "1", "warn.load": 75, "crit.load": 90 } } };
  const look = resolveWith(levels, { label: "Rig" }, undefined) ?? {};

  function fieldsOf(w: Widget, extra: Partial<ItemFieldsInput> = {}) {
    const edits: Widget[] = [];
    const fields = itemFields({ widget: w, layout: "stack", look, panelName: "Rig", unit: "%", change: (fn) => edits.push(fn(w)), ...extra });
    return { fields, edits };
  }
  const sectionOf = (w: Widget, id: string) => sections(w, "stack", "%").find((s) => s.id === id)!;
  const def = (w: Widget, id: string, key: string) => sectionOf(w, id).settings.find((d) => d.key === key)!;

  it("shows the panel's values read-only while a section follows; per-widget rows stay editable", () => {
    const w = widget("bar", { unit: "%", max: 200 });
    const { fields } = fieldsOf(w);
    expect(fields.shown("color", def(w, "colors", "color"))).toBe("#00ff00");
    expect(fields.shown("decimals", def(w, "format", "decimals"))).toBe("1");
    expect(fields.shown("thr.warn", def(w, "thresholds", "thr.warn"))).toBe(75);
    expect(fields.shown("thr.crit", def(w, "thresholds", "thr.warn"))).toBe(90);
    expect(fields.readOnly?.(def(w, "colors", "color"))).toBe(true);
    expect(fields.readOnly?.(def(w, "format", "decimals"))).toBe(true);
    expect(fields.readOnly?.(def(w, "format", "unit"))).toBe(false);
    expect(fields.readOnly?.(def(w, "format", "max"))).toBe(false);
    expect(fields.follow?.(sectionOf(w, "colors"))).toMatchObject({ mode: "theme", scope: { kind: "item", panelName: "Rig" } });
    // Sections that do not follow have no bar.
    expect(fields.follow?.(sectionOf(w, "item-content"))).toBeUndefined();
    expect(fields.follow?.(sectionOf(w, "css"))).toBeUndefined();
  });

  it("is custom where the widget has own values; they show and count as changed", () => {
    const w = widget("stat", { color: "#ff0000", decimals: 2 });
    const { fields } = fieldsOf(w);
    expect(fields.shown("color", def(w, "colors", "color"))).toBe("#ff0000");
    expect(fields.readOnly?.(def(w, "colors", "color"))).toBe(false);
    expect(fields.follow?.(sectionOf(w, "colors"))?.mode).toBe("custom");
    expect(changedCount(sectionOf(w, "colors"), fields.values)).toBe(1);
    expect(changedCount(sectionOf(w, "format"), fields.values)).toBe(1);
    // Thresholds unset: following, the panel's levels, nothing changed.
    expect(changedCount(sectionOf(w, "thresholds"), fields.values)).toBe(0);
  });

  it("Use panel keeps the own values stored but stops counting them; Customize brings them back", () => {
    const w = widget("stat", { color: "#ff0000" });
    const { fields, edits } = fieldsOf(w);
    fields.follow?.(sectionOf(w, "colors"))?.onUseTheme();
    const following = edits[0];
    expect(following).toMatchObject({ color: "#ff0000", follow: { colors: true } });
    const after = fieldsOf(following).fields;
    expect(after.shown("color", def(following, "colors", "color"))).toBe("#00ff00");
    expect(changedCount(sectionOf(following, "colors"), after.values)).toBe(0);
    const back = fieldsOf(following);
    back.fields.follow?.(sectionOf(following, "colors"))?.onCustomize();
    expect(back.edits[0]).toMatchObject({ color: "#ff0000", follow: { colors: false } });
    expect(fieldsOf(back.edits[0]).fields.shown("color", def(w, "colors", "color"))).toBe("#ff0000");
  });

  it("a section the profile locks reads Locked and follows, own values or not", () => {
    const w = widget("stat", { color: "#ff0000" });
    const { fields } = fieldsOf(w, { locks: { colors: true } });
    expect(fields.follow?.(sectionOf(w, "colors"))?.mode).toBe("locked");
    expect(fields.readOnly?.(def(w, "colors", "color"))).toBe(true);
    expect(itemLookValues({ widget: w, layout: "stack", look, locks: { colors: true } }).applies?.("accent")).toBe(false);
  });

  it("edits write the widget; a custom section's unset row shows the panel's", () => {
    const w = widget("stat", { follow: { thresholds: false } });
    const { fields, edits } = fieldsOf(w);
    expect(fields.readOnly?.(def(w, "thresholds", "thr.warn"))).toBe(false);
    expect(fields.shown("thr.warn", def(w, "thresholds", "thr.warn"))).toBe(75);
    fields.onPatch({ "thr.warn": 60 });
    expect(edits[0].thr).toEqual({ warn: 60 });
    fields.onClear(["thr.warn"]);
    expect(edits[1]).not.toHaveProperty("thr");
  });
});
