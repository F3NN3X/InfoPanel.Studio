import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { withPastedStyle } from "@/components/studio/studio-actions";
import { modules } from "@/modules";
import { thresholdsOf } from "@/modules/setting-readers";
import { effectiveSettings, type ModuleSettings } from "@/modules/types";
import { fixtureSensors } from "@/widgets/__fixtures__";
import { normalizeAppearancePresets } from "@/lib/appearance-presets";
import { CONFIG_VERSION, mergeConfig, type Placement, type StoredConfig } from "@/lib/layout";
import { migratePlacementV7, migrateProfileV7, migrateSettingsV7, migrateStyleV7 } from "@/lib/settings-migrate";
import { resolveWith } from "@/lib/style-resolve";

const zone = (id: string, module: string, extra: Record<string, unknown> = {}) => ({
  id,
  module,
  colStart: 1,
  rowStart: 1,
  colSpan: 1,
  rowSpan: 1,
  visible: true,
  ...extra,
});

const v6 = (zones: Record<string, unknown>[], extra: Record<string, unknown> = {}): StoredConfig =>
  ({
    version: 6,
    activeProfile: "auto",
    profiles: [{ id: "p", name: "Desk", width: 1920, height: 1080, cols: 12, rows: 6, fit: "scroll", pages: [{ id: "main", name: "Main", placements: zones }] }],
    ...extra,
  }) as unknown as StoredConfig;

const zonesOf = (c: ReturnType<typeof mergeConfig>) => c.profiles[0].pages[0].placements;
const one = (module: string, settings: ModuleSettings, extra: Record<string, unknown> = {}) =>
  zonesOf(mergeConfig(v6([zone("a", module, { settings, ...extra })])))[0];
const settingsOf = (module: string, settings: ModuleSettings) => migrateSettingsV7(module, settings, true);

describe("v7 §6.1: the standard block", () => {
  it.each([
    [{ variant: "studio", compactView: "on" }, { compact: "dense" }],
    [{ variant: "default", compactView: "on" }, { compact: "card" }],
    [{ compactView: "off" }, { compact: "full" }],
    [{ compactView: "auto", variant: "default" }, undefined],
  ])("variant + compactView %j → %j", (input, out) => {
    expect(settingsOf("CpuMonitor", input).settings).toEqual(out);
  });

  it("drops a Card the widget cannot draw, and Dense where it has no summary either", () => {
    expect(settingsOf("Clock", { compactView: "on" }).settings).toBeUndefined();
    expect(settingsOf("Clock", { variant: "studio" }).settings).toEqual({ compact: "dense" });
    expect(settingsOf("WebPage", { variant: "studio" }).settings).toBeUndefined();
  });

  it.each([
    ["card", "lg"],
    ["simple", "xs"],
  ])("layout %s → sizeTier %s", (layout, tier) => {
    expect(settingsOf("CpuMonitor", { layout }).settings).toEqual({ sizeTier: tier });
  });

  it("alignX + alignY → the 9-cell align, between → alignSpread", () => {
    expect(settingsOf("CpuMonitor", { alignX: "end", alignY: "start" }).settings).toEqual({ align: "tr" });
    expect(settingsOf("CpuMonitor", { alignX: "between", alignY: "end" }).settings).toEqual({ align: "bc", alignSpread: true });
    expect(settingsOf("CpuMonitor", { alignX: "between" }).settings).toEqual({ alignSpread: true });
    expect(settingsOf("CpuMonitor", { alignX: "auto", alignY: "auto" }).settings).toBeUndefined();
  });

  it("leaves a lone axis as it is (a cell would add centring on the other axis); alignOf reads it", () => {
    expect(settingsOf("CpuMonitor", { alignY: "end" }).settings).toEqual({ alignY: "end" });
    expect(settingsOf("CpuMonitor", { alignX: "center", alignY: "auto" }).settings).toEqual({ alignX: "center", alignY: "auto" });
    const cpu = modules.find((m) => m.id === "CpuMonitor")!;
    const html = renderToStaticMarkup(cpu.render(fixtureSensors(), { alignX: "center" }) as never);
    expect(html).toContain('data-wp-x="center"');
    expect(html).not.toContain("data-wp-y=");
  });

  it("drops autoScale everywhere, and a stored showTitle on the title-only widgets", () => {
    expect(settingsOf("CpuMonitor", { autoScale: true, showTitle: true }).settings).toEqual({ showTitle: true });
    expect(settingsOf("Clock", { showTitle: true }).settings).toBeUndefined();
    expect(settingsOf("SystemOverview", { showTitle: false, title: "Rig" }).settings).toEqual({ title: "Rig" });
  });
});

describe("v7 §6.2: thresholds", () => {
  it.each([
    ["SystemStatus", { warn: 70, crit: 85 }, { "warn.load": 70, "crit.load": 85 }],
    ["DriveSpace", { warn: 80, crit: 92 }, { "warn.full": 80, "crit.full": 92 }],
    [
      "SystemOverview",
      { loadWarn: 60, loadCrit: 80, tempWarn: 70, tempCrit: 85, vramWarn: 88 },
      // the VRAM critical was the load critical
      { "warn.load": 60, "crit.load": 80, "warn.temp": 70, "crit.temp": 85, "warn.full": 88, "crit.full": 80 },
    ],
    ["SensorValue", { warn: "50", crit: "" }, { "warn.value": 50, "crit.value": "off" }],
    ["MeterBridge", { warnDb: -18, clipDb: -6 }, { "warn.db": -18, "crit.db": -6 }],
  ])("%s %j → %j, Thresholds custom", (module, input, out) => {
    const z = one(module, input);
    expect(z.settings).toEqual(out);
    expect(z.follow).toEqual({ thresholds: false });
  });

  it("Thermals: 0 = each sensor's limits (the default), a level = one threshold with sensor limits off", () => {
    expect(settingsOf("Thermals", { warn: 0, crit: 0 }).settings).toBeUndefined();
    expect(settingsOf("Thermals", { warn: 70, crit: 95 })).toEqual({ settings: { sensorLimits: false, "warn.temp": 70, "crit.temp": 95 }, custom: ["thresholds"] });
  });

  it("Thermals with one level: the other takes the CPU sensor's old limit (no per-sensor mix in v7)", () => {
    expect(settingsOf("Thermals", { warn: 70, crit: 0 }).settings).toEqual({ sensorLimits: false, "warn.temp": 70, "crit.temp": 90 });
    expect(settingsOf("Thermals", { crit: 100 }).settings).toEqual({ sensorLimits: false, "warn.temp": 80, "crit.temp": 100 });
  });

  it("one level of a pair stored: the other keeps its old default as an own value (no shift to the theme)", () => {
    expect(settingsOf("CpuMonitor", { warn: 70 }).settings).toEqual({ "warn.load": 70, "crit.load": 90 });
    expect(settingsOf("GpuMonitor", { critTemp: 95 }).settings).toEqual({ "warn.temp": 75, "crit.temp": 95 });
    expect(settingsOf("MeterBridge", { warnDb: -12 }).settings).toEqual({ "warn.db": -12, "crit.db": -6 });
    expect(settingsOf("SensorValue", { warn: "50" }).settings).toEqual({ "warn.value": 50, "crit.value": "off" });
    expect(settingsOf("StatusTracker", { track1Warn: "40" }).settings).toEqual({ "track.1.warn": 40, "track.1.crit": 80 });
  });

  it("SystemOverview: a stored loadCrit carries to the VRAM critical", () => {
    expect(settingsOf("SystemOverview", { vramWarn: 85 }).settings).toEqual({ "warn.full": 85, "crit.full": 92 });
    expect(settingsOf("SystemOverview", { vramWarn: 85, loadCrit: 88 }).settings).toEqual({ "warn.load": 80, "crit.load": 88, "warn.full": 85, "crit.full": 88 });
  });

  it("warn / crit that are not levels (a palette colour) are left alone, on load and in v6", () => {
    expect(migrateSettingsV7("CpuMonitor", { warn: "#ff0000" }, false).settings).toEqual({ warn: "#ff0000" });
    expect(migrateSettingsV7("Thermals", { warn: "#ff0000", crit: 100 }, false).settings).toEqual({ warn: "#ff0000", sensorLimits: false, "warn.temp": 80, "crit.temp": 100 });
    // blank is an old "off" only in a pre-v7 config
    expect(migrateSettingsV7("SensorValue", { crit: "" }, false).settings).toEqual({ crit: "" });
    expect(migrateSettingsV7("SensorValue", { crit: "" }, true).settings).toEqual({ "warn.value": "off", "crit.value": "off" });
  });

  it("a v5 widget with only threshold levels gets no custom palette (the roles share the names)", () => {
    const z = zonesOf(mergeConfig({ ...v6([zone("a", "CpuMonitor", { settings: { warn: 70, crit: 85 } })]), version: 5 } as StoredConfig))[0];
    expect(z.follow).toEqual({ thresholds: false });
  });

  it("StatusTracker: trackNWarn / trackNCrit → track.N.warn / track.N.crit, blank = off", () => {
    expect(settingsOf("StatusTracker", { track1Warn: "50", track1Crit: "80", track3Warn: "" }).settings).toEqual({
      "track.1.warn": 50,
      "track.1.crit": 80,
      "track.3.warn": "off",
      "track.3.crit": 92,
    });
  });

  it("a value that is not a level stays where it is", () => {
    expect(settingsOf("SensorValue", { warn: "abc" }).settings).toEqual({ warn: "abc" });
  });
});

describe("v7 §9 item 9: a stored CpuMonitor 75 stays, an unstored one follows 80", () => {
  const cpu = modules.find((m) => m.id === "CpuMonitor")!;
  const levelsOf = (z: Placement) => thresholdsOf(effectiveSettings(cpu, resolveWith({}, z.settings, z.follow, undefined, cpu.settings) ?? {}), "load");

  it("stored warn 75: kept, Thresholds custom", () => {
    const z = one("CpuMonitor", { warn: 75 });
    expect(z.follow).toEqual({ thresholds: false });
    // its unstored critical keeps the old 90
    expect(levelsOf(z)).toEqual({ warn: 75, crit: 90 });
  });

  it("unstored: follows the theme's 80 / 92", () => {
    const z = one("CpuMonitor", { accent: "#f00" });
    expect(z.follow?.thresholds).toBeUndefined();
    expect(levelsOf(z)).toEqual({ warn: 80, crit: 92 });
  });
});

describe("v7 §6.2: devices, units, decimals, clock", () => {
  it.each([
    ["CpuMonitor", "cpu"],
    ["GpuRings", "gpu"],
    ["DriveSpace", "drive"],
    ["NowPlaying", "liveSource"],
  ])("%s.%s → device; blank → absent", (module, key) => {
    expect(settingsOf(module, { [key]: "x1" }).settings).toEqual({ device: "x1" });
    expect(settingsOf(module, { [key]: "" }).settings).toBeUndefined();
  });

  it("an empty shared device key is dropped", () => {
    expect(settingsOf("AudioMeter", { device: "" }).settings).toBeUndefined();
  });

  it.each([
    ["MeterBridge", "channels"],
    ["NowPlaying", "liveSources"],
  ])("%s.%s → devices", (module, key) => {
    expect(settingsOf(module, { [key]: "a,b" }).settings).toEqual({ devices: "a,b" });
  });

  it("units → tempUnit (C dropped as the old default, F kept custom)", () => {
    expect(one("Weather", { units: "F" })).toMatchObject({ settings: { tempUnit: "f" }, follow: { format: false } });
    expect(one("Forecast", { units: "C" }).settings).toBeUndefined();
  });

  it("an own SensorValue decimals auto (v7) stays", () => {
    expect(migrateSettingsV7("SensorValue", { decimals: "auto" }, false).settings).toEqual({ decimals: "auto" });
    expect(settingsOf("SensorValue", { decimals: "auto" }).settings).toEqual({ decimals: "auto" });
  });

  it("decimals: SystemOverview 0 (old default) dropped, 1 kept; SensorValue 0–4 kept, blank = auto; groupDecimals → decimals", () => {
    expect(settingsOf("SystemOverview", { decimals: "0" }).settings).toBeUndefined();
    expect(settingsOf("SystemOverview", { decimals: "1" })).toEqual({ settings: { decimals: "1" }, custom: ["format"] });
    expect(settingsOf("SensorValue", { decimals: "4" }).settings).toEqual({ decimals: "4" });
    expect(settingsOf("SensorValue", { decimals: "" }).settings).toBeUndefined();
    expect(settingsOf("SensorGroup", { groupDecimals: " 3 " }).settings).toEqual({ decimals: "3" });
    expect(settingsOf("SensorGroup", { groupDecimals: "x" }).settings).toBeUndefined();
  });

  it("rateUnit and meterBallistics: themed now; the old default dropped, another value custom", () => {
    expect(settingsOf("NetworkThroughput", { rateUnit: "auto" }).settings).toBeUndefined();
    expect(settingsOf("MenuBar", { rateUnit: "bits" }).custom).toEqual(["format"]);
    expect(settingsOf("AudioMeter", { meterBallistics: "peak" }).settings).toBeUndefined();
    expect(settingsOf("WaveLink", { meterBallistics: "vu" }).custom).toEqual(["motion"]);
    // Motion followed: its ignored own smoothing goes, so turning it custom keeps VU and changes nothing else
    expect(settingsOf("MeterBridge", { meterBallistics: "vu", smoothing: "smooth" })).toEqual({ settings: { meterBallistics: "vu" }, custom: ["motion"] });
    // already custom: nothing to flip, smoothing applied and stays
    expect(migrateSettingsV7("MeterBridge", { meterBallistics: "vu", smoothing: "smooth" }, true, { motion: false })).toEqual({
      settings: { meterBallistics: "vu", smoothing: "smooth" },
      custom: [],
    });
    expect(one("AudioMeter", { meterBallistics: "vu", smoothing: "smooth" }).follow).toEqual({ motion: false });
  });

  it("a Clock's format → clock (24 h is the old default)", () => {
    expect(settingsOf("Clock", { format: "24h" }).settings).toBeUndefined();
    expect(settingsOf("Clock", { format: "12h" })).toEqual({ settings: { clock: "12" }, custom: ["format"] });
  });

  it("a v7 value under an unchanged key is not touched (only pre-v7 values applied without a theme)", () => {
    expect(migrateSettingsV7("MenuBar", { rateUnit: "auto" }, false).settings).toEqual({ rateUnit: "auto" });
  });

  it("keeps a custom flag the widget already set", () => {
    expect(one("CpuMonitor", { warn: 70 }, { follow: { thresholds: false, colors: false } }).follow).toEqual({ thresholds: false, colors: false });
  });
});

describe("v7: idempotence", () => {
  const legacy = v6([
    zone("a", "CpuMonitor", { settings: { warn: 75, cpu: "x", variant: "studio", layout: "card", alignX: "between", alignY: "end" } }),
    zone("b", "Weather", { settings: { units: "F" } }),
    zone("c", "StatusTracker", { settings: { track2Crit: "70" } }),
  ]);

  it("a migrated config migrates to itself", () => {
    const once = mergeConfig(legacy);
    expect(once.version).toBe(CONFIG_VERSION);
    expect(CONFIG_VERSION).toBeGreaterThanOrEqual(7);
    expect(mergeConfig(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it("the profile and placement steps are no-ops on v7 data", () => {
    const once = mergeConfig(legacy);
    const p = once.profiles[0];
    expect(migrateProfileV7(p, { legacy: false })).toBe(p);
    for (const z of p.pages[0].placements) expect(migratePlacementV7(z, { legacy: false })).toBe(z);
  });
});

describe("v7: where outside data enters", () => {
  it("general.hour12 → the all-profiles style's clock, then gone from general", () => {
    const c = mergeConfig(v6([], { general: { hour12: true } }));
    expect(c.style?.clock).toBe("12");
    expect((c.general as Record<string, unknown> | undefined)?.hour12).toBeUndefined();
    expect(mergeConfig(v6([], { general: { hour12: false } })).style?.clock).toBe("24");
    expect(mergeConfig(v6([], { general: {} })).style?.clock).toBeUndefined();
  });

  it("a clock the style already has wins", () => {
    expect(mergeConfig(v6([], { general: { hour12: true }, style: { clock: "24" } })).style?.clock).toBe("24");
  });

  it("the dashboard style, saved style presets and appearance presets rename alignX / alignY", () => {
    const c = mergeConfig(v6([], { style: { alignX: "start", alignY: "start" }, stylePresets: [{ id: "s", name: "S", settings: { alignX: "end", alignY: "end" } }] }));
    expect(c.style).toMatchObject({ align: "tl" });
    expect(c.style?.alignX).toBeUndefined();
    expect(c.stylePresets?.[0].settings).toEqual({ align: "br" });
    const [preset] = normalizeAppearancePresets([{ id: "a", name: "A", theme: "zinc", radius: 0.5, style: { alignX: "between", alignY: "end" } }])!;
    expect(preset.style).toEqual({ align: "bc", alignSpread: true });
  });

  it("a pasted pre-v7 style renames alignX / alignY", () => {
    const p = zone("a", "CpuMonitor") as unknown as Placement;
    const next = withPastedStyle(p, { alignX: "end", alignY: "end" }, new Set(["align", "alignSpread"]));
    expect(next.settings).toEqual({ align: "br" });
  });

  it("migrateStyleV7 returns the same map when nothing is renamed", () => {
    const style = { accent: "#fff" };
    expect(migrateStyleV7(style)).toBe(style);
  });
});
