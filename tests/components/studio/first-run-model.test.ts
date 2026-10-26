import { describe, expect, it } from "vitest";
import {
  FIRST_WIDGETS,
  applyFirstRun,
  connectedText,
  detectWidgets,
  isPristine,
  layoutWidgets,
  looksLike,
  screenChoices,
  summariseSources,
  validSize,
  type DetectedWidget,
  type FirstRunChoices,
} from "@/components/studio/first-run-model";
import { defaultConfig, mergeConfig, type DashboardConfig, type Placement } from "@/lib/layout";
import { allPlacements, pageOf } from "@/lib/pages";
import { SCREEN_TEMPLATES } from "@/lib/screen-templates/catalog";
import { instantiate } from "@/lib/screen-templates/instantiate";
import type { SensorMap } from "@/modules/types";

const sensor = (unit: string, name = "") => ({ unit, name, value: 1 });
const all = (sensors: SensorMap = {}): DetectedWidget[] => detectWidgets(sensors);

const overlap = (a: Placement, b: Placement) =>
  a.colStart < b.colStart + b.colSpan && b.colStart < a.colStart + a.colSpan && a.rowStart < b.rowStart + b.rowSpan && b.rowStart < a.rowStart + a.rowSpan;

describe("looksLike", () => {
  it("reads a window's shape", () => {
    expect(looksLike(1920, 550).kind).toBe("bar");
    expect(looksLike(1024, 600).kind).toBe("panel");
    expect(looksLike(1920, 1080).kind).toBe("panel");
    expect(looksLike(480, 1920).kind).toBe("strip");
    expect(looksLike(820, 1180).kind).toBe("tablet");
  });

  it("puts the boundaries in the wider class of each pair", () => {
    expect(looksLike(2200, 1000).kind).toBe("bar");
    expect(looksLike(2199, 1000).kind).toBe("panel");
    expect(looksLike(600, 1000).kind).toBe("strip");
    expect(looksLike(1200, 1000).kind).toBe("panel");
    expect(looksLike(1199, 1000).kind).toBe("tablet");
  });

  it("does not divide by a zero height", () => {
    expect(looksLike(800, 0).kind).toBe("panel");
  });
});

describe("screenChoices", () => {
  it("offers the detected size first, then the presets and a custom size", () => {
    const cards = screenChoices(1920, 550);
    expect(cards.map((c) => c.id)).toEqual(["detected", "panel", "strip", "tablet", "custom"]);
    expect(cards[0]).toMatchObject({ width: 1920, height: 550 });
    expect(cards[1]).toMatchObject({ width: 1024, height: 600 });
    expect(cards[2]).toMatchObject({ width: 480, height: 1920 });
  });

  it("starts the custom size at the window's and keeps what was typed", () => {
    expect(screenChoices(1280, 720)[4]).toMatchObject({ width: 1280, height: 720 });
    expect(screenChoices(1280, 720, { width: 800, height: 480 })[4]).toMatchObject({ width: 800, height: 480 });
  });

  it("accepts whole pixels from 100 to 8192", () => {
    expect([100, 8192, 1920].every(validSize)).toBe(true);
    expect([99, 8193, 12.5, Number.NaN, 0].some(validSize)).toBe(false);
  });
});

describe("summariseSources", () => {
  const entry = (type: string) => ({ id: "e", name: "e", type, key: "k" });
  const plugin = (name: string, types: string[]) => ({ id: name, name, containers: [{ id: "c", name: "c", entries: types.map(entry) }] });

  it("counts sensor entries and names the plugins that have any", () => {
    const sum = summariseSources({ plugins: [plugin("System", ["sensor", "sensor", "text"]), plugin("Media", ["text"]), plugin("Clock", ["sensor"])] });
    expect(sum).toEqual({ count: 3, names: ["System", "Clock"] });
  });

  it("reads the sentence with at most two names and the rest counted", () => {
    expect(connectedText({ count: 764, names: ["System", "Clock", "A", "B"] })).toBe("Connected — 764 sensors from System, Clock and 2 more");
    expect(connectedText({ count: 1, names: ["System"] })).toBe("Connected — 1 sensor from System");
    expect(connectedText({ count: 0, names: [] })).toBe("Connected — 0 sensors");
  });
});

describe("detectWidgets", () => {
  it("offers only the Clock when nothing is detected", () => {
    const cards = all();
    expect(cards.map((c) => c.id)).toEqual(FIRST_WIDGETS.map((w) => w.id));
    expect(cards.filter((c) => c.detected).map((c) => c.id)).toEqual(["clock"]);
  });

  it("binds the CPU and GPU temperatures to the best-named sensors", () => {
    const cards = all({
      "libre.amd_ryzen_9_cpu_core_1": sensor("°C", "Core 1"),
      "libre.amd_ryzen_9_cpu_package": sensor("°C", "CPU Package"),
      "libre.nvidia_rtx_gpu_memory_junction": sensor("°C", "GPU Memory Junction"),
      "libre.nvidia_rtx_gpu_core": sensor("°C", "GPU Core"),
      "libre.nvidia_rtx_gpu_core_load": sensor("%", "GPU Core Load"),
    });
    expect(cards.find((c) => c.id === "cpu-temp")).toMatchObject({ detected: true, sensor: "libre.amd_ryzen_9_cpu_package" });
    expect(cards.find((c) => c.id === "gpu-temp")).toMatchObject({ detected: true, sensor: "libre.nvidia_rtx_gpu_core" });
  });

  it("detects fans by their unit and now playing by its plugin", () => {
    const cards = all({ "libre.fan_1": sensor("RPM", "Fan 1"), "plugins.media-plugin.session.title": sensor("", "Title") });
    expect(cards.filter((c) => c.detected).map((c) => c.id)).toEqual(["fans", "clock", "now-playing"]);
  });

  it("does not take a load percentage for a temperature", () => {
    expect(all({ "libre.cpu_total": sensor("%", "CPU Total") }).find((c) => c.id === "cpu-temp")?.detected).toBe(false);
  });
});

describe("layoutWidgets", () => {
  const sensors: SensorMap = {
    "libre.cpu_package": sensor("°C", "CPU Package"),
    "libre.gpu_core": sensor("°C", "GPU Core"),
    "libre.fan_1": sensor("RPM", "Fan"),
    "plugins.media-plugin.t": sensor("", "Title"),
  };

  it("places every chosen widget inside the grid without overlap", () => {
    const { placements, skipped } = layoutWidgets(all(sensors), 12, 4);
    expect(skipped).toEqual([]);
    expect(placements).toHaveLength(5);
    for (const p of placements) {
      expect(p.colStart).toBeGreaterThanOrEqual(1);
      expect(p.rowStart).toBeGreaterThanOrEqual(1);
      expect(p.colStart + p.colSpan - 1).toBeLessThanOrEqual(12);
      expect(p.rowStart + p.rowSpan - 1).toBeLessThanOrEqual(4);
    }
    for (const [i, a] of placements.entries()) for (const b of placements.slice(i + 1)) expect(overlap(a, b)).toBe(false);
  });

  it("lays out in card order from the top left", () => {
    const { placements } = layoutWidgets(all(sensors), 12, 4);
    expect(placements.map((p) => p.module)).toEqual(["SensorValue", "SensorValue", "Fans", "Clock", "NowPlaying"]);
    expect(placements[0]).toMatchObject({ colStart: 1, rowStart: 1 });
    expect(placements[1]).toMatchObject({ colStart: 3, rowStart: 1 });
  });

  it("binds a temperature card to its sensor and labels it", () => {
    const { placements } = layoutWidgets(all(sensors).slice(0, 1), 12, 4);
    expect(placements[0].settings).toEqual({ label: "CPU temperature", sensor: "libre.cpu_package" });
  });

  it("leaves the sensor unset when none was detected, and gives other modules no settings", () => {
    const { placements } = layoutWidgets(all().filter((c) => c.id === "cpu-temp" || c.id === "clock"), 12, 4);
    expect(placements[0].settings).toEqual({ label: "CPU temperature" });
    expect(placements[1].settings).toBeUndefined();
  });

  it("cuts a widget to a grid narrower than it", () => {
    const { placements } = layoutWidgets(all().filter((c) => c.id === "now-playing"), 2, 4);
    expect(placements[0].colSpan).toBe(2);
  });

  it("reports what does not fit instead of overlapping it", () => {
    const { placements, skipped } = layoutWidgets(all(sensors), 4, 2);
    expect(placements.length + skipped.length).toBe(5);
    expect(skipped.length).toBeGreaterThan(0);
    for (const [i, a] of placements.entries()) for (const b of placements.slice(i + 1)) expect(overlap(a, b)).toBe(false);
  });

  it("makes fresh ids", () => {
    const ids = layoutWidgets(all(sensors), 12, 4).placements.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("applyFirstRun", () => {
  const choices = (patch: Partial<FirstRunChoices> = {}): FirstRunChoices => ({
    width: 1920,
    height: 550,
    start: "blank",
    pageName: "",
    widgets: all().filter((c) => c.id === "clock"),
    ...patch,
  });

  it("knows a fresh install and nothing else", () => {
    expect(isPristine(defaultConfig())).toBe(true);
    const used = applyFirstRun(defaultConfig(), choices()).config;
    expect(isPristine(used)).toBe(false);
    expect(isPristine({ ...used, profiles: [...used.profiles, ...used.profiles] })).toBe(false);
  });

  it("sets up the one blank screen of a fresh install: size, grid, first page and its widgets", () => {
    const base = defaultConfig();
    const { config, profileId } = applyFirstRun(base, choices({ pageName: "Gaming" }));
    expect(config.profiles).toHaveLength(1);
    expect(profileId).toBe(base.profiles[0].id);
    const screen = config.profiles[0];
    expect(screen).toMatchObject({ id: base.profiles[0].id, name: base.profiles[0].name, width: 1920, height: 550, cols: 12, rows: 4, fit: "fill" });
    expect(screen.pages).toHaveLength(1);
    expect(screen.pages[0].name).toBe("Gaming");
    expect(screen.pages[0].placements.map((p) => p.module)).toEqual(["Clock"]);
    // Nothing outside the screen changed.
    expect(config.theme).toEqual(base.theme);
    expect(config.activeProfile).toBe(base.activeProfile);
  });

  it("keeps the page's name and id when none is typed", () => {
    const base = defaultConfig();
    const page = applyFirstRun(base, choices({ pageName: "  " })).config.profiles[0].pages[0];
    expect(page.name).toBe(base.profiles[0].pages[0].name);
    expect(page.id).toBe(base.profiles[0].pages[0].id);
  });

  it("makes a tall screen's grid from its size", () => {
    const screen = applyFirstRun(defaultConfig(), choices({ width: 480, height: 1920 })).config.profiles[0];
    expect(screen).toMatchObject({ width: 480, height: 1920, cols: 6, rows: 6, fit: "scroll" });
  });

  it("starts from the sample layout on its own grid for a bar", () => {
    const screen = applyFirstRun(defaultConfig(), choices({ start: "template", widgets: [] })).config.profiles[0];
    expect(screen).toMatchObject({ cols: 12, rows: 6 });
    expect(allPlacements(screen).length).toBeGreaterThan(3);
  });

  it("scales the sample layout onto another shape's grid, inside it", () => {
    const screen = applyFirstRun(defaultConfig(), choices({ start: "template", width: 1024, height: 600, widgets: [] })).config.profiles[0];
    expect(screen).toMatchObject({ cols: 6, rows: 4 });
    const zones = allPlacements(screen);
    expect(zones.length).toBeGreaterThan(0);
    for (const z of zones) {
      expect(z.colStart + z.colSpan - 1).toBeLessThanOrEqual(6);
      expect(z.rowStart + z.rowSpan - 1).toBeLessThanOrEqual(4);
    }
  });

  it("makes the screen from the chosen screen template, its look and pages, under the screen's own id and name", () => {
    const base = defaultConfig();
    const gaming = SCREEN_TEMPLATES.find((t) => t.id === "gaming")!;
    const template = instantiate(gaming, { name: gaming.name, width: 1024, height: 600 }).profile;
    const { config } = applyFirstRun(base, choices({ start: "template", width: 1024, height: 600, pageName: "Play", widgets: [], template }));
    const screen = config.profiles[0];
    expect(screen).toMatchObject({ id: base.profiles[0].id, name: base.profiles[0].name, cols: template.cols, rows: template.rows, fit: "fill" });
    expect(screen.background).toEqual(template.background);
    expect(screen.pages.map((p) => p.name)).toEqual(["Play", "System"]);
    expect(screen.pages[0].id).toBe(base.profiles[0].pages[0].id);
    expect(screen.pages[0].placements).toEqual(template.pages[0].placements);
  });

  it("leaves the screen blank for Import, which the Import door fills", () => {
    const screen = applyFirstRun(defaultConfig(), choices({ start: "import", widgets: all() })).config.profiles[0];
    expect(allPlacements(screen)).toEqual([]);
    expect(screen.width).toBe(1920);
  });

  it("adds a new screen when screens already exist and touches none of them", () => {
    const first = applyFirstRun(defaultConfig(), choices()).config;
    const { config, profileId } = applyFirstRun(first, choices({ width: 1024, height: 600, pageName: "Desk" }));
    expect(config.profiles).toHaveLength(2);
    expect(config.profiles[0]).toBe(first.profiles[0]);
    const added = config.profiles[1];
    expect(added.id).toBe(profileId);
    expect(added.id).not.toBe(first.profiles[0].id);
    expect(added).toMatchObject({ name: "1024×600", width: 1024, height: 600 });
    expect(pageOf(added).name).toBe("Desk");
  });

  it("makes a config that survives a save and load", () => {
    const widgets = all({ "libre.cpu_package": sensor("°C", "CPU Package") }).filter((c) => c.detected);
    const { config } = applyFirstRun(defaultConfig(), choices({ widgets, pageName: "Gaming" }));
    const loaded: DashboardConfig = mergeConfig(JSON.parse(JSON.stringify(config)));
    const screen = loaded.profiles[0];
    expect(screen.pages[0].name).toBe("Gaming");
    expect(screen.pages[0].placements.map((p) => p.module)).toEqual(["SensorValue", "Clock"]);
    expect(screen.pages[0].placements[0].settings).toMatchObject({ sensor: "libre.cpu_package" });
  });
});
