import { upgradeConfig } from "@/lib/config-upgrade";
import { describe, expect, it } from "vitest";
import { PANEL_ID, type Placement } from "@/lib/layout";
import { arcv2Profile } from "@tests/lib/__fixtures__/arcv2-profile";
import { sampleProfile } from "@tests/lib/__fixtures__/sample-profile";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { normalizeGauge } from "@/lib/infopanel/gauges/vector";
import { allPlacements } from "@/lib/pages";
import {
  convertKind,
  duplicateWidget,
  insertAfter,
  moveWidget,
  normalizePanel,
  normalizePanelPlacement,
  normalizePanelPresets,
  normalizeWidget,
  panelLegacyLook,
  panelOwnSettings,
  panelSettings,
  parsePanelJson,
  withLayout,
  withPanelField,
  type PanelDef,
  type Widget,
} from "@/lib/panel-model";

const widget = (kind: Widget["kind"], extra: Partial<Widget> = {}): Widget => ({
  id: `w-${kind}`,
  kind,
  visible: true,
  ...extra,
});

const panel = (extra: Partial<PanelDef> = {}): PanelDef => ({
  id: "p",
  title: "CPU",
  titleVisible: true,
  visible: true,
  background: "bordered",
  widgets: [widget("stat"), widget("bar")],
  ...extra,
});

const placement = (p: PanelDef, settings?: Placement["settings"]): Placement => ({
  id: "z",
  module: PANEL_ID,
  colStart: 1,
  rowStart: 1,
  colSpan: 2,
  rowSpan: 1,
  visible: true,
  panel: p,
  settings,
});

describe("normalizePanel", () => {
  it("turns the legacy flow (wrap / no layout) into a wrapping row stack", () => {
    for (const layout of [undefined, "wrap"] as const) {
      expect(normalizePanel(panel({ layout }))).toMatchObject({
        layout: "stack",
        direction: "row",
        wrap: true,
      });
    }
  });

  it("keeps a stack's own direction / wrap and leaves grid and overlay alone", () => {
    expect(normalizePanel(panel({ layout: "wrap", direction: "column", wrap: false }))).toMatchObject({
      layout: "stack",
      direction: "column",
      wrap: false,
    });
    const grid = normalizePanel(panel({ layout: "grid", columns: 4 }));
    expect(grid.layout).toBe("grid");
    expect(grid.direction).toBeUndefined();
    expect(normalizePanel(panel({ layout: "overlay" })).layout).toBe("overlay");
  });

  it("gives the full-row kinds box.w fill and leaves the rest and explicit boxes alone", () => {
    const p = normalizePanel(
      panel({
        widgets: [
          widget("bar"),
          widget("table"),
          widget("image"),
          widget("sparkline"),
          widget("stat"),
          widget("bar", { id: "fixed", box: { w: 120, self: "center" } }),
        ],
      })
    );
    expect(p.widgets.map((w) => w.box?.w)).toEqual(["fill", "fill", "fill", "fill", undefined, 120]);
    expect(p.widgets[5].box).toEqual({ w: 120, self: "center" });
  });

  it("is idempotent", () => {
    const once = normalizePanel(panel());
    expect(normalizePanel(once)).toEqual(once);
  });

  it("keeps fields it doesn't know", () => {
    const p = normalizePanel({
      ...panel(),
      future: { x: 1 },
      widgets: [{ ...widget("bar"), extra: "keep" } as Widget],
    } as PanelDef);
    expect((p as unknown as { future: unknown }).future).toEqual({ x: 1 });
    expect((p.widgets[0] as unknown as { extra: string }).extra).toBe("keep");
  });

  it("tolerates a panel without a widget list", () => {
    expect(normalizePanel({ ...panel(), widgets: undefined } as unknown as PanelDef).widgets).toEqual([]);
  });
});

describe("panelSettings / normalizePanelPlacement", () => {
  it("falls back to the legacy title, accent and card", () => {
    expect(panelSettings(placement(panel({ accent: "#ff0000" })))).toEqual({
      label: "CPU",
      accent: "#ff0000",
      surface: "bordered",
    });
  });

  it("maps a hidden title to an empty label", () => {
    expect(panelSettings(placement(panel({ titleVisible: false })))?.label).toBe("");
  });

  it("keeps the placement's own values", () => {
    const s = panelSettings(placement(panel({ accent: "#ff0000" }), { label: "Mine", accent: "#00ff00", radius: "4" }));
    expect(s).toEqual({ label: "Mine", accent: "#00ff00", surface: "bordered", radius: "4" });
  });

  it("migrates without dropping the PanelDef fields and is idempotent", () => {
    const before = placement(panel({ accent: "#ff0000" }));
    const once = normalizePanelPlacement(before);
    expect(once.panel).toMatchObject({ title: "CPU", titleVisible: true, accent: "#ff0000", background: "bordered" });
    // The legacy look stays a render-time fallback (below the global style).
    expect(once.settings).toEqual({ label: "CPU" });
    expect(normalizePanelPlacement(once)).toEqual(once);
  });

  it("keeps the look a panel migrated by an older build holds", () => {
    const old = placement(panel({ accent: "#ff0000" }), { label: "CPU", accent: "#ff0000", surface: "bordered" });
    expect(normalizePanelPlacement(old).settings).toEqual({ label: "CPU", accent: "#ff0000", surface: "bordered" });
  });

  it("passes other placements through", () => {
    const module: Placement = { ...placement(panel()), module: "SystemOverview", panel: undefined };
    expect(normalizePanelPlacement(module)).toBe(module);
  });
});

describe("panelOwnSettings / panelLegacyLook", () => {
  it("adds only the legacy title to the own settings", () => {
    expect(panelOwnSettings(placement(panel({ accent: "#ff0000" })))).toEqual({ label: "CPU" });
    expect(panelOwnSettings(placement(panel(), { label: "Mine", radius: "4" }))).toEqual({ label: "Mine", radius: "4" });
  });

  it("reads the legacy accent and card as a style layer", () => {
    expect(panelLegacyLook(placement(panel({ accent: "#ff0000" })))).toEqual({ accent: "#ff0000", surface: "bordered" });
    expect(panelLegacyLook({ ...placement(panel()), panel: undefined })).toBeUndefined();
  });
});

describe("withPanelField", () => {
  it("keeps the label in step with title and show-title", () => {
    const pl = placement(panel());
    const hidden = withPanelField(pl, "titleVisible", false);
    expect(hidden.panel?.titleVisible).toBe(false);
    expect(hidden.settings?.label).toBe("");
    // Renaming a hidden title keeps it hidden.
    const renamed = withPanelField(hidden, "title", "GPU");
    expect(renamed.panel?.title).toBe("GPU");
    expect(renamed.settings?.label).toBe("");
    expect(withPanelField(renamed, "titleVisible", true).settings?.label).toBe("GPU");
    expect(withPanelField(pl, "title", "GPU").settings?.label).toBe("GPU");
  });

  it("writes the accent and card, and clears the accent", () => {
    const pl = placement(panel(), { accent: "#ff0000" });
    expect(withPanelField(pl, "background", "none").settings?.surface).toBe("none");
    expect(withPanelField(pl, "accent", "#123456").settings?.accent).toBe("#123456");
    const cleared = withPanelField(pl, "accent", undefined);
    expect(cleared.settings).toBeUndefined();
    expect(panelSettings(cleared)?.accent).toBeUndefined();
  });
});

describe("shipped panels", () => {
  const panels = (placements: Placement[]) => placements.filter((p) => p.panel);

  it.each([
    ["sample", sampleProfile],
    ["arcv2", arcv2Profile],
  ])("%s: every panel loads normalized, its look a render-time layer", (_, make) => {
    const raw = make();
    const loaded = upgradeConfig({ profiles: [raw] }).profiles.find((p) => p.id === raw.id)!;
    const before = panels(allPlacements(raw));
    const after = panels(allPlacements(loaded));
    expect(after).toHaveLength(before.length);
    after.forEach((pl, i) => {
      const src = before[i].panel!;
      expect(["stack", "grid", "overlay"]).toContain(pl.panel!.layout);
      expect(pl.panel!.widgets).toHaveLength(src.widgets.length);
      expect(pl.settings?.label).toBe(src.titleVisible ? src.title : "");
      // The legacy look stays out of the settings (the global style can reach it).
      expect(pl.settings?.surface).toBeUndefined();
      expect(pl.settings?.accent).toBeUndefined();
      expect(panelLegacyLook(pl)?.surface).toBe(src.background);
      expect(panelLegacyLook(pl)?.accent).toBe(src.accent);
      expect(normalizePanelPlacement(pl)).toEqual(pl);
    });
  });
});

describe("normalizePanelPresets", () => {
  const valid = { id: "u1", name: "Mine", panel: panel({ layout: "wrap" }), settings: { radius: "8" } };

  it("is undefined when missing or not a list", () => {
    expect(normalizePanelPresets(undefined)).toBeUndefined();
    expect(normalizePanelPresets({ id: "u1" })).toBeUndefined();
  });

  it("drops invalid entries and normalizes the panels of valid ones", () => {
    const out = normalizePanelPresets([
      valid,
      null,
      { id: 1, name: "x", panel: panel() },
      { id: "u2", name: "no panel" },
      { id: "u3", name: "no widgets", panel: { id: "p" } },
      { id: "u4", name: "bad settings", panel: panel(), settings: [] },
      { id: "u5", name: "bad span", panel: panel(), colSpan: "3" },
      { id: "u6", name: "zero span", panel: panel(), rowSpan: 0 },
    ]);
    expect(out).toHaveLength(1);
    expect(out![0]).toMatchObject({ id: "u1", name: "Mine", settings: { radius: "8" } });
    expect(out![0].panel.layout).toBe("stack");
  });
});

describe("upgradeConfig panelPresets", () => {
  it("is absent when missing, invalid entries are dropped, valid ones kept", () => {
    expect(upgradeConfig({}).panelPresets).toBeUndefined();
    expect(upgradeConfig({ panelPresets: "nope" } as never).panelPresets).toBeUndefined();
    const presets = upgradeConfig({
      panelPresets: [
        { id: "u1", name: "Mine", panel: panel() },
        { id: "bad" },
      ],
    } as never).panelPresets;
    expect(presets?.map((p) => p.id)).toEqual(["u1"]);
    expect(presets?.[0].panel.layout).toBe("stack");
  });
});

describe("widget list edits", () => {
  const p = panel({ widgets: [widget("stat", { id: "a" }), widget("bar", { id: "b" }), widget("text", { id: "c" })] });
  const ids = (x: PanelDef) => x.widgets.map((w) => w.id);

  it("moves a widget to an index, clamped", () => {
    expect(ids(moveWidget(p, "a", 2))).toEqual(["b", "c", "a"]);
    expect(ids(moveWidget(p, "c", 0))).toEqual(["c", "a", "b"]);
    expect(ids(moveWidget(p, "b", 99))).toEqual(["a", "c", "b"]);
    expect(ids(moveWidget(p, "b", -1))).toEqual(["b", "a", "c"]);
    expect(moveWidget(p, "a", 0)).toBe(p);
    expect(moveWidget(p, "nope", 1)).toBe(p);
  });

  it("inserts after a widget, or at the end", () => {
    const w = widget("gauge", { id: "n" });
    expect(ids(insertAfter(p, "a", w))).toEqual(["a", "n", "b", "c"]);
    expect(ids(insertAfter(p, null, w))).toEqual(["a", "b", "c", "n"]);
    expect(ids(insertAfter(p, "gone", w))).toEqual(["a", "b", "c", "n"]);
  });

  it("duplicates a widget under a new id right after it", () => {
    const withBox = panel({ widgets: [widget("bar", { id: "a", label: "CPU", box: { w: 120 } })] });
    const out = duplicateWidget(withBox, "a", "a2");
    expect(ids(out)).toEqual(["a", "a2"]);
    expect(out.widgets[1]).toMatchObject({ kind: "bar", label: "CPU", box: { w: 120 } });
    expect(out.widgets[1].box).not.toBe(out.widgets[0].box);
    expect(duplicateWidget(p, "nope", "x")).toBe(p);
  });

  it("changes kind keeping the shared fields and dropping the old kind's", () => {
    const bar = widget("bar", {
      label: "GPU",
      sensor: "libre.gpu",
      unit: "%",
      color: "#ff0000",
      max: 200,
      inverted: true,
      decimals: 1,
      box: { w: "fill" },
      css: ":scope{}",
    });
    const gauge = convertKind(bar, "gauge");
    expect(gauge).toMatchObject({ kind: "gauge", label: "GPU", sensor: "libre.gpu", max: 200, inverted: true });
    const clock = convertKind(bar, "clock");
    expect(clock).toEqual({
      id: bar.id,
      kind: "clock",
      visible: true,
      label: "GPU",
      sensor: "libre.gpu",
      unit: "%",
      color: "#ff0000",
      box: { w: "fill" },
      css: ":scope{}",
    });
    expect(convertKind(bar, "shape")).toMatchObject({ kind: "shape", shape: "vbar", thickness: 4 });
    expect(convertKind(bar, "bar")).toBe(bar);
  });
});

describe("withLayout", () => {
  it("drops a stack's Spread when switching to a grid", () => {
    const stack = panel({ layout: "stack", justify: "between", align: "stretch" });
    const grid = withLayout(stack, "grid");
    expect(grid.layout).toBe("grid");
    expect("justify" in grid).toBe(false);
    expect(grid.align).toBe("stretch");
  });

  it("keeps values the new layout can show", () => {
    expect(withLayout(panel({ layout: "stack", justify: "end" }), "grid").justify).toBe("end");
    expect(withLayout(panel({ layout: "grid", justify: "center" }), "stack").justify).toBe("center");
    expect(withLayout(panel({ layout: "stack", justify: "between" }), "overlay").justify).toBe("between");
  });
});

describe("parsePanelJson", () => {
  let n = 0;
  const newId = () => `new-${++n}`;

  it("reads a valid panel and normalizes it", () => {
    const r = parsePanelJson(JSON.stringify(panel({ layout: "wrap" })), newId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.panel.layout).toBe("stack");
    expect(r.panel.widgets.map((w) => w.id)).toEqual(["w-stat", "w-bar"]);
    expect(r.panel.widgets[1].box?.w).toBe("fill");
  });

  it("rejects invalid JSON and wrong shapes", () => {
    expect(parsePanelJson("{ nope", newId)).toMatchObject({ ok: false, error: expect.stringContaining("Invalid JSON") });
    expect(parsePanelJson("[]", newId).ok).toBe(false);
    expect(parsePanelJson('{"title":"x"}', newId)).toMatchObject({ ok: false, error: '"widgets" must be a list.' });
    expect(parsePanelJson('{"widgets":[1]}', newId).ok).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const r = parsePanelJson('{"widgets":[{"id":"a","kind":"stat"},{"id":"b","kind":"blob"}]}', newId);
    expect(r).toEqual({ ok: false, error: 'Widget 2: unknown kind "blob".' });
  });

  it("fills in missing ids and flags and regenerates repeated ids", () => {
    n = 0;
    const r = parsePanelJson('{"widgets":[{"kind":"stat"},{"id":"a","kind":"text"},{"id":"a","kind":"value"}]}', newId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.panel.widgets.map((w) => w.id)).toEqual(["new-1", "a", "new-2"]);
    expect(r.panel.widgets.every((w) => w.visible)).toBe(true);
    expect(r.panel).toMatchObject({ id: "new-3", title: "", titleVisible: true, visible: true, background: "panel" });
  });
});

describe("customGauge widget (a vector gauge in a panel)", () => {
  const vector = normalizeGauge(STARTERS[1].gauge);

  it("round-trips its spec and width through the Code view's JSON (an old fontSize width moves to width)", () => {
    const p = panel({ widgets: [widget("customGauge", { sensor: "cpu.load", vector, fontSize: 140 })] });
    const r = parsePanelJson(JSON.stringify(p), () => "fresh");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.panel.widgets[0]).toMatchObject({ kind: "customGauge", sensor: "cpu.load", width: 140 });
    expect(r.panel.widgets[0].fontSize).toBeUndefined();
    expect(r.panel.widgets[0].vector).toEqual(vector);
  });

  it("keeps its spec and size on a change to another kind and back only where the kind reads them", () => {
    const g = widget("customGauge", { sensor: "cpu.load", vector, width: 140 });
    expect(convertKind(g, "bar").vector).toBeUndefined();
    // Its width is no font size: a text made from it keeps its own size.
    expect(convertKind(g, "text")).not.toHaveProperty("width");
    expect(convertKind(g, "text").fontSize).toBeUndefined();
    expect(convertKind(widget("bar", { sensor: "cpu.load" }), "customGauge")).toMatchObject({ kind: "customGauge", sensor: "cpu.load" });
  });
});

describe("normalizeWidget (thresholds, follow flags, config v9)", () => {
  it("drops scroll and format fields of the wrong type", () => {
    const bad = normalizeWidget(widget("text", { scroll: "yes", scrollSpeed: "50", scrollSpacing: -4, format: 5 } as never));
    expect(bad).not.toHaveProperty("scroll");
    expect(bad).not.toHaveProperty("scrollSpeed");
    expect(bad).not.toHaveProperty("scrollSpacing");
    expect(bad).not.toHaveProperty("format");
    const ok = normalizeWidget(widget("text", { scroll: true, scrollSpeed: 30, scrollSpacing: 0, format: "HH:mm" }));
    expect(ok).toMatchObject({ scroll: true, scrollSpeed: 30, scrollSpacing: 0, format: "HH:mm" });
  });

  it("keeps usable levels and flags, drops the rest", () => {
    const w = normalizeWidget(widget("stat", { thr: { warn: 70, crit: "off" }, follow: { colors: false } }));
    expect(w.thr).toEqual({ warn: 70, crit: "off" });
    expect(w.follow).toEqual({ colors: false });
    const junk = normalizeWidget(widget("stat", { thr: { warn: "x", crit: Number.NaN }, follow: { colors: "no", skin: false } } as never));
    expect(junk).not.toHaveProperty("thr");
    expect(junk).not.toHaveProperty("follow");
    expect(normalizeWidget(widget("stat", { thr: "70" } as never))).not.toHaveProperty("thr");
  });

  it("keeps thresholds on the kinds that colour by them only", () => {
    for (const kind of ["stat", "value", "bar", "gauge"] as const)
      expect(normalizeWidget(widget(kind, { thr: { warn: 1 } })).thr).toEqual({ warn: 1 });
    for (const kind of ["sparkline", "text", "clock", "customGauge"] as const)
      expect(normalizeWidget(widget(kind, { thr: { warn: 1 } }))).not.toHaveProperty("thr");
  });

  it("moves a Custom gauge's width off fontSize; a width already set wins; idempotent", () => {
    const once = normalizeWidget(widget("customGauge", { fontSize: 140 }));
    expect(once).toMatchObject({ width: 140 });
    expect(once).not.toHaveProperty("fontSize");
    expect(normalizeWidget(once)).toEqual(once);
    expect(normalizeWidget(widget("customGauge", { fontSize: 140, width: 90 }))).toEqual(widget("customGauge", { width: 90 }));
    // Other kinds keep their font size.
    expect(normalizeWidget(widget("stat", { fontSize: 40 })).fontSize).toBe(40);
    const plain = widget("stat");
    expect(normalizeWidget(plain)).toBe(plain);
  });

  it("moves a Gauge's ring size off fontSize; a size already set wins; idempotent; a change of kind carries no font size", () => {
    const once = normalizeWidget(widget("gauge", { fontSize: 56 }));
    expect(once).toMatchObject({ size: 56 });
    expect(once).not.toHaveProperty("fontSize");
    expect(normalizeWidget(once)).toEqual(once);
    expect(normalizeWidget(widget("gauge", { fontSize: 56, size: 90 }))).toEqual(widget("gauge", { size: 90 }));
    const text = convertKind(once, "text");
    expect(text).not.toHaveProperty("size");
    expect(text.fontSize).toBeUndefined();
    expect(convertKind(widget("stat", { fontSize: 40 }), "gauge")).not.toHaveProperty("fontSize");
    const r = parsePanelJson(JSON.stringify(panel({ widgets: [widget("gauge", { fontSize: 56 })] })), () => "n");
    expect(r.ok && r.panel.widgets[0].size).toBe(56);
  });

  it("runs where panels enter: a loaded v8 config, its saved panels, the Code view", () => {
    const gauge = () => widget("customGauge", { fontSize: 160 });
    const stored = {
      version: 8,
      profiles: [{ ...sampleProfile(), pages: [{ id: "pg", name: "Main", placements: [placement(panel({ widgets: [gauge()] }))] }] }],
      panelPresets: [{ id: "u1", name: "Mine", panel: panel({ widgets: [gauge()] }) }],
    };
    const loaded = upgradeConfig(stored as never);
    const zoneWidget = loaded.profiles[0].pages[0].placements[0].panel!.widgets[0];
    expect(zoneWidget).toMatchObject({ width: 160 });
    expect(zoneWidget).not.toHaveProperty("fontSize");
    expect(loaded.panelPresets![0].panel.widgets[0]).toMatchObject({ width: 160 });
    expect(upgradeConfig(JSON.parse(JSON.stringify(loaded)))).toEqual(loaded);
    const r = parsePanelJson(JSON.stringify(panel({ widgets: [gauge()] })), () => "n");
    expect(r.ok && r.panel.widgets[0].width).toBe(160);
  });

  it("a change of kind keeps the follow flags and drops thresholds where the kind has none", () => {
    const w = widget("stat", { thr: { warn: 70 }, follow: { colors: true } });
    expect(convertKind(w, "bar")).toMatchObject({ thr: { warn: 70 }, follow: { colors: true } });
    expect(convertKind(w, "sparkline")).not.toHaveProperty("thr");
    expect(convertKind(w, "sparkline").follow).toEqual({ colors: true });
  });
});
