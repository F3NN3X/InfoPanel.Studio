import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { followInfo, resetKeysOfSection, sectionsFor, widgetContext, widgetLookValues } from "@/components/studio/inspector-model";
import { parsePins, togglePin } from "@/components/studio/inspector/inspector-prefs";
import { filterSettings } from "@/components/studio/settings-model";
import { resolveWith } from "@/lib/style-resolve";
import { modules } from "@/modules";
import { thresholdsOf } from "@/modules/setting-readers";
import { effectiveSettings, type ModuleSettings } from "@/modules/types";
import { fixtureSensors } from "@/widgets/__fixtures__";

const mod = (id: string) => modules.find((m) => m.id === id)!;
const defsOf = (id: string) => mod(id).settings ?? [];
const view = (id: string, s: ModuleSettings) =>
  /data-wp-view="(\w+)"/.exec(renderToStaticMarkup(mod(id).render(fixtureSensors(), s) as never))?.[1];
const celsius = Object.entries(fixtureSensors()).find(([, v]) => v.unit === "°C")![0];
const NO_CARD = ["Clock", "CoreHeatmap", "CustomGauge", "GpuRings", "MeterBridge", "SystemOverview", "Timer", "Visualizer"];

describe("Small zones (SPEC §4.6): every widget × auto / full / card / dense", () => {
  const withRow = modules.filter((m) => (m.settings ?? []).some((d) => d.key === "compact"));

  it("every widget draws what each choice says", () => {
    expect(withRow.length).toBeGreaterThan(0);
    for (const { id } of withRow) {
      const options = defsOf(id).find((d) => d.key === "compact")!.options!.map((o) => o.value);
      const expected: Record<string, string> = { auto: "body", full: "body", card: "compact", dense: "studio" };
      // A widget without its own shell reads no data-wp-view: nothing to check.
      // Sensor Value draws its card for a numeric reading only.
      const base: ModuleSettings = id === "SensorValue" ? { sensor: celsius } : {};
      if (view(id, base) === undefined) continue;
      // Auto and Full draw the same body as the default; Card and Dense are the two that change it.
      for (const value of options.filter((v) => v === "card" || v === "dense")) expect(view(id, { ...base, compact: value }), `${id} ${value}`).toBe(expected[value]);
    }
  });

  it("omits Card on the widgets without a compact descriptor (§9 item 4)", () => {
    for (const id of NO_CARD) {
      const row = defsOf(id).find((d) => d.key === "compact");
      expect(row?.options?.map((o) => o.value) ?? [], id).not.toContain("card");
    }
  });

  it("hides the row where only Auto / Full remain; Density then shows without More", () => {
    for (const id of ["CustomGauge", "Timer"]) {
      const defs = defsOf(id);
      expect(defs.some((d) => d.key === "compact"), id).toBe(false);
      expect(defs.find((d) => d.key === "sizeTier")?.more, id).toBeFalsy();
    }
  });
});

describe("§9 item 2: no widget shows autoScale, variant or compactView", () => {
  it("none of the widgets does", () => {
    for (const { id } of modules) {
      for (const key of ["autoScale", "variant", "compactView", "layout", "alignX", "alignY"]) {
        expect(defsOf(id).some((d) => d.key === key || d.keyY === key), `${id}.${key}`).toBe(false);
      }
    }
  });
});

describe("§9 item 6: a locked Thresholds section", () => {
  const cpu = mod("CpuMonitor");
  const appearance = { profile: { values: { "warn.load": 60 }, locks: { thresholds: true } } };
  const own = { "warn.load": 75 };

  it("ignores the widget's own levels, custom or not", () => {
    const s = effectiveSettings(cpu, resolveWith(appearance, own, { thresholds: false }, undefined, cpu.settings) ?? {});
    expect(thresholdsOf(s, "load").warn).toBe(60);
  });

  it("reads Locked in the inspector", () => {
    expect(followInfo(appearance, { thresholds: false }, "thresholds").mode).toBe("locked");
  });
});

describe("§9 item 8: tempUnit = f in the profile", () => {
  const html = (id: string, tempUnit: "c" | "f", own: ModuleSettings = {}) =>
    renderToStaticMarkup(
      mod(id).render(fixtureSensors(), effectiveSettings(mod(id), resolveWith({ profile: { values: { tempUnit } } }, own, undefined, undefined, mod(id).settings) ?? {})) as never
    );
  it.each([
    ["Weather", {}],
    ["Thermals", {}],
    ["SystemOverview", { details: "full" }],
    ["SensorGroup", { sensors: celsius }],
  ] as const)("%s turns its temperatures to °F", (id, own) => {
    expect(html(id, "f", own)).not.toBe(html(id, "c", own));
  });

  it("SensorGroup labels them °F", () => {
    expect(html("SensorGroup", "f", { sensors: celsius })).toMatch(/°F/);
  });
});

describe("dotted keys (warn.load, crit.load) through search, pins and reset", () => {
  const cpu = widgetContext(mod("CpuMonitor"));
  const defs = defsOf("CpuMonitor");

  it("search finds the threshold row by its dotted key and by its label", () => {
    expect(filterSettings(defs, "warn.load").map((d) => d.key)).toEqual(["warn.load"]);
    expect(filterSettings(defs, "crit.load").map((d) => d.key)).toEqual(["warn.load"]);
    expect(filterSettings(defs, "threshold").map((d) => d.key)).toContain("warn.load");
  });

  it("pins keep a dotted key whole, and read the old renamed keys as the new ones", () => {
    expect(togglePin([], "warn.load")).toEqual(["warn.load"]);
    expect(parsePins(JSON.stringify({ CpuMonitor: ["warn.load", "layout", "alignX", "alignY"] }))).toEqual({ CpuMonitor: ["warn.load", "sizeTier", "align"] });
  });

  it("reset drops both keys of a changed threshold row", () => {
    const section = sectionsFor(cpu).find((s) => s.settings.some((d) => d.key === "warn.load"))!;
    const values = widgetLookValues({ own: { "crit.load": 95 }, levels: {}, follow: { thresholds: false } });
    expect(resetKeysOfSection(section, values)).toEqual(["warn.load", "crit.load"]);
  });
});
