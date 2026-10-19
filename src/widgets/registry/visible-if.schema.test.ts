import { describe, expect, it } from "vitest";
import type { DashboardModule, ModuleSetting, ModuleSettings } from "@/modules/types";
import { GROUP_A } from "./a";
import { GROUP_B } from "./b";

// Groups C, D and E are swept by their own change; this guards the dependent settings of A and B (backlog X4).
const MODULES: DashboardModule[] = [...GROUP_A, ...GROUP_B];
const settingsOf = (id: string): ModuleSetting[] => MODULES.find((m) => m.id === id)?.settings ?? [];
const defaultsOf = (settings: ModuleSetting[]): ModuleSettings => Object.fromEntries(settings.map((d) => [d.key, d.default]));
const shown = (id: string, key: string, over: ModuleSettings): boolean => {
  const def = settingsOf(id).find((d) => d.key === key);
  expect(def, `${id}.${key} exists`).toBeDefined();
  return def!.visibleIf ? def!.visibleIf({ ...defaultsOf(settingsOf(id)), ...over }) : true;
};

// Each dependent setting with a mode that shows it and one that hides it.
const GATED: [id: string, key: string, shows: ModuleSettings, hides: ModuleSettings][] = [
  ["CpuMonitor", "heatRamp", { coreView: "heatmap" }, { coreView: "bars" }],
  ["CpuMonitor", "heatRamp", { coreView: "heatmap" }, { coreView: "off" }],
  ["CpuMonitor", "coreMetric", { coreView: "bars" }, { coreView: "off" }],
  ["CoreHeatmap", "hotOutline", { shape: "grid" }, { shape: "hex" }],
  ["CoreHeatmap", "hotOutline", { shape: "grid" }, { shape: "waterfall" }],
  ["CoreHeatmap", "showValues", { shape: "grid" }, { shape: "radial" }],
  ["CoreHeatmap", "showValues", { shape: "hex" }, { shape: "waterfall" }],
  ["NetworkThroughput", "chart", { sparkline: true }, { sparkline: false }],
  ["Weather", "location", { provider: "yr" }, { provider: "owm" }],
  ["Weather", "location", { provider: "auto" }, { provider: "owm" }],
  ["SensorValue", "min", { display: "gauge" }, { display: "value" }],
  ["SensorValue", "max", { display: "bar" }, { display: "spark" }],
  ...["sensors", "groupLayout", "bars", "groupMax", "tempUnit", "decimals", "warn.value"].map((k): [string, string, ModuleSettings, ModuleSettings] => ["SensorGroup", k, { auto: false }, { auto: true }]),
  ["SensorGroup", "maxRows", { auto: true }, { auto: false }],
  ["SystemOverview", "showDiskIo", { sections: "cpu,disk" }, { sections: "cpu,gpu,ram" }],
  ["SystemOverview", "warn.full", { sections: "disk" }, { sections: "cpu" }],
  ["SystemOverview", "warn.full", { sections: "vram" }, { sections: "net" }],
  ["SystemOverview", "netColor", { sections: "net" }, { sections: "cpu,gpu,ram,vram,disk" }],
  ["SystemOverview", "gpuLabel", { sections: "gpu" }, { sections: "cpu,ram" }],
  ["SystemOverview", "heatRamp", { sections: "cpu", coreView: "heatmap" }, { sections: "cpu", coreView: "bars" }],
  ["SystemOverview", "heatRamp", { sections: "cpu", coreView: "heatmap" }, { sections: "gpu", coreView: "heatmap" }],
  ["SystemOverview", "historyLength", { sparkline: true }, { sparkline: false }],
];

describe("dependent settings are gated", () => {
  it.each(GATED)("%s.%s follows its driver", (id, key, shows, hides) => {
    expect(shown(id, key, shows)).toBe(true);
    expect(shown(id, key, hides)).toBe(false);
  });

  // A gate that never opens, or never closes, is a setting shown with no consumer (or a dead control).
  describe.each(MODULES.filter((m) => m.settings?.some((d) => d.visibleIf)).map((m) => [m.id, m] as const))("%s", (_id, mod) => {
    const settings = mod.settings ?? [];
    const base = defaultsOf(settings);
    const variants: ModuleSettings[] = [
      base,
      ...settings.flatMap((d) =>
        d.type === "boolean"
          ? [{ ...base, [d.key]: !d.default }]
          : d.type === "select" && d.options
            ? // a multiple select: each option alone, and none (SystemOverview's sections gate their settings)
              [...d.options.map((o) => ({ ...base, [d.key]: o.value })), ...(d.multiple ? [{ ...base, [d.key]: "" }] : [])]
            : [],
      ),
    ];
    // CustomGauge.gauge (the spec's JSON, edited on the Gauges page) and .frames (kept for an export) are hidden on purpose, never fields.
    it.each(settings.filter((d) => d.visibleIf && !(mod.id === "CustomGauge" && (d.key === "gauge" || d.key === "frames"))).map((d) => [d.key, d] as const))("%s is shown in some mode and hidden in another", (_key, def) => {
      const seen = new Set(variants.map((v) => def.visibleIf!(v)));
      expect([...seen].sort()).toEqual([false, true]);
    });
  });
});
