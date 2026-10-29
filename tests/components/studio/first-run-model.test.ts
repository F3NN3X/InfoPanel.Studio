import { upgradeConfig } from "@/lib/config-upgrade";
import { describe, expect, it } from "vitest";
import { applyFirstRun, isPristine, needsHardware, topPicks, validSize, type FirstRunChoices } from "@/components/studio/first-run-model";
import { defaultConfig, type DashboardConfig } from "@/lib/layout";
import { allPlacements } from "@/lib/pages";
import { SCREEN_TEMPLATES } from "@/lib/screen-templates/catalog";
import { instantiate } from "@/lib/screen-templates/instantiate";
import { SIZE_PRESETS } from "@/components/templates/size-presets";
import { shapeClassOf } from "@/lib/infopanel/templates/layout";

const choices = (patch: Partial<FirstRunChoices> = {}): FirstRunChoices => ({ width: 1920, height: 550, start: "blank", ...patch });

describe("sizes", () => {
  it("accepts whole pixels from 100 to 8192", () => {
    expect([100, 8192, 1920].every(validSize)).toBe(true);
    expect([99, 8193, 12.5, Number.NaN, 0].some(validSize)).toBe(false);
  });

  it("offers the 17 presets in the four classes", () => {
    expect(SIZE_PRESETS).toHaveLength(17);
    expect(new Set(SIZE_PRESETS.map((p) => shapeClassOf(p.width, p.height)))).toEqual(new Set(["standard", "wide", "strip", "tall"]));
  });
});

describe("topPicks", () => {
  it("shows at most four templates made for the size's class, in catalog order", () => {
    for (const p of SIZE_PRESETS) {
      const picks = topPicks(SCREEN_TEMPLATES, p.width, p.height);
      const cls = shapeClassOf(p.width, p.height);
      expect(picks.length).toBeLessThanOrEqual(4);
      expect(picks.every((t) => t.fits.includes(cls))).toBe(true);
      expect(picks).toEqual(SCREEN_TEMPLATES.filter((t) => t.fits.includes(cls)).slice(0, 4));
    }
  });
});

describe("needsHardware", () => {
  it("is true when a template reads a temperature or a clock, not for loads and plugins alone", () => {
    expect(needsHardware(["cpu.temp"])).toBe(true);
    expect(needsHardware(["gpu.clock", "net.down"])).toBe(true);
    expect(needsHardware(["cpu.load", "net.down", "clock.second", "fps"])).toBe(false);
  });
});

describe("applyFirstRun", () => {
  it("knows a fresh install and nothing else", () => {
    expect(isPristine(defaultConfig())).toBe(true);
    const used = applyFirstRun(defaultConfig(), choices({ start: "template" })).config;
    expect(isPristine(used)).toBe(false);
  });

  it("sets up the one blank screen of a fresh install at the size, its first page called Main", () => {
    const base = defaultConfig();
    const { config, profileId } = applyFirstRun(base, choices());
    expect(config.profiles).toHaveLength(1);
    expect(profileId).toBe(base.profiles[0].id);
    const screen = config.profiles[0];
    expect(screen).toMatchObject({ id: base.profiles[0].id, name: base.profiles[0].name, width: 1920, height: 550, cols: 12, rows: 4, fit: "fill" });
    expect(screen.pages[0]).toMatchObject({ id: base.profiles[0].pages[0].id, name: "Main" });
    expect(allPlacements(screen)).toEqual([]);
    // A new screen starts from the built-in look (config v16).
    expect(screen.theme).toBeUndefined();
  });

  it("makes a tall screen's grid from its size", () => {
    const screen = applyFirstRun(defaultConfig(), choices({ width: 480, height: 1920 })).config.profiles[0];
    expect(screen).toMatchObject({ width: 480, height: 1920, cols: 6, rows: 6, fit: "scroll" });
  });

  it("makes the screen from the chosen template, its look and pages, under the screen's own id and name", () => {
    const base = defaultConfig();
    const gaming = SCREEN_TEMPLATES.find((t) => t.id === "gaming")!;
    const template = instantiate(gaming, { name: gaming.name, width: 1024, height: 600 }).profile;
    const screen = applyFirstRun(base, choices({ start: "template", width: 1024, height: 600, template })).config.profiles[0];
    expect(screen).toMatchObject({ id: base.profiles[0].id, name: base.profiles[0].name, cols: template.cols, rows: template.rows });
    expect(screen.background).toEqual(template.background);
    expect(screen.pages.map((p) => p.name)).toEqual(["Main", "System"]);
    expect(screen.pages[0].id).toBe(base.profiles[0].pages[0].id);
    expect(screen.pages[0].placements).toEqual(template.pages[0].placements);
  });

  it("falls back to the sample layout, inside the grid, when no template came", () => {
    const screen = applyFirstRun(defaultConfig(), choices({ start: "template", width: 1024, height: 600 })).config.profiles[0];
    const zones = allPlacements(screen);
    expect(zones.length).toBeGreaterThan(0);
    for (const z of zones) {
      expect(z.colStart + z.colSpan - 1).toBeLessThanOrEqual(screen.cols);
      expect(z.rowStart + z.rowSpan - 1).toBeLessThanOrEqual(screen.rows);
    }
  });

  it("changes nothing for Import and Don't add a screen", () => {
    const base = defaultConfig();
    for (const start of ["import", "none"] as const) expect(applyFirstRun(base, choices({ start })).config).toBe(base);
    const used = applyFirstRun(base, choices()).config;
    expect(applyFirstRun(used, choices({ start: "none" })).config.profiles).toBe(used.profiles);
  });

  it("adds a new screen when screens already exist and touches none of them", () => {
    const first = applyFirstRun(defaultConfig(), choices({ start: "template" })).config;
    const { config, profileId } = applyFirstRun(first, choices({ width: 1024, height: 600 }));
    expect(config.profiles).toHaveLength(2);
    expect(config.profiles[0]).toBe(first.profiles[0]);
    expect(config.profiles[1]).toMatchObject({ id: profileId, name: "1024×600", width: 1024, height: 600 });
  });

  it("makes a config that survives a save and load", () => {
    const gaming = SCREEN_TEMPLATES.find((t) => t.id === "gaming")!;
    const template = instantiate(gaming, { name: gaming.name, width: 1024, height: 600 }).profile;
    const { config } = applyFirstRun(defaultConfig(), choices({ start: "template", width: 1024, height: 600, template }));
    const loaded: DashboardConfig = upgradeConfig(JSON.parse(JSON.stringify(config)));
    expect(loaded.profiles[0].pages[0].name).toBe("Main");
    expect(loaded.profiles[0].pages[0].placements).toEqual(config.profiles[0].pages[0].placements);
  });
});
