import { describe, expect, it } from "vitest";
import { bindPoint, claimedPrefixes, computeUsage, screensUsing, unbindPoint, type ModuleInfo } from "@/lib/data-usage";
import { mainPage } from "@/lib/pages";
import { buildDataModel } from "@/lib/data-points";
import { PANEL_ID, defaultConfig, type DashboardConfig, type Placement } from "@/lib/layout";
import type { Widget } from "@/lib/panel-model";

const AUDIO = "plugins.audio-level-meter.";
const dev = (c: string, e: string) => `${AUDIO}${c}.${e}`;

const mods: ModuleInfo[] = [
  {
    id: "audio",
    title: "Audio",
    prefixes: [AUDIO],
    settings: [
      { key: "source", label: "Source", type: "select", default: "", optionsFrom: "sources", sourcePlugin: AUDIO },
    ],
  },
  {
    id: "media",
    title: "Media",
    prefixes: ["plugins.media-plugin."],
    settings: [
      { key: "liveSource", label: "Live", type: "select", default: "", optionsFrom: "sources", sourcePlugin: AUDIO },
    ],
  },
  {
    id: "multi",
    title: "Multi",
    prefixes: [AUDIO],
    settings: [
      { key: "source", label: "S", type: "select", default: "", optionsFrom: "sources", sourcePlugin: AUDIO, multiple: true },
    ],
  },
  {
    id: "defaulted",
    title: "Defaulted",
    prefixes: [AUDIO],
    settings: [
      { key: "source", label: "S", type: "select", default: "a,b", optionsFrom: "sources", sourcePlugin: AUDIO, multiple: true },
    ],
  },
  { id: "hardware", title: "Hardware", prefixes: ["libre.", "hwinfo."] },
  { id: "nothing", title: "Nothing", prefixes: [] },
];

const keys = [
  dev("default-audio", "peak-level"),
  dev("usb", "peak-level"),
  "plugins.media-plugin.media.title",
  "libre.cpu_temp",
  "system.cpu.load",
];

const widget = (over: Partial<Widget>): Widget => ({ id: "w1", kind: "stat", visible: true, ...over });
const zone = (id: string, module: string, over: Partial<Placement> = {}): Placement => ({
  id, module, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2, visible: true, ...over,
});
const panelZone = (id: string, widgets: Widget[]): Placement =>
  zone(id, PANEL_ID, {
    panel: { id: `${id}-p`, title: "CPU", titleVisible: true, visible: true, background: "panel", widgets },
  });

function configWith(placements: Placement[]): DashboardConfig {
  const base = defaultConfig();
  return { ...base, profiles: [{ ...base.profiles[0], pages: [mainPage(placements)] }] };
}
const placementsOf = (c: DashboardConfig) => c.profiles[0].pages[0].placements;

describe("claimedPrefixes", () => {
  it("claims the whole prefix until a source is picked, then that container", () => {
    expect(claimedPrefixes(zone("a", "audio"), mods[0])).toEqual([AUDIO]);
    expect(claimedPrefixes(zone("a", "audio", { settings: { source: "usb" } }), mods[0])).toEqual([`${AUDIO}usb.`]);
  });

  it("claims a read plugin only once its source setting is set", () => {
    expect(claimedPrefixes(zone("m", "media"), mods[1])).toEqual(["plugins.media-plugin."]);
    expect(claimedPrefixes(zone("m", "media", { settings: { liveSource: "usb" } }), mods[1])).toEqual([
      "plugins.media-plugin.",
      `${AUDIO}usb.`,
    ]);
  });

  it("splits a multiple source list", () => {
    expect(claimedPrefixes(zone("a", "multi", { settings: { source: "a, b" } }), mods[2])).toEqual([
      `${AUDIO}a.`,
      `${AUDIO}b.`,
    ]);
  });
});

describe("computeUsage", () => {
  const profile = configWith([
    zone("z-audio", "audio", { settings: { source: "usb" } }),
    zone("z-hw", "hardware"),
    zone("z-none", "nothing"),
    zone("z-unknown", "gone"),
    panelZone("z-panel", [
      widget({ id: "w1", label: "Temp", sensor: "libre.cpu_temp", subSensor: "system.cpu.load" }),
      widget({ id: "w2", kind: "text", sensor: "libre.not_in_catalog" }),
    ]),
  ]).profiles[0];
  const usage = computeUsage(profile, keys, mods);

  it("maps widget zones through their module prefixes and source setting", () => {
    expect(usage.byKey.get(dev("usb", "peak-level"))).toEqual([{ zoneId: "z-audio", label: "Audio" }]);
    expect(usage.byKey.has(dev("default-audio", "peak-level"))).toBe(false);
  });

  it("maps panel widgets through sensor and subSensor, with a panel label", () => {
    expect(usage.byKey.get("system.cpu.load")).toEqual([
      { zoneId: "z-panel", panelWidgetId: "w1", label: "CPU › Temp" },
    ]);
    expect(usage.byKey.get("libre.cpu_temp")).toEqual([
      { zoneId: "z-hw", label: "Hardware" },
      { zoneId: "z-panel", panelWidgetId: "w1", label: "CPU › Temp" },
    ]);
  });

  it("ignores keys outside the catalog, empty modules and unknown modules", () => {
    expect(usage.byKey.has("libre.not_in_catalog")).toBe(false);
    expect([...usage.byZone.keys()].sort()).toEqual(["z-audio", "z-hw", "z-panel"]);
  });

  it("inverts to zone → keys", () => {
    expect(usage.byZone.get("z-panel")).toEqual(["libre.cpu_temp", "system.cpu.load"]);
    expect(usage.byZone.get("z-audio")).toEqual([dev("usb", "peak-level")]);
  });
});

describe("bindPoint / unbindPoint", () => {
  it("sets and clears a panel widget's sensor immutably", () => {
    const config = configWith([panelZone("p", [widget({ id: "w1" }), widget({ id: "w2" })])]);
    const bound = bindPoint(config, "p", "w1", "libre.cpu_temp");
    expect(placementsOf(bound)[0].panel?.widgets[0].sensor).toBe("libre.cpu_temp");
    expect(placementsOf(bound)[0].panel?.widgets[1]).toBe(placementsOf(config)[0].panel?.widgets[1]);
    expect(placementsOf(config)[0].panel?.widgets[0].sensor).toBeUndefined();

    const cleared = unbindPoint(bound, "p", "w1", "libre.cpu_temp");
    expect("sensor" in placementsOf(cleared)[0].panel!.widgets[0]).toBe(false);
  });

  it("unbinds the sub sensor and keeps the main one", () => {
    const config = configWith([panelZone("p", [widget({ sensor: "a.b", subSensor: "c.d" })])]);
    const w = placementsOf(unbindPoint(config, "p", "w1", "c.d"))[0].panel!.widgets[0];
    expect(w.sensor).toBe("a.b");
    expect("subSensor" in w).toBe(false);
  });

  it("leaves the config alone for a missing widget, a clock, a repeat or another key", () => {
    const config = configWith([
      panelZone("p", [widget({ id: "w1", sensor: "a.b" }), widget({ id: "clk", kind: "clock" })]),
    ]);
    expect(bindPoint(config, "p", undefined, "x.y")).toBe(config);
    expect(bindPoint(config, "p", "nope", "x.y")).toBe(config);
    expect(bindPoint(config, "p", "clk", "x.y")).toBe(config);
    expect(bindPoint(config, "p", "w1", "a.b")).toBe(config);
    expect(bindPoint(config, "missing", "w1", "x.y")).toBe(config);
    expect(unbindPoint(config, "p", "w1", "other")).toBe(config);
  });

  it("binds a widget zone's source select to the key's container", () => {
    const config = configWith([zone("a", "audio")]);
    const bound = bindPoint(config, "a", undefined, dev("usb", "peak-level"), mods);
    expect(placementsOf(bound)[0].settings).toEqual({ source: "usb" });
    const cleared = unbindPoint(bound, "a", undefined, dev("usb", "peak-level"), mods);
    expect(placementsOf(cleared)[0].settings).toEqual({ source: "" });
  });

  it("prefers the catalog's container id when it contains dots", () => {
    const model = buildDataModel(
      { plugins: [{ id: "audio-level-meter", name: "A", containers: [{ id: "{0.0}.{x}", name: "D", entries: [{ id: "peak", name: "Peak", type: "sensor", key: dev("{0.0}.{x}", "peak") }] }] }] },
      { [dev("{0.0}.{x}", "peak")]: { value: 1, unit: "" } }
    );
    const bound = bindPoint(configWith([zone("a", "audio")]), "a", undefined, dev("{0.0}.{x}", "peak"), mods, model);
    expect(placementsOf(bound)[0].settings).toEqual({ source: "{0.0}.{x}" });
  });

  it("adds to and drops from a multiple source list", () => {
    const config = configWith([zone("a", "multi", { settings: { source: "a" } })]);
    const two = bindPoint(config, "a", undefined, dev("b", "x"), mods);
    expect(placementsOf(two)[0].settings).toEqual({ source: "a,b" });
    expect(bindPoint(two, "a", undefined, dev("b", "y"), mods)).toBe(two);
    const one = unbindPoint(two, "a", undefined, dev("a", "x"), mods);
    expect(placementsOf(one)[0].settings).toEqual({ source: "b" });
  });

  it("returns the config unchanged for modules without a per-key binding", () => {
    const config = configWith([zone("h", "hardware"), zone("a", "audio")]);
    expect(bindPoint(config, "h", undefined, "libre.cpu_temp", mods)).toBe(config);
    expect(unbindPoint(config, "h", undefined, "libre.cpu_temp", mods)).toBe(config);
    expect(bindPoint(config, "a", undefined, "system.cpu.load", mods)).toBe(config);
    expect(bindPoint(config, "h", undefined, "libre.cpu_temp")).toBe(config);
  });

  it("keeps a multiple setting's default containers when binding another", () => {
    const config = configWith([zone("d", "defaulted")]);
    const bound = bindPoint(config, "d", undefined, dev("c", "x"), mods);
    expect(placementsOf(bound)[0].settings).toEqual({ source: "a,b,c" });
  });

  it("unbinds a default-supplied container", () => {
    const config = configWith([zone("d", "defaulted")]);
    const cleared = unbindPoint(config, "d", undefined, dev("a", "x"), mods);
    expect(placementsOf(cleared)[0].settings).toEqual({ source: "b" });
  });

  it("changes nothing when unbinding from a module that owns the whole prefix", () => {
    const config = configWith([zone("a", "audio")]);
    expect(unbindPoint(config, "a", undefined, dev("usb", "peak-level"), mods)).toBe(config);
  });
});

describe("screensUsing", () => {
  it("names each screen that uses a key, in the config's order", () => {
    const base = configWith([zone("z-hw", "hardware")]);
    const other = configWith([panelZone("z-panel", [widget({ sensor: "system.cpu.load" })])]).profiles[0];
    const profiles = [base.profiles[0], { ...other, id: "second", name: "Second" }, { ...base.profiles[0], id: "third", name: "Third" }];
    const used = screensUsing(profiles, keys, mods);
    expect(used.get("libre.cpu_temp")).toEqual([base.profiles[0].name, "Third"]);
    expect(used.get("system.cpu.load")).toEqual(["Second"]);
    expect(used.has(dev("usb", "peak-level"))).toBe(false);
  });
});
