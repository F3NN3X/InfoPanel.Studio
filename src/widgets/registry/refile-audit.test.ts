import { describe, expect, it } from "vitest";
import { allSections, inspectorTabs, tabStates, widgetContext } from "@/components/studio/inspector-model";
import { OTHER_TITLE } from "@/components/studio/inspector-categories";
import { modules } from "@/modules";

// The audit of the refile (widget settings v2, SPEC §6.4 and §9), over every widget filed so far:
// the nine sample widgets and the batches of the rest. Each batch adds its widgets here.
const REFILED = [
  "SystemOverview", "NowPlaying", "SensorGroup", "AudioMeter", "Weather", "CpuMonitor", "Uptime", "SteamProfile", "WebPage",
  // Batch A
  "MenuBar", "KpiTiles", "StatusTracker", "SystemStatus", "Vitals", "ServiceHealth", "ProcessList", "CoreHeatmap", "GpuRings", "GpuMonitor", "MemoryUsage", "Thermals", "PowerDraw", "Fans",
];

describe.each(REFILED)("%s", (id) => {
  const mod = modules.find((m) => m.id === id)!;
  const context = widgetContext(mod);
  const sections = allSections(context);

  it("files no section under Content, Other or the widget's name", () => {
    const titles = sections.map((s) => s.title);
    expect(titles).not.toContain("Content");
    expect(titles).not.toContain(OTHER_TITLE);
    expect(titles.map((t) => t.toLowerCase())).not.toContain(mod.title.toLowerCase());
  });

  it("gives every colour row a palette role", () => {
    const colors = (mod.settings ?? []).filter((d) => d.type === "color" && !d.section);
    expect(colors.filter((d) => !d.role).map((d) => d.key)).toEqual([]);
  });

  it("leaves no enabled tab empty and no section without rows", () => {
    const states = tabStates(inspectorTabs(context), sections);
    for (const t of states.filter((s) => !s.disabled)) expect(sections.filter((s) => s.tab === t.id).length, t.label).toBeGreaterThan(0);
    for (const s of sections.filter((x) => !x.special)) expect(s.settings.length, s.title).toBeGreaterThan(0);
  });
});
