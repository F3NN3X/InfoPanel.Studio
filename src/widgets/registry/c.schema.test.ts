import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { isVisible } from "@/components/studio/inspector-model";
import { STANDARD_SETTINGS } from "@/modules/standard-settings";
import { effectiveSettings, settingKeys, type ModuleSettings, type SensorMap } from "@/modules/types";
import { fixtureSensors } from "../__fixtures__";
import { GROUP_C } from "./c";

vi.mock("@/lib/wavelink", async (orig) => ({ ...(await orig<typeof import("@/lib/wavelink")>()), ...(await import("../__fixtures__/wavelink")).wavelinkMock() }));

const SPECS = import.meta.glob("/docs/redesign/widgets/docs/widgets/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** The prop names of a spec's "Widget-specific" block (quotes and parenthesised notes stripped, then the first word of each comma item). */
function specProps(id: string): string[] {
  const md = Object.entries(SPECS).find(([path]) => path.endsWith(`/${id}.md`))?.[1] ?? "";
  const block = /Widget-specific:\s*```\n([\s\S]*?)```/.exec(md)?.[1] ?? "";
  const plain = block.replace(/'[^']*'|"[^"]*"/g, "").replace(/\([^)]*\)/g, "");
  return plain.split(",").flatMap((item) => /^\s*([a-z][A-Za-z]*)/.exec(item)?.slice(1) ?? []);
}

// Per template: the stored setting key behind each spec prop, or null for a shell-level callback.
const MANIFEST: Record<string, Record<string, string | null>> = {
  NowPlaying: { source: "source", showArt: "showArt", layout: "playerLayout", progress: "progress", vizMode: "vizStyle", vizDevice: "device", vizRamp: "vizColor1", showTimeline: "showTimeline" },
  AudioMeter: { device: "device", mode: "mode", segments: "segments", meterStyle: "meterStyle" },
  VolumeMixer: { onSetVolume: null, onToggleMute: null },
  MeterBridge: { channels: "devices", orientation: "orientation", floor: "floor", segments: "segments", holdMs: "holdMs", warnDb: "warn.db", clipDb: "crit.db", showScale: "showScale", showVolume: "showVolume", ladder: "ladder" },
  Visualizer: { mode: "mode", device: "device", bands: "bands", ramp: "ramp", sensitivity: "sensitivity", peaks: "peaks" },
  WaveLink: {},
};

const STANDARD_KEYS = new Set(STANDARD_SETTINGS.map((d) => d.key));
const SENSORS = fixtureSensors() as SensorMap;

describe.each(Object.entries(MANIFEST))("%s schema", (id, props) => {
  const mod = GROUP_C.find((m) => m.id === id)!;
  const settings = mod.settings ?? [];

  it("keeps the manifest, keys and enum defaults, and renders from its defaults", () => {
    expect(specProps(id).sort()).toEqual(Object.keys(props).sort());
    { // reaches every spec prop through exactly one setting
      for (const key of Object.values(props)) if (key) expect(settings.flatMap(settingKeys).filter((k) => k === key)).toHaveLength(1);
    }
    { // has unique keys; own keys do not collide with a standard key
      const keys = settings.map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of Object.values(props)) if (key) expect(STANDARD_KEYS.has(key)).toBe(false);
    }
    { // keeps every enum default inside its options
      for (const d of settings.filter((x) => x.type === "select" && x.options)) expect(d.options!.map((o) => o.value)).toContain(d.default);
    }
    { // renders from its defaults
      const defaults: ModuleSettings = Object.fromEntries(settings.map((d) => [d.key, d.default]));
      const html = renderToString(mod.render(SENSORS, defaults) ?? createElement("i"));
      expect(html.length).toBeGreaterThan(0);
    }
  });
});

describe("group C dependent settings", () => {
  const shown = (id: string, values: ModuleSettings) => {
    const mod = GROUP_C.find((m) => m.id === id)!;
    return (mod.settings ?? []).filter((d) => isVisible(d, { ...effectiveSettings(mod, {}), ...values })).map((d) => d.key);
  };
  const VIZ_KEYS = ["vizStyle", "vizBars", "device", "showTimeline", "vizShape", "vizGap", "vizPeaks", "vizColorMode", "vizPeakColor", "vizGain", "vizFloorDb", "liveCapture"];

  it("shows the NowPlaying visualiser settings only for the Visualizer progress row", () => {
    for (const k of VIZ_KEYS) expect(shown("NowPlaying", { progress: "bar" }), k).not.toContain(k);
    for (const k of VIZ_KEYS) expect(shown("NowPlaying", { progress: "visualizer" }), k).toContain(k);
  });

  it("shows the capture devices only with Live capture, and the cover switch only where it is drawn", () => {
    expect(shown("NowPlaying", { progress: "visualizer" })).not.toContain("devices");
    expect(shown("NowPlaying", { progress: "visualizer", liveCapture: true })).toContain("devices");
    for (const playerLayout of ["card", "wave"]) expect(shown("NowPlaying", { playerLayout })).toContain("showArt");
    for (const playerLayout of ["vinyl", "backdrop"]) expect(shown("NowPlaying", { playerLayout })).not.toContain("showArt");
  });

  it("hides the AudioMeter device, style and segments in bridge mode, and segments outside LED", () => {
    expect(shown("AudioMeter", { mode: "single", meterStyle: "led" })).toEqual(expect.arrayContaining(["device", "meterStyle", "segments"]));
    expect(shown("AudioMeter", { mode: "single", meterStyle: "bar" })).not.toContain("segments");
    for (const k of ["device", "meterStyle", "segments"]) expect(shown("AudioMeter", { mode: "bridge" })).not.toContain(k);
  });

  it("shows the Visualizer colour 1 only in a colour mode (or with a saved colour), and bar shape only for bar styles", () => {
    expect(shown("Visualizer", { vizColorMode: "follow" })).not.toContain("ramp");
    expect(shown("Visualizer", { vizColorMode: "follow", ramp: "#fff" })).toContain("ramp");
    for (const vizColorMode of ["solid", "gradient", "ramp"]) expect(shown("Visualizer", { vizColorMode })).toContain("ramp");
    for (const mode of ["bars", "mirror", "scroll"]) expect(shown("Visualizer", { mode })).toEqual(expect.arrayContaining(["vizShape", "vizGap"]));
    for (const mode of ["wave", "dots", "radial", "line", "blob"]) for (const k of ["vizShape", "vizGap"]) expect(shown("Visualizer", { mode })).not.toContain(k);
  });

  it("files MeterBridge Peak hold under Behaviour › Dynamics, for the Peak response only", () => {
    const hold = GROUP_C.find((m) => m.id === "MeterBridge")!.settings!.find((d) => d.key === "holdMs")!;
    expect([hold.group, hold.tab]).toEqual(["Dynamics", "behaviour"]);
    expect(shown("MeterBridge", { meterBallistics: "peak" })).toContain("holdMs");
    for (const meterBallistics of ["vu", "instant"]) expect(shown("MeterBridge", { meterBallistics })).not.toContain("holdMs");
  });

  it("offers no Hide when idle (removed)", () => {
    for (const mod of GROUP_C) expect((mod.settings ?? []).map((d) => d.key), mod.id).not.toContain("hideWhenIdle");
  });
});
