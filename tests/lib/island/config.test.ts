import { describe, expect, it } from "vitest";
import { ISLAND_DEFAULTS, normalizeIsland, statLevel, withIsland, type IslandConfig } from "@/lib/island/config";

describe("normalizeIsland", () => {
  it("keeps an absent or malformed island absent", () => {
    expect(normalizeIsland(undefined)).toBeUndefined();
    expect(normalizeIsland("on")).toBeUndefined();
    expect(normalizeIsland([])).toBeUndefined();
  });

  it("falls back to the defaults for bad values and clamps numbers", () => {
    expect(normalizeIsland({})).toEqual(ISLAND_DEFAULTS);
    expect(
      normalizeIsland({ enabled: false, idle: "clock", size: "xl", offsetY: 500, collapseAfter: -3, sensorKey: 4, sensorLabel: "A very long label", reserve: "yes", tint: "red" })
    ).toEqual({
      ...ISLAND_DEFAULTS,
      enabled: false,
      offsetY: 64,
      collapseAfter: 0,
      // An island saved before `stats` keeps its one value as the first.
      stats: [{ key: "", label: "A very long " }],
    });
  });

  it("keeps each dashboard notice off unless stored as true, and clamps the calendar lead", () => {
    const island = normalizeIsland({ notices: { page: true, layout: "yes", onAir: 1 }, calendarLead: 900 });
    expect(island?.notices).toEqual({ page: true, layout: false, plugins: false, onAir: false, calendar: false, agents: false });
    expect(island?.calendarLead).toBe(120);
    expect(normalizeIsland({ notices: "all" })?.notices).toEqual(ISLAND_DEFAULTS.notices);
  });

  it("round-trips a full island", () => {
    const island: IslandConfig = {
      enabled: true,
      idle: "sensor",
      stats: [{ key: "libre.gpu.temp", label: "GPU", warn: 75, crit: 85 }, { key: "libre.cpu.load", label: "CPU" }],
      rotate: 5,
      size: "l",
      scale: 120,
      shape: "notch",
      offsetY: 12,
      collapseAfter: 30,
      reserve: true,
      tint: "custom",
      bgColor: "#102030",
      fgColor: "#f0e0d0",
      opacity: 80,
      border: "subtle",
      shadow: false,
      font: "inter",
      weight: "bold",
      seconds: "hide",
      hours: "12",
      motion: "smooth",
      group: true,
      notices: { page: true, layout: false, plugins: true, onAir: true, calendar: true, agents: true },
      calendarLead: 15,
    };
    expect(normalizeIsland(JSON.parse(JSON.stringify(island)))).toEqual(island);
  });
});

describe("new island settings", () => {
  it("migrates the one stored sensor into the values list", () => {
    expect(normalizeIsland({ idle: "sensor", sensorKey: " libre.gpu ", sensorLabel: "GPU" })?.stats).toEqual([{ key: "libre.gpu", label: "GPU" }]);
    expect(normalizeIsland({ sensorKey: "", sensorLabel: "" })?.stats).toEqual([]);
    // A stored list wins over the old fields.
    expect(normalizeIsland({ stats: [], sensorKey: "x" })?.stats).toEqual([]);
  });

  it("keeps at most three values and drops bad thresholds", () => {
    const stats = normalizeIsland({ stats: [{ key: "a", warn: 5, crit: "x" }, { key: "b" }, { key: "c" }, { key: "d" }, "junk"] })?.stats;
    expect(stats).toEqual([{ key: "a", label: "", warn: 5 }, { key: "b", label: "" }, { key: "c", label: "" }]);
  });

  it("falls back for bad colours, fonts and enums and clamps scale, opacity and rotation", () => {
    const i = normalizeIsland({ bgColor: "red", fgColor: "#FFF", font: "comic", weight: 9, shape: "blob", motion: "fast", border: 1, seconds: true, hours: 24, scale: 400, opacity: 0, rotate: -1 });
    expect(i).toMatchObject({ bgColor: "#000000", fgColor: "#ffffff", font: "system", weight: "semibold", shape: "pill", motion: "lively", border: "none", seconds: "general", hours: "general", scale: 150, opacity: 30, rotate: 0 });
    expect(normalizeIsland({ bgColor: "#AABBCC" })?.bgColor).toBe("#aabbcc");
    expect(normalizeIsland({ shadow: false })?.shadow).toBe(false);
  });
});

describe("statLevel", () => {
  it("turns orange then red past the thresholds, the higher winning", () => {
    const stat = { key: "k", label: "", warn: 70, crit: 90 };
    expect(statLevel(stat, 69)).toBeNull();
    expect(statLevel(stat, 70)).toBe("warn");
    expect(statLevel(stat, 95)).toBe("crit");
    expect(statLevel({ key: "k", label: "", crit: 50 }, 60)).toBe("crit");
    expect(statLevel(stat, undefined)).toBeNull();
    expect(statLevel({ key: "k", label: "" }, 1e9)).toBeNull();
  });
});

describe("withIsland", () => {
  it("starts a profile without an island from the defaults, switched off", () => {
    const profile: { name: string; island?: IslandConfig } = { name: "p" };
    expect(withIsland(profile, { size: "s" })).toEqual({ name: "p", island: { ...ISLAND_DEFAULTS, enabled: false, size: "s" } });
  });

  it("patches an existing island", () => {
    const p = { island: { ...ISLAND_DEFAULTS, offsetY: 20 } };
    expect(withIsland(p, { idle: "hidden" }).island).toEqual({ ...ISLAND_DEFAULTS, offsetY: 20, idle: "hidden" });
  });
});
