/// <reference types="vite/client" />
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STANDARD_SETTINGS } from "@/modules/standard-settings";
import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import { fixtureSensors } from "../__fixtures__";
import { GROUP_B } from "./b";

const SPECS = import.meta.glob<string>("../../../docs/redesign/widgets/docs/widgets/*.md", { query: "?raw", import: "default", eager: true });

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
// the standard `label` is the custom title SensorValue reads as its label).
const MANIFEST: Record<string, Record<string, string>> = {
  DriveSpace: { drive: "drive" },
  StorageHealth: { disk: "disk" },
  DiskIO: {},
  NetworkThroughput: { adapter: "adapter" },
  NetworkAdapters: { showDown: "showDown", showIpv6: "showIpv6", hideIp: "hideIp" },
  Clock: { format: "format", showSeconds: "showSeconds", showDate: "showDate", face: "face" },
  Timer: { presets: "presets", pomodoro: "pomodoro", focusMin: "focusMin", breakMin: "breakMin" },
  CodingAgents: { agents: "agents", showPlan: "showPlan", showSessions: "showSessions", showUsage: "showUsage", limitStyle: "limitStyle", percent: "percent", history: "history" },
  Calendar: { weekStart: "weekStart" },
  Weather: { provider: "provider", location: "location", units: "units" },
  Forecast: { location: "location", days: "days", units: "units" },
  SensorValue: { sensor: "sensor", label: "label", display: "display", min: "min", max: "max", warn: "warn", crit: "crit", decimals: "decimals", unit: "unit" },
  SensorGroup: { sensors: "sensors", layout: "groupLayout", bars: "bars" },
  // Designed on the Gauges page: no spec doc; the title is the standard label.
  CustomGauge: {},
};
// Spec props with no setting of their own: the standard custom title carries SensorValue's label.
const STANDARD_CARRIED = new Set(["SensorValue.label"]);

const STANDARD_KEYS = new Set(STANDARD_SETTINGS.map((d) => d.key));
const defaultsOf = (settings: ModuleSetting[]): ModuleSettings => Object.fromEntries(settings.map((d) => [d.key, d.default]));

describe("registry group B schema", () => {
  it("covers every template", () => expect(GROUP_B.map((m) => m.id)).toEqual(Object.keys(MANIFEST)));

  describe.each(GROUP_B.map((m) => [m.id, m] as const))("%s", (id, mod) => {
    const props = MANIFEST[id];
    const own = (mod.settings ?? []).filter((d) => !STANDARD_KEYS.has(d.key));

    it("lists exactly the spec's widget-specific props in the manifest", () => {
      expect(specProps(id).sort()).toEqual(Object.keys(props).sort());
    });

    it("reaches every spec prop through exactly one setting", () => {
      for (const [prop, key] of Object.entries(props)) {
        if (STANDARD_CARRIED.has(`${id}.${prop}`)) expect(STANDARD_KEYS.has(key)).toBe(true);
        else expect(own.filter((d) => d.key === key)).toHaveLength(1);
      }
    });

    it("has unique keys and none of its own colliding with a standard key", () => {
      const keys = (mod.settings ?? []).map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const [prop, key] of Object.entries(props)) if (!STANDARD_CARRIED.has(`${id}.${prop}`)) expect(STANDARD_KEYS.has(key)).toBe(false);
    });

    it("keeps every enum default inside its options", () => {
      for (const d of own.filter((x) => x.type === "select" && x.options)) expect(d.options!.map((o) => o.value)).toContain(d.default);
    });

    it("renders from its defaults", () => {
      const defaults = defaultsOf(mod.settings ?? []);
      expect(() => renderToString(mod.render(fixtureSensors(), defaults) as never)).not.toThrow();
    });
  });

});
