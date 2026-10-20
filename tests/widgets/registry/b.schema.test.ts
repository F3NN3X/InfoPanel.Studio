/// <reference types="vite/client" />
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STANDARD_SETTINGS } from "@/modules/standard-settings";
import { settingKeys, type ModuleSetting, type ModuleSettings } from "@/modules/types";
import { fixtureSensors } from "@/widgets/__fixtures__";
import { GROUP_B } from "@/widgets/registry/b";

const SPECS = import.meta.glob<string>("/docs/redesign/widgets/docs/widgets/*.md", { query: "?raw", import: "default", eager: true });

/** The prop names of a spec's "Widget-specific" block: the leading word of each top-level comma-separated entry. */
function specProps(id: string): string[] {
  const md = Object.entries(SPECS).find(([p]) => p.endsWith(`/${id}.md`))?.[1] ?? "";
  const block = md.match(/Widget-specific:\n```\n([\s\S]*?)\n```/)?.[1] ?? "";
  const entries: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of block) {
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      entries.push(cur);
      cur = "";
    } else cur += ch;
  }
  entries.push(cur);
  return entries.flatMap((e) => e.trim().match(/^[A-Za-z]\w*/)?.[0] ?? []);
}

// Per template: the setting key carrying each spec prop (a collision with a standard key is stored under another name,
// the standard `label` is the custom title SensorValue reads as its label; thresholds, devices, units and the clock
// format are the shared keys since config v7).
const MANIFEST: Record<string, Record<string, string>> = {
  DriveSpace: { drive: "device" },
  StorageHealth: { disk: "device" },
  DiskIO: {},
  NetworkThroughput: { adapter: "device" },
  NetworkAdapters: { showDown: "showDown", showIpv6: "showIpv6", hideIp: "hideIp" },
  Clock: { format: "clock", showSeconds: "showSeconds", showDate: "showDate", face: "face" },
  Timer: { presets: "presets", pomodoro: "pomodoro", focusMin: "focusMin", breakMin: "breakMin" },
  CodingAgents: { agents: "agents", showPlan: "showPlan", showSessions: "showSessions", showUsage: "showUsage", limitStyle: "limitStyle", percent: "percent", history: "history" },
  Calendar: { weekStart: "weekStart" },
  Weather: { provider: "provider", location: "location", units: "tempUnit" },
  Forecast: { location: "location", days: "days", units: "tempUnit" },
  SensorValue: { sensor: "sensor", label: "label", display: "display", min: "min", max: "max", warn: "warn.value", crit: "crit.value", decimals: "decimals", unit: "unit" },
  SensorGroup: { sensors: "sensors", layout: "groupLayout", bars: "bars" },
  // Designed on the Gauges page: no spec doc; the title is the standard label.
  CustomGauge: {},
};
// Spec props with no setting of their own: the standard custom title carries SensorValue's label.
const STANDARD_CARRIED = new Set(["SensorValue.label"]);

const STANDARD_KEYS = new Set(STANDARD_SETTINGS.map((d) => d.key));
const defaultsOf = (settings: ModuleSetting[]): ModuleSettings => Object.fromEntries(settings.flatMap((d) => settingKeys(d).map((k) => [k, d.default])));

describe("registry group B schema", () => {
  it("covers every template", () => expect(GROUP_B.map((m) => m.id)).toEqual(Object.keys(MANIFEST)));

  describe.each(GROUP_B.map((m) => [m.id, m] as const))("%s", (id, mod) => {
    const props = MANIFEST[id];
    const own = (mod.settings ?? []).filter((d) => !STANDARD_KEYS.has(d.key));

    it("keeps the manifest, keys and enum defaults, and renders from its defaults", () => {
      expect(specProps(id).sort()).toEqual(Object.keys(props).sort());
      { // reaches every spec prop through exactly one setting
        for (const [prop, key] of Object.entries(props)) {
          if (STANDARD_CARRIED.has(`${id}.${prop}`)) expect(STANDARD_KEYS.has(key)).toBe(true);
          else expect(own.flatMap(settingKeys).filter((k) => k === key)).toHaveLength(1);
        }
      }
      { // has unique keys and none of its own colliding with a standard key
        const keys = (mod.settings ?? []).map((d) => d.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const [prop, key] of Object.entries(props)) if (!STANDARD_CARRIED.has(`${id}.${prop}`)) expect(STANDARD_KEYS.has(key)).toBe(false);
      }
      { // keeps every enum default inside its options
        for (const d of own.filter((x) => x.type === "select" && x.options)) expect(d.options!.map((o) => o.value)).toContain(d.default);
      }
      { // renders from its defaults
        const defaults = defaultsOf(mod.settings ?? []);
        expect(() => renderToString(mod.render(fixtureSensors(), defaults) as never)).not.toThrow();
      }
    });
  });

});
