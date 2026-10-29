import { upgradeConfig } from "@/lib/config-upgrade";
import { describe, expect, it } from "vitest";
import { CONFIG_VERSION, type Placement, type StoredConfig } from "@/lib/layout";
import { chromeOf } from "@/modules/standard-settings";
import { chromeVars, numGlowAttr } from "@/components/widget-style";
import { skinContext } from "@/widgets/core/look";

const zone = (id: string, module: string, settings?: Record<string, unknown>) => ({ id, module, colStart: 1, rowStart: 1, colSpan: 3, rowSpan: 2, visible: true, ...(settings ? { settings } : {}) });

const stored = (version: number, placements: Record<string, unknown>[], extra: Record<string, unknown> = {}): StoredConfig =>
  ({ version, activeProfile: "auto", profiles: [{ id: "p", name: "Desk", width: 1920, height: 1080, cols: 12, rows: 6, fit: "scroll", pages: [{ id: "main", name: "Main", placements }] }], ...extra }) as unknown as StoredConfig;

const zonesOf = (c: ReturnType<typeof upgradeConfig>): Placement[] => c.profiles[0].pages[0].placements;

describe("v13: glow (the migration is the identity)", () => {
  it("stamps the version and changes no data", () => {
    const v12 = stored(12, [zone("cpu", "CpuMonitor", { device: "cpu0", accent: "#fff" })]);
    const out = upgradeConfig(v12);
    expect(out.version).toBe(CONFIG_VERSION);
    expect(CONFIG_VERSION).toBeGreaterThanOrEqual(13);
    expect(zonesOf(out)[0].settings).toEqual({ device: "cpu0", accent: "#fff" });
  });

  it("keeps the number-glow keys of a zone and round-trips through JSON", () => {
    const once = upgradeConfig(stored(13, [zone("cpu", "CpuMonitor", { numGlow: "strong", numGlowColor: "#00ffff" })]));
    expect(zonesOf(once)[0].settings).toEqual({ numGlow: "strong", numGlowColor: "#00ffff" });
    expect(upgradeConfig(JSON.parse(JSON.stringify(once)) as StoredConfig)).toEqual(once);
  });

  it("migrates a v11 config through v12 to v13 in one load", () => {
    const out = upgradeConfig(stored(11, [zone("mix", "VolumeMixer", { device: "default-audio" })]));
    expect(out.version).toBe(CONFIG_VERSION);
    expect(zonesOf(out)[0].settings).toEqual({ devices: "default-audio" });
  });
});

describe("the Number glow look key", () => {
  it("reads as auto with nothing set, and refuses a value it doesn't know", () => {
    expect(chromeOf({})).toMatchObject({ numGlow: "auto", numGlowColor: "" });
    expect(chromeOf({ numGlow: "huge" }).numGlow).toBe("auto");
  });

  it("anything but Auto flags the scope (index.css draws it); the colour is a variable; Auto sets nothing", () => {
    expect(skinContext("nixie", { chrome: chromeOf({}) })).toMatchObject({ numGlow: true });
    for (const numGlow of ["off", "soft", "strong"]) expect(numGlowAttr(chromeOf({ numGlow }))).toEqual({ "data-wp-numglow": numGlow });
    expect(numGlowAttr(chromeOf({}))).toEqual({});
    expect(chromeVars(chromeOf({ numGlow: "strong", numGlowColor: "#0ff" }))).toMatchObject({ "--w-num-c": "#0ff" });
    expect(chromeVars(chromeOf({})) ?? {}).not.toHaveProperty("--w-num-c");
  });
});
