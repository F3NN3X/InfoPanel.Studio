import { describe, expect, it } from "vitest";
import { allSections, inspectorTabs, tabStates, widgetContext } from "@/components/studio/inspector-model";
import { modules } from "@/modules";
import { isMore, type ModuleSetting } from "@/modules/types";

// Widget settings v2 (SPEC §6.4): the widgets filed by the rules rather than drawn in the concept, each
// tab's sections in order with each row's key, More flag, palette role and per-widget flag.
// Batch A: system and hardware (`a.ts`).
const BATCH_A = ["MenuBar", "KpiTiles", "StatusTracker", "SystemStatus", "Vitals", "ServiceHealth", "ProcessList", "CoreHeatmap", "GpuRings", "GpuMonitor", "MemoryUsage", "Thermals", "PowerDraw", "Fans"];

// Batch B: storage, network, info, generic and audio (`b.ts`, `c.ts`).
const BATCH_B = ["DriveSpace", "StorageHealth", "DiskIO", "NetworkThroughput", "NetworkAdapters", "Clock", "Timer", "CodingAgents", "Calendar", "Forecast", "SensorValue", "CustomGauge", "VolumeMixer", "MeterBridge", "Visualizer", "WaveLink"];

// Batch C: gaming and the plain plugin cards (`d.ts`, `e.ts`).
const BATCH_C = ["FpsMonitor", "GameSpotlight", "OsdStrip", "FramePacing", "PlaytimeShare", "SteamFriends", "SteamGame", "Achievements", "SteamLibrary", "SteamNews", "TextFile", "Notifications", "Departures", "Bluetooth", "StreamDeck"];

const row = (d: ModuleSetting): string => [d.key, isMore(d) ? "more" : "", d.role ? `role ${d.role}` : "", d.perWidget ? "per widget" : "", d.type === "preset" || d.type === "status" ? d.type : ""].filter(Boolean).join(" · ");

function schemaOf(id: string) {
  const context = widgetContext(modules.find((m) => m.id === id)!);
  const sections = allSections(context);
  return Object.fromEntries(
    tabStates(inspectorTabs(context), sections).map((t) => [
      t.disabled ? `${t.label} (disabled)` : t.label,
      sections.filter((s) => s.tab === t.id).map((s) => ({ [s.special ? `${s.title} [${s.special}]` : s.title]: s.settings.map(row) })),
    ])
  );
}

describe.each([...BATCH_A, ...BATCH_B, ...BATCH_C])("%s", (id) => {
  it("files its rows by the rules", () => {
    expect(schemaOf(id)).toMatchSnapshot();
  });
});

describe("batch A", () => {
  it("files the colour rows that gained a role under Widget colors", () => {
    const roles = (id: string) => modules.find((m) => m.id === id)!.settings!.filter((d) => d.type === "color" && !d.section).map((d) => [d.key, d.role]);
    expect(roles("GpuRings")).toEqual([["outerColor", "s1"], ["innerColor", "s2"]]);
    expect(roles("Thermals")).toEqual([["fanColor", "s3"]]);
  });

  it("keeps the StatusTracker track levels behind More of Thresholds", () => {
    const sections = allSections(widgetContext(modules.find((m) => m.id === "StatusTracker")!));
    const thresholds = sections.find((s) => s.title === "Thresholds")!;
    expect(thresholds.settings.filter(isMore).map((d) => d.key)).toEqual(["track.1.warn", "track.1.crit", "track.2.warn", "track.2.crit", "track.3.warn", "track.3.crit"]);
  });
});

describe("batch B", () => {
  const colors = (id: string) => modules.find((m) => m.id === id)!.settings!.filter((d) => d.type === "color" && !d.section).map((d) => [d.key, d.role]);

  it("files the colour rows that gained a role under Widget colors", () => {
    expect(colors("DiskIO")).toEqual([["readColor", "s1"], ["writeColor", "s2"]]);
    expect(colors("NetworkThroughput")).toEqual([["downloadColor", "s1"], ["uploadColor", "s2"]]);
    expect(colors("VolumeMixer")).toEqual([["levelColor", "ok"]]);
    expect(colors("MeterBridge")).toEqual([["levelColor", "ok"], ["hotColor", "crit"]]);
    expect(colors("WaveLink")).toEqual([["levelColor", "ok"], ["liveColor", "ok"], ["muteColor", "crit"]]);
    expect(colors("Visualizer")).toEqual([["ramp", "s1"], ["vizColor2", "s2"], ["vizColor3", "s3"], ["vizPeakColor", "crit"]]);
  });

  it("keeps CustomGauge's gauge and frames in the schema but out of the inspector", () => {
    const mod = modules.find((m) => m.id === "CustomGauge")!;
    expect(mod.settings!.filter((d) => d.hidden).map((d) => d.key)).toEqual(["gauge", "frames"]);
    const listed = allSections(widgetContext(mod)).flatMap((s) => s.settings.map((d) => d.key));
    expect(listed).not.toContain("gauge");
    expect(listed).not.toContain("frames");
  });

  it("files the look-only Neutral toggle of DriveSpace under Widget colors, per widget", () => {
    const neutral = modules.find((m) => m.id === "DriveSpace")!.settings!.find((d) => d.key === "neutral")!;
    expect([neutral.tab, neutral.perWidget]).toEqual(["style", true]);
  });
});

describe("batch C", () => {
  const colors = (id: string) => modules.find((m) => m.id === id)!.settings!.filter((d) => d.type === "color" && !d.section).map((d) => [d.key, d.role]);

  it("files the colour rows under Widget colors with their roles", () => {
    expect(colors("FpsMonitor")).toEqual([["ringColor", "s1"], ["sparkColor", "s2"]]);
    expect(colors("PlaytimeShare")).toEqual([1, 2, 3, 4, 5, 6].map((n) => [`color${n}`, `s${n}`]));
    expect(colors("SteamFriends")).toEqual([["ingameColor", "s1"], ["onlineColor", "ok"], ["awayColor", "warn"], ["busyColor", "crit"], ["offlineColor", "s2"]]);
    expect(colors("Bluetooth")).toEqual([["batteryMidColor", "warn"], ["batteryLowColor", "crit"]]);
  });

  it("files the view bundles of FpsMonitor and Bluetooth as presets", () => {
    for (const id of ["FpsMonitor", "Bluetooth"]) expect(modules.find((m) => m.id === id)!.settings!.find((d) => d.key === "view")!.type, id).toBe("preset");
  });

  it("files the look-only scrims under Widget colors, per widget", () => {
    for (const id of ["GameSpotlight", "SteamGame"]) {
      const scrim = modules.find((m) => m.id === id)!.settings!.find((d) => d.key === "scrim")!;
      expect([scrim.tab, scrim.perWidget], id).toEqual(["style", true]);
    }
  });
});
