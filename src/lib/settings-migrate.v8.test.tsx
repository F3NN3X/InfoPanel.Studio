import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { levelText } from "@/components/studio/thresholds-control";
import { shownValue, zoneLookValues } from "@/components/studio/inspector/zone-fields";
import { modules } from "@/modules";
import type { ModuleSettings } from "@/modules/types";
import type { NowPlayingProps } from "@/widgets/NowPlaying";
import { tuningLookOf, vizStyleOf } from "@/widgets/NowPlaying/settings";
import { fixtureSensors } from "@/widgets/__fixtures__";
import parity from "./__fixtures__/v8-parity.json";
import { CONFIG_VERSION, mergeConfig, type Placement, type StoredConfig } from "./layout";
import { profileWithPage } from "./pages";
import { migratePlacementV8, migrateProfileV8, migrateSettingsV8 } from "./settings-migrate";
import { PARITY_CASES } from "./settings-migrate.v8.cases";
import { appearanceOf, resolveWith } from "./style-resolve";

const seen = vi.hoisted(() => [] as unknown[]);
vi.mock("@/widgets/NowPlaying", async (orig) => {
  const m = await orig<typeof import("@/widgets/NowPlaying")>();
  return { ...m, default: (p: NowPlayingProps) => (seen.push(p), m.default(p)) };
});

const zone = (id: string, module: string, extra: Record<string, unknown> = {}) => ({ id, module, colStart: 1, rowStart: 1, colSpan: 3, rowSpan: 2, visible: true, ...extra });

const stored = (version: number, placements: Record<string, unknown>[], profile: Record<string, unknown> = {}): StoredConfig =>
  ({
    version,
    activeProfile: "auto",
    profiles: [{ id: "p", name: "Desk", width: 1920, height: 1080, cols: 12, rows: 6, fit: "scroll", pages: [{ id: "main", name: "Main", placements }], ...profile }],
  }) as unknown as StoredConfig;

const zonesOf = (c: ReturnType<typeof mergeConfig>): Placement[] => c.profiles[0].pages[0].placements;
const one = (module: string, settings: ModuleSettings, extra: Record<string, unknown> = {}) => zonesOf(mergeConfig(stored(7, [zone("a", module, { settings, ...extra })])))[0];
const v8 = (module: string, settings: ModuleSettings) => migrateSettingsV8(module, settings, true).settings;

/** Each zone of a loaded config rendered as the kiosk does (its settings resolved under the profile's theme). */
function renders(config: ReturnType<typeof mergeConfig>): Record<string, { markup: string; props?: unknown }> {
  const view = profileWithPage(config.profiles[0]);
  const appearance = appearanceOf(config, view);
  const out: Record<string, { markup: string; props?: unknown }> = {};
  for (const z of view.placements) {
    const mod = modules.find((m) => m.id === z.module)!;
    seen.length = 0;
    const markup = renderToStaticMarkup(mod.render(fixtureSensors(), resolveWith(appearance, z.settings, z.follow, undefined, mod.settings)) as never);
    out[z.id] = { markup, ...(z.module === "NowPlaying" ? { props: propsOf(seen.at(-1)) } : {}) };
  }
  return out;
}
const propsOf = (p: unknown) => JSON.parse(JSON.stringify(p, (k, v) => (k === "data" || k === "names" || k === "look" || typeof v === "function" ? undefined : v)));

describe("v8 render parity", () => {
  const config = mergeConfig(stored(7, PARITY_CASES.map((c) => zone(c.id, c.module, { ...(c.settings ? { settings: c.settings } : {}), ...(c.follow ? { follow: c.follow } : {}) }))));
  const after = renders(config);
  it.each(PARITY_CASES.map((c) => [c.id] as const))("%s renders as under v7", (id) => {
    expect(after[id]).toEqual(parity.renders[id as keyof typeof parity.renders]);
  });
});

describe("v8 NowPlaying: the visualiser keys under their v2 names", () => {
  it.each([
    ["vizRamp", "vizColor1", "#00ff00"],
    ["waveformSensitivity", "vizGain", 2],
    ["visualizerBarCount", "vizBars", 32],
    ["visualizerAlign", "vizAlign", "end"],
    ["visualizerOrientation", "vizOrientation", "vertical"],
    ["visualizerMinLevel", "vizMinLevel", 0.2],
    ["waveformLineWidth", "vizLine", 3],
    ["waveformFadeEdges", "vizFade", false],
    ["waveformFadeWidth", "vizFadeWidth", 60],
  ] as const)("%s → %s", (old, key, value) => {
    expect(v8("NowPlaying", { [old]: value })).toEqual({ [key]: value });
  });

  it("keeps a value already under its v2 name", () => {
    expect(v8("NowPlaying", { vizRamp: "#00ff00", vizColor1: "#0000ff" })).toEqual({ vizColor1: "#0000ff" });
  });

  it.each([
    [{ waveformVariant: "dots" }, { vizStyle: "dots" }],
    [{ waveformVariant: "bars" }, undefined],
    [{ waveformVariant: "nope" }, undefined],
    [{ vizEngine: "waveform" }, { vizStyle: "scroll" }],
    [{ vizEngine: "waveform", waveformVariant: "line" }, { vizStyle: "scroll", vizScrollAs: "line" }],
    [{ vizEngine: "waveform", waveformMode: "static", waveformVariant: "line" }, { vizStyle: "line" }],
    [{ vizEngine: "bars", visualizerMirrored: true }, { vizStyle: "mirror" }],
    [{ vizEngine: "mini", waveformVariant: "radial", waveform: true, visualizer: false, waveformActive: true, visualizerIdle: "pulse", visualizerLoading: true }, { vizStyle: "radial" }],
  ] as const)("the old engine keys %j → %j", (input, out) => {
    expect(v8("NowPlaying", input)).toEqual(out);
    // what it drew, read the same way before and after
    if (out) expect(vizStyleOf({ ...out })).toBe(vizStyleOf({ ...input }));
  });

  it("reads the old bar shape keys into the gap, shape and floor, as they drew", () => {
    const input = { waveformBarWidth: 6, waveformBarGap: 2, waveformBarRadius: 0, waveformMinBarHeight: 10 };
    const out = v8("NowPlaying", input)!;
    expect(out).toEqual({ vizGap: 25, vizShape: "square", vizMinPx: 10 });
    const before = tuningLookOf(input);
    const after = tuningLookOf(out);
    expect({ gap: (out.vizGap as number) / 100, shape: out.vizShape, minPx: after.minPx }).toEqual({ gap: before.gap, shape: before.shape, minPx: before.minPx });
  });

  it("drops shape keys at their defaults, and keeps a chosen gap or shape", () => {
    expect(v8("NowPlaying", { waveformBarWidth: 3, waveformBarGap: 1, waveformBarRadius: 1.5, waveformMinBarHeight: 4 })).toBeUndefined();
    expect(v8("NowPlaying", { waveformBarWidth: 6, vizGap: 40, waveformBarRadius: 0, vizShape: "pill" })).toEqual({ vizGap: 40, vizShape: "pill" });
    expect(v8("NowPlaying", { waveformBarRadius: 4, vizShape: "auto" })).toEqual({ vizShape: "round" });
  });

  it("leaves other widgets' keys alone", () => {
    expect(v8("Visualizer", { ramp: "#fff", waveformVariant: "line" })).toEqual({ ramp: "#fff", waveformVariant: "line" });
  });
});

describe("v8 SensorGroup: auto → mode", () => {
  it.each([
    [{ auto: true }, { mode: "auto" }],
    [{ auto: false, maxRows: 4 }, { maxRows: 4 }],
    [{ auto: true, mode: "pick" }, { mode: "pick" }],
  ] as const)("%j → %j", (input, out) => {
    expect(v8("SensorGroup", input)).toEqual(out);
  });
});

describe("v8: Widget colors custom where an own colour gained a role", () => {
  it.each([
    ["SystemOverview", { cpuColor: "#ff0000" }],
    ["NowPlaying", { vizRamp: "#00ff00" }],
    ["NowPlaying", { vizPeakColor: "#ffffff" }],
    ["SensorGroup", { fanColor: "#00ff00" }],
    ["AudioMeter", { hotColor: "#ff00ff" }],
    ["GpuRings", { outerColor: "#ff0000" }],
    ["GpuRings", { innerColor: "#00ff00" }],
    ["Thermals", { fanColor: "#00ff00" }],
    ["DiskIO", { readColor: "#ff0000" }],
    ["DiskIO", { writeColor: "#00ff00" }],
    ["NetworkThroughput", { downloadColor: "#ff0000" }],
    ["NetworkThroughput", { uploadColor: "#00ff00" }],
    ["VolumeMixer", { levelColor: "#ff0000" }],
    ["MeterBridge", { levelColor: "#ff0000" }],
    ["MeterBridge", { hotColor: "#00ff00" }],
    ["Visualizer", { ramp: "thermal" }],
    ["Visualizer", { vizColor2: "#00ff00" }],
    ["Visualizer", { vizColor3: "#00ff00" }],
    ["Visualizer", { vizPeakColor: "#ffffff" }],
    ["WaveLink", { levelColor: "#ff0000" }],
    ["WaveLink", { liveColor: "#00ff00" }],
    ["WaveLink", { muteColor: "#0000ff" }],
  ] as const)("%s %j", (module, settings) => {
    expect(one(module, settings).follow).toEqual({ palette: false });
    // a v7 flag said follow, but the colour applied regardless
    expect(one(module, settings, { follow: { palette: true } }).follow).toEqual({ palette: false });
  });

  it("not without an own colour, nor for a colour row without a role", () => {
    expect(one("SystemOverview", { cpuColor: "", label: "X" }).follow).toBeUndefined();
    expect(one("AudioMeter", { showMute: false }).follow).toBeUndefined();
    expect(one("Bluetooth", { batteryLowColor: "#ff0000" }).follow).toBeUndefined();
    expect(one("GpuRings", { outer: "load" }).follow).toBeUndefined();
    expect(one("Thermals", { fanColor: "" }).follow).toBeUndefined();
    expect(one("DiskIO", { showHistory: false }).follow).toBeUndefined();
    expect(one("Visualizer", { ramp: "", mode: "wave" }).follow).toBeUndefined();
    expect(one("WaveLink", { showFader: false }).follow).toBeUndefined();
  });

  it("keeps the other flags, and an explicit Use theme on v8 data", () => {
    expect(one("SystemOverview", { cpuColor: "#ff0000" }, { follow: { colors: false } }).follow).toEqual({ colors: false, palette: false });
    expect(migrateSettingsV8("SystemOverview", { cpuColor: "#ff0000" }, false).custom).toEqual([]);
  });
});

describe("v8: the chain from v3", () => {
  it("a v3 media zone reaches v8 through the legacy zones, v6 and v7", () => {
    const [z] = zonesOf(
      mergeConfig({
        version: 3,
        profiles: [{ id: "p", name: "Desk", width: 1920, height: 1080, cols: 12, rows: 6, pages: [{ id: "main", name: "Main", placements: [zone("a", "mediamodern", { settings: { waveform: true, waveformMode: "static", waveformVariant: "line", liveSource: "x", vizRamp: "#00ff00" } })] }] }],
      } as unknown as StoredConfig)
    );
    expect(z.module).toBe("NowPlaying");
    expect(z.settings).toMatchObject({ vizStyle: "line", device: "x", vizColor1: "#00ff00", progress: "visualizer" });
    for (const key of ["waveform", "waveformMode", "waveformVariant", "vizEngine", "liveSource", "vizRamp"]) expect(z.settings, key).not.toHaveProperty(key);
    expect(z.follow).toEqual({ palette: false });
  });

  it("a v4 hardware list reaches v8 in auto mode", () => {
    const [z] = zonesOf(mergeConfig(stored(4, [zone("a", "SensorGroup", { settings: { auto: true, groupDecimals: "1" } })])));
    expect(z.settings).toEqual({ mode: "auto", decimals: "1" });
  });
});

describe("v8: idempotence", () => {
  const legacy = stored(7, [
    zone("a", "NowPlaying", { settings: { vizEngine: "waveform", waveformVariant: "line", visualizerBarCount: 32, vizRamp: "#00ff00" } }),
    zone("b", "SensorGroup", { settings: { auto: true } }),
    zone("c", "SystemOverview", { settings: { cpuColor: "#ff0000" } }),
  ]);

  it("a migrated config migrates to itself, at version 8", () => {
    const once = mergeConfig(legacy);
    expect(once.version).toBe(CONFIG_VERSION);
    expect(CONFIG_VERSION).toBe(8);
    expect(mergeConfig(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it("the profile and placement steps are no-ops on v8 data", () => {
    const p = mergeConfig(legacy).profiles[0];
    expect(migrateProfileV8(p, { legacy: false })).toBe(p);
    for (const z of p.pages[0].placements) expect(migratePlacementV8(z, { legacy: false })).toBe(z);
  });
});

describe("§9 item 8: tempUnit f in the profile", () => {
  const config = mergeConfig(
    stored(
      8,
      [
        zone("wx", "Weather"),
        zone("so", "SystemOverview", { settings: { details: "full" } }),
        zone("sg", "SensorGroup", { settings: { sensors: "libre.amd_ryzen_9_9950x3d_core__tctl_tdie" } }),
        zone("sg-auto", "SensorGroup", { settings: { mode: "auto" } }),
      ],
      { widgetTheme: { values: { tempUnit: "f" } } }
    )
  );
  const out = renders(config);
  const celsius = renders(mergeConfig(stored(8, zonesOf(config).map(({ id, module, settings }) => zone(id, module, settings ? { settings } : {})))));

  it.each(["wx", "so", "sg", "sg-auto"])("%s reads °F", (id) => {
    expect(out[id].markup).not.toEqual(celsius[id].markup);
    if (id !== "wx") expect(out[id].markup).toContain("°F");
  });

  it("turns the temperature threshold scale to °F with them", () => {
    const view = profileWithPage(config.profiles[0]);
    const appearance = appearanceOf(config, view);
    const so = view.placements.find((z) => z.id === "so")!;
    const unit = shownValue(zoneLookValues(so, appearance), "tempUnit", { key: "tempUnit", label: "Temperature", type: "select", default: "c", section: "format" });
    expect(unit).toBe("f");
    expect(levelText(80, "temp", unit as "f")).toBe("176°F");
  });
});
