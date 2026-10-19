import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { newPanel, newWidget } from "@/lib/layout";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { normalizeGauge } from "@/lib/infopanel/gauges/vector";
import type { PanelDef, Widget } from "@/lib/panel-model";
import type { SensorMap } from "@/modules/types";
import { PanelView } from "./PanelView";

const draw = (panel: PanelDef, sensors: SensorMap = {}) =>
  renderToString(createElement(PanelView, { panel, sensors })).replace(/(data-(?:panel|widget)-id=")[^"]*"/g, '$1"');
const panelOf = (extra: Partial<Widget>): PanelDef => ({
  ...newPanel("Gauges"),
  widgets: [{ ...newWidget("customGauge"), visible: true, sensor: "cpu.load", ...extra }],
});

describe("a Custom gauge widget in a panel", () => {
  it("draws the gauge's SVG, the default spec when it has none", () => {
    const html = draw(panelOf({}));
    expect(html).toContain("<svg");
    expect(html).toContain("wp-gauge");
  });

  it("draws the spec it holds, wide as the widget's size says", () => {
    const bar = normalizeGauge(STARTERS.find((s) => s.name === "Bar")!.gauge);
    const html = draw(panelOf({ vector: bar, fontSize: 200 }));
    expect(html).toContain('style="width:200px"');
    expect(html).not.toBe(draw(panelOf({})));
  });

  it("follows its sensor's value", () => {
    const at = (value: number) => draw(panelOf({}), { "cpu.load": { value, unit: "%" } } as SensorMap);
    expect(at(80)).not.toBe(at(10));
  });
});
