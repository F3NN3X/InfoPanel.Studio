import { describe, expect, it } from "vitest";
import { STANDARD_SETTINGS } from "@/modules/standard-settings";
import { effectiveSettings, settingKeys, type SensorMap } from "@/modules/types";
import snapshot from "../__fixtures__/snapshot.json";
import { GROUP_A } from "./a";

const SPECS = import.meta.glob("../../../docs/redesign/widgets/docs/widgets/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const specOf = (id: string): string => Object.entries(SPECS).find(([p]) => p.endsWith(`/${id}.md`))?.[1] ?? "";

// Each spec prop and the settings that reach it: exactly one setting per prop (a flattened object or
// list prop is reached by its entries); `[]` = the spec lists no props. Thresholds, devices and units are
// reached through the shared keys (config v7): `warn.<q>` / `crit.<q>`, `device`, `tempUnit`.
const track = (n: number, threshold: boolean) => [`track${n}Label`, `track${n}Key`, ...(threshold ? [`track.${n}.warn`, `track.${n}.crit`] : [`track${n}Up`])];
const MANIFEST: Record<string, Record<string, string[]>> = {
  SystemOverview: { sections: ["sections"], colors: ["cpuColor", "gpuColor", "ramColor", "vramColor", "diskColor", "netColor"], unifiedColor: ["unifiedColor"], ring: ["ring"], coreView: ["coreView"], heatRamp: ["heatRamp"], details: ["details"], warn: ["warn.load"], crit: ["crit.load"] },
  MenuBar: { items: ["items"], stacked: ["stacked"], dropdown: ["dropdown"] },
  KpiTiles: { metrics: ["metrics"], lookback: ["lookback"] },
  StatusTracker: { tracks: [1, 2, 3].flatMap((n) => track(n, true)).concat(track(4, false), track(5, false)), samples: ["samples"] },
  SystemStatus: { warn: ["warn.load"], crit: ["crit.load"] },
  Vitals: { metrics: ["metrics"] },
  ServiceHealth: {},
  ProcessList: { sort: ["sort"], rows: ["rows"] },
  Uptime: { showSeconds: ["showSeconds"] },
  CpuMonitor: { cpu: ["device"], coreView: ["coreView"], coreMetric: ["coreMetric"], heatRamp: ["heatRamp"], warn: ["warn.load"], crit: ["crit.load"] },
  CoreHeatmap: { shape: ["shape"], ramp: ["ramp"], metric: ["metric"], showValues: ["showValues"], history: ["history"] },
  GpuRings: { outer: ["outer"], inner: ["inner"], colors: ["outerColor", "innerColor"] },
  GpuMonitor: { gpu: ["device"], warnTemp: ["warn.temp"], critTemp: ["crit.temp"] },
  MemoryUsage: { warn: ["warn.load"], crit: ["crit.load"] },
  Thermals: { sortBy: ["sortBy"], warn: ["warn.temp"], crit: ["crit.temp"], max: ["max"] },
  PowerDraw: { budget: ["budget"] },
  Fans: { maxRpm: ["maxRpm"], spin: ["spin"] },
};
// Template props beyond the spec block that the inspector also reaches, or spec words that are not props.
const EXTRA: Record<string, Record<string, string[]>> = {
  CoreHeatmap: { cpu: ["device"], hotOutline: ["hotOutline"] },
  GpuRings: { gpu: ["device"] },
  ServiceHealth: { layout: ["healthLayout"] },
  Thermals: { view: ["view"], discover: ["discover"], showFans: ["showFans"], fanColor: ["fanColor"], tempUnit: ["tempUnit"] },
};

const SENSORS = (snapshot as unknown as { sensors: SensorMap }).sensors;
const STANDARD_KEYS = new Set(STANDARD_SETTINGS.map((s) => s.key));

describe("group A inspector schema", () => {
  for (const [id, props] of Object.entries(MANIFEST)) {
    const mod = GROUP_A.find((m) => m.id === id);
    describe(id, () => {
      it("is registered", () => expect(mod).toBeDefined());
      if (!mod) return;
      const settings = mod.settings ?? [];
      const keys = settings.flatMap(settingKeys);
      const own = settings.slice(STANDARD_SETTINGS.length);

      it("names each spec prop in the manifest", () => {
        const block = /Widget-specific:\s*```\n([\s\S]*?)```/.exec(specOf(id))?.[1] ?? "";
        for (const p of Object.keys(props)) expect(block, `${p} is in the spec of ${id}`).toContain(p);
      });

      it("reaches every prop through exactly one setting", () => {
        for (const [prop, via] of Object.entries({ ...props, ...EXTRA[id] })) for (const k of via) expect(keys.filter((x) => x === k), `${prop} via ${k}`).toHaveLength(1);
      });

      it("keeps the template's own keys off the standard keys", () => {
        expect(own.map((s) => s.key).filter((k) => STANDARD_KEYS.has(k))).toEqual([]);
      });

      it("has every enum default inside its options", () => {
        for (const s of settings) {
          if (s.type !== "select" || !s.options || s.multiple) continue;
          expect(s.options.map((o) => o.value), s.key).toContain(String(s.default));
        }
      });

      it("renders from its default settings", () => {
        expect(mod.render(SENSORS, effectiveSettings(mod, {}))).toBeTruthy();
      });
    });
  }

  it("maps stored settings onto props", () => {
    const get = (id: string) => GROUP_A.find((m) => m.id === id)!;
    const so = get("SystemOverview");
    expect(so.render(SENSORS, { sections: "cpu,net", ring: "none", coreView: "off", netColor: "#fff", "warn.load": 60 })).toBeTruthy();
    expect(get("StatusTracker").render(SENSORS, { track2Key: "libre.x", track4Up: "Down" })).toBeTruthy();
    expect(get("Thermals").render(SENSORS, { sensorLimits: false, "warn.temp": 40, "crit.temp": 60, sortBy: "fixed" })).toBeTruthy();
  });
});
