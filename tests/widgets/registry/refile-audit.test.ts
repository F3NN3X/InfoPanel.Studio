import { expect, it } from "vitest";
import { allSections, inspectorTabs, tabStates, widgetContext } from "@/components/studio/inspector-model";
import { OTHER_TITLE } from "@/components/studio/inspector-categories";
import { modules } from "@/modules";
import { INSPECTOR_META } from "@/widgets/registry/inspector-meta";

// The audit of the refile (widget settings v2, SPEC §6.4 and §9), over every widget filed so far:
// the nine sample widgets and the three batches of the rest: all 54.
const REFILED = [
  "SystemOverview", "NowPlaying", "SensorGroup", "AudioMeter", "Weather", "CpuMonitor", "Uptime", "SteamProfile", "WebPage",
  // Batch A
  "MenuBar", "KpiTiles", "StatusTracker", "SystemStatus", "Vitals", "ServiceHealth", "ProcessList", "CoreHeatmap", "GpuRings", "GpuMonitor", "MemoryUsage", "Thermals", "PowerDraw", "Fans",
  // Batch B
  "DriveSpace", "StorageHealth", "DiskIO", "NetworkThroughput", "NetworkAdapters", "Clock", "Timer", "CodingAgents", "Calendar", "Forecast", "SensorValue", "CustomGauge", "VolumeMixer", "MeterBridge", "Visualizer", "WaveLink",
  // Batch C
  "FpsMonitor", "GameSpotlight", "OsdStrip", "FramePacing", "PlaytimeShare", "SteamFriends", "SteamGame", "Achievements", "SteamLibrary", "SteamNews", "TextFile", "Notifications", "Departures", "Bluetooth", "StreamDeck",
];

it("covers all 54 widgets", () => {
  expect(REFILED).toHaveLength(54);
  expect(new Set(REFILED).size).toBe(54);
  expect([...REFILED].sort()).toEqual(modules.filter((m) => INSPECTOR_META[m.id]).map((m) => m.id).sort());
});

it("files every widget by the rules: no Content, Other or widget-name section, a role on every colour row, no empty tab or section", () => {
  for (const id of REFILED) {
    const mod = modules.find((m) => m.id === id)!;
    const context = widgetContext(mod);
    const sections = allSections(context);

    const titles = sections.map((s) => s.title);
    expect(titles, id).not.toContain("Content");
    expect(titles, id).not.toContain(OTHER_TITLE);
    expect(titles.map((t) => t.toLowerCase()), id).not.toContain(mod.title.toLowerCase());

    const colors = (mod.settings ?? []).filter((d) => d.type === "color" && !d.section);
    expect(colors.filter((d) => !d.role).map((d) => d.key), id).toEqual([]);

    const states = tabStates(inspectorTabs(context), sections);
    for (const t of states.filter((s) => !s.disabled)) expect(sections.filter((s) => s.tab === t.id).length, `${id} ${t.label}`).toBeGreaterThan(0);
    for (const s of sections.filter((x) => !x.special)) expect(s.settings.length, `${id} ${s.title}`).toBeGreaterThan(0);
  }
});
