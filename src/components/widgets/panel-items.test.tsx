import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { newPanel, type PanelDef, type Widget } from "@/lib/layout";
import { arcv2Profile } from "@/lib/__fixtures__/arcv2-profile";
import { sampleProfile } from "@/lib/__fixtures__/sample-profile";
import { allPlacements } from "@/lib/pages";
import { panelPresets } from "@/lib/panelPresets";
import type { ModuleSettings, SensorMap } from "@/modules/types";
import { fixtureSensors } from "@/widgets/__fixtures__";
import { STATE, TONES } from "@/widgets/core/theme";
import { PanelView } from "./PanelView";
import { resolvedPanel, tonedItem, tonedPanel } from "./panel-items";

const sensors = (value: number, unit: string): SensorMap => ({ "x.v": { value, unit } }) as SensorMap;
const stat = (extra: Partial<Widget> = {}): Widget => ({ id: "w", kind: "stat", visible: true, sensor: "x.v", ...extra });
const theme: ModuleSettings = { "warn.load": 80, "crit.load": 92, "warn.temp": 80, "crit.temp": 90, "warn.value": 70, "crit.value": 90 };

const color = (w: Widget, look: ModuleSettings, map: SensorMap) => tonedItem(w, look, map).color;

describe("threshold colours of a panel widget", () => {
  it("a % sensor reads the load levels", () => {
    expect(color(stat(), theme, sensors(79, "%"))).toBeUndefined();
    expect(color(stat(), theme, sensors(85, "%"))).toBe(TONES.warn);
    expect(color(stat(), theme, sensors(95, "%"))).toBe(TONES.crit);
  });

  it("a ° sensor reads the temperature levels", () => {
    expect(color(stat(), theme, sensors(85, "°C"))).toBe(TONES.warn);
    expect(color(stat(), theme, sensors(91, "°C"))).toBe(TONES.crit);
    expect(color(stat(), { ...theme, "warn.temp": 95, "crit.temp": 99 }, sensors(91, "°C"))).toBeUndefined();
  });

  it("any other unit reads the value levels (the shown value, times the scale)", () => {
    expect(color(stat(), theme, sensors(75, "MB/s"))).toBe(TONES.warn);
    expect(color(stat({ scale: 0.5 }), theme, sensors(150, "MB/s"))).toBe(TONES.warn);
    expect(color(stat(), { "warn.load": 10 }, sensors(75, "MB/s"))).toBeUndefined();
  });

  it("off disables a level; a custom widget's own levels win", () => {
    const own = stat({ thr: { warn: "off", crit: 90 } });
    expect(color(own, theme, sensors(85, "%"))).toBeUndefined();
    expect(color(own, theme, sensors(95, "%"))).toBe(TONES.crit);
    expect(color(stat({ thr: { warn: "off", crit: "off" } }), theme, sensors(99, "%"))).toBeUndefined();
    // The profile locks Thresholds: the panel's levels again.
    expect(tonedItem(own, theme, sensors(85, "%"), { thresholds: true }).color).toBe(TONES.warn);
  });

  it("nothing trips where no theme level sets the quantity (nothing repaints on upgrade)", () => {
    expect(color(stat(), {}, sensors(99, "%"))).toBeUndefined();
    expect(color(stat(), {}, sensors(99, "°C"))).toBeUndefined();
  });

  it("takes the palette's warning / critical colour when a theme sets it, a gauge a hex state colour", () => {
    expect(color(stat(), { ...theme, warn: "#123456" }, sensors(85, "%"))).toBe("#123456");
    expect(color(stat({ kind: "gauge" }), theme, sensors(95, "%"))).toBe(STATE.crit);
    expect(color(stat({ kind: "bar" }), theme, sensors(95, "%"))).toBe(TONES.crit);
  });

  it("colours only stat, value, bar and gauge with a bound live value", () => {
    expect(color(stat({ kind: "sparkline" }), theme, sensors(99, "%"))).toBeUndefined();
    expect(color(stat({ kind: "text" }), theme, sensors(99, "%"))).toBeUndefined();
    expect(color(stat({ sensor: undefined }), theme, sensors(99, "%"))).toBeUndefined();
    expect(color(stat(), theme, {})).toBeUndefined();
  });

  it("PanelView draws the value in the colour", () => {
    const panel: PanelDef = { ...newPanel("CPU"), widgets: [stat()] };
    const html = (value: number) => renderToString(createElement(PanelView, { panel, settings: theme, sensors: sensors(value, "%") }));
    expect(html(95)).toContain(`color:${TONES.crit}`);
    expect(html(50)).not.toContain(TONES.crit);
  });
});

describe("render parity for unchanged panels", () => {
  const shipped: PanelDef[] = [
    ...panelPresets.map((p) => p.make()),
    ...[sampleProfile(), arcv2Profile()].flatMap((prof) => allPlacements(prof).flatMap((pl) => (pl.panel ? [pl.panel] : []))),
  ];
  const live = fixtureSensors();

  it.each(shipped.map((p, i) => [i, p] as const))("shipped panel %i draws its widgets as they are", (_i, panel) => {
    expect(resolvedPanel(panel, {})).toBe(panel);
    expect(tonedPanel(panel, {}, live)).toBe(panel);
  });

  it("a widget following the panel picks up the panel's decimals; one with its own keeps them", () => {
    const panel: PanelDef = { ...newPanel("CPU"), widgets: [stat(), stat({ id: "b", decimals: 0 })] };
    const [following, own] = resolvedPanel(panel, { decimals: "2" }).widgets;
    expect(following.decimals).toBe(2);
    expect(own.decimals).toBe(0);
  });
});
