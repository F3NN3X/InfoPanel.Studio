import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fixtureSensors } from "@/widgets/__fixtures__";
import { newPanel, newWidget, type WidgetKind } from "@/lib/layout";
import { arcv2Profile } from "@tests/lib/__fixtures__/arcv2-profile";
import { sampleProfile } from "@tests/lib/__fixtures__/sample-profile";
import { allPlacements } from "@/lib/pages";
import { panelPresets } from "@/lib/panelPresets";
import type { PanelDef } from "@/lib/panel-model";
import type { ModuleSettings } from "@/modules/types";
import { SKIN_LOOK_IDS } from "@/looks/ids";
import { SKINS } from "@/widgets/core/theme";
import { DEFAULT_ACCENT } from "@/widgets/core/look";
import { PanelView } from "@/components/widgets/PanelView";
import { loadPack } from "@/looks/pack-load";
import type { Look } from "@/looks/look";
import { PanelSkin, panelSkinOf, usePanelSkin } from "@/components/widgets/panel-skin";
import { chromeOf as packChromeOf } from "@/looks/chrome";
import { chromeOf } from "@/modules/standard-settings";
import type { Pack } from "@/looks/pack";

const sensors = fixtureSensors();

const shipped: [string, PanelDef, ModuleSettings | undefined][] = [
  ...panelPresets.map((p) => [`preset ${p.id}`, p.make(), p.settings] as [string, PanelDef, ModuleSettings | undefined]),
  ...[sampleProfile(), arcv2Profile()].flatMap((prof) =>
    allPlacements(prof).filter((pl) => pl.panel).map((pl, i) => [`${prof.id} panel ${i}`, pl.panel!, pl.settings] as [string, PanelDef, ModuleSettings | undefined])
  ),
];

/** Ids are generated per run; everything else must stay byte-identical. */
const html = (panel: PanelDef, settings?: ModuleSettings) =>
  renderToString(createElement(PanelView, { panel, settings, sensors })).replace(/(data-(?:panel|widget)-id=")[^"]*"/g, '$1"');

describe("panel widgets with skin auto", () => {
  // The clock widget renders the current time.
  beforeAll(() => vi.useFakeTimers({ now: new Date(2026, 0, 5, 13, 45, 12), toFake: ["Date"] }));
  afterAll(() => vi.useRealTimers());

  it("renders every shipped panel and preset without throwing, with no skin variables", () => {
    for (const [name, panel, settings] of shipped) {
      const out = html(panel, settings);
      expect(out, name).toContain("wp-panel");
      if (!settings?.lookId || settings.lookId === "classic") expect(out, name).not.toContain("--w-track");
    }
  });
  it("treats an explicit Classic like an unset Look", () => {
    const [, panel, settings] = shipped[1];
    expect(html(panel, { ...settings, lookId: "classic", graph: "auto", meter: "auto" })).toBe(html(panel, settings));
  });
});

/** One panel with a sensor-less widget of each kind, so the renderers draw their empty states. */
const kinds = (...list: WidgetKind[]): PanelDef => ({ ...newPanel("Skin"), widgets: list.map((k) => ({ ...newWidget(k), visible: true, label: k })) });
const draw = (kind: WidgetKind, settings: ModuleSettings) => html(kinds(kind), settings);

describe("panel widgets with a skin set", () => {
  it.each(SKIN_LOOK_IDS)("renders every widget kind in the %s skin with the skin's variables", (lookId) => {
    const panel = kinds("bar", "gauge", "sparkline", "stat", "value", "clock");
    const out = html(panel, { lookId });
    expect(out).toContain("--w-track");
    expect(out).toContain("wp-panel");
  });
  it("draws a bar with the core meter in the chosen style", () => {
    expect(draw("bar", { lookId: "fluent" })).toContain("rounded-full");
    expect(draw("bar", { lookId: "default" })).toContain("rounded-full");
    expect(draw("bar", { lookId: "fluent", meter: "blocks" })).toContain("rounded-[1px]");
    expect(draw("bar", { lookId: "default", meter: "blocks" })).toContain("rounded-[1px]");
    expect(draw("bar", { lookId: "tui" })).not.toBe(draw("bar", {}));
  });
  it("draws a gauge with the core ring", () => {
    expect(draw("gauge", {})).not.toContain("viewBox=\"0 0 100 100\"");
    expect(draw("gauge", { lookId: "fluent" })).toContain("viewBox=\"0 0 100 100\"");
    expect(draw("gauge", { lookId: "default" })).toContain("viewBox=\"0 0 100 100\"");
  });
  it("draws a sparkline with the core graph", () => {
    expect(draw("sparkline", {})).toContain("wp-spark");
    expect(draw("sparkline", { lookId: "fluent" })).toContain("wp-spark h-12");
    expect(draw("sparkline", { lookId: "default" })).toContain("wp-spark h-12");
  });
  it("sets the skin's numerals on stat, value and clock", () => {
    for (const kind of ["stat", "value", "clock"] as const) expect(draw(kind, { lookId: "tui" })).not.toBe(draw(kind, {}));
  });
  it("maps the core text and track variables onto the panel", () => {
    expect(draw("stat", { lookId: "fluent" })).toContain("--w-track");
    // A panel stored under the v16 `default` skin keeps drawing the core Default skin (G1): the hidden `default` Look.
    expect(draw("stat", { lookId: "default" })).toContain("--w-track");
    expect(draw("stat", {})).not.toContain("--w-track");
    // Classic is the panel's own look, as the v16 skin `auto` was (the v16 `default` spelling folds into it).
    expect(draw("stat", { lookId: "classic" })).not.toContain("--w-track");
  });
});

describe("panel colors", () => {
  const all = kinds("bar", "gauge", "sparkline", "stat", "value", "shape");
  it("never draws with the theme's --accent, a dark hover surface rather than a color", () => {
    for (const lookId of [undefined, ...SKIN_LOOK_IDS]) expect(html(all, lookId ? { lookId } : {})).not.toContain("hsl(var(--accent))");
  });
  it("gives its widgets the accent a core widget would take: the look's, else the skin's, else the default", () => {
    expect(html(all, { accent: "#ff0000" })).toContain("--wp-accent:#ff0000");
    expect(html(all, { lookId: "synth" })).toContain(`--wp-accent:${SKINS.synth.accent}`);
    expect(html(all, {})).toContain(`--wp-accent:${DEFAULT_ACCENT}`);
  });
});

const Probe = () => <i data-fill={usePanelSkin()?.numFill} />;

describe("a panel on a pack Look (L67)", () => {
  let pack: Pack;
  beforeAll(async () => {
    pack = (await loadPack("paper"))!;
  });
  const chrome = chromeOf({});

  it("draws in the default skin with the pack's values; Classic and a skin are as they were", () => {
    expect(panelSkinOf({ lookId: "paper" }, pack)).toBe("default");
    expect(panelSkinOf({ lookId: "paper" })).toBeUndefined();
    expect(panelSkinOf({ lookId: "synth" }, undefined)).toBe("synth");
    expect(panelSkinOf({ lookId: "classic" })).toBeUndefined();
  });
  it("gives its widgets the pack's T3 values", () => {
    const out = (p?: Pack) => renderToString(<PanelSkin skin={p ? "default" : undefined} chrome={chrome} pack={p}><Probe /></PanelSkin>);
    expect(out(pack)).toContain("linear-gradient(90deg");
    expect(out(undefined)).not.toContain("data-fill");
  });
  it("re-scopes the card's tokens to the pack's colours: hex, rgb() and hsl() as drawn (L98 L-8), not a colour it cannot read", () => {
    const v = pack.chrome!.panel.vars as Record<string, string>;
    expect(Object.keys(v).sort()).toEqual(["--border", "--card", "--card-foreground", "--foreground", "--muted-foreground"]);
    expect(v["--card"]).toBe("0 0% 100%");
    const withMuted = (value: string) => packChromeOf({ ...pack.look, t1: { ...pack.look.t1, light: { ...pack.look.t1.light, muted: { value } } } } as Look).panel.vars;
    expect(withMuted("rgb(1 2 3)")).toHaveProperty("--muted-foreground", "210 50% 1%");
    expect(withMuted("oklch(50% 0 0)")).toHaveProperty("--muted-foreground", withMuted("#636363")["--muted-foreground" as never]);
    expect(withMuted("color-mix(in srgb, #202020, #000)")).not.toHaveProperty("--muted-foreground");
  });
  it("drops an item's own colour that vanishes on the pack's card (a white item on Paper), and nothing else", () => {
    const panel = kinds("stat", "bar", "value");
    const coloured = { ...panel, widgets: [{ ...panel.widgets[0], color: "#ffffff" }, { ...panel.widgets[1], color: "#5B3FD4" }, { ...panel.widgets[2], color: "#FFFFFFFF" }] };
    const { legible } = pack.chrome!.panel;
    expect(legible(coloured).widgets.map((w) => w.color)).toEqual([undefined, "#5B3FD4", undefined]);
    expect(legible(panel)).toBe(panel);
  });
});
