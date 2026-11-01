import { describe, expect, it } from "vitest";
import { allSections, inspectorTabs, splitMore, tabStates, widgetContext } from "@/components/studio/inspector-model";
import { modules } from "@/modules";
import { isMore, type ModuleSetting } from "@/modules/types";

// The nine widgets drawn in the widget settings v2 concept (SPEC §6.3, widget-settings-data.js): each
// tab's sections in order, each row's key with its More flag, palette role and per-widget flag.
const SAMPLES = ["SystemOverview", "NowPlaying", "SensorGroup", "AudioMeter", "Weather", "CpuMonitor", "Uptime", "SteamProfile", "WebPage"];

const row = (d: ModuleSetting): string =>
  [d.key, isMore(d) ? "more" : "", d.role ? `role ${d.role}` : "", d.perWidget ? "per widget" : "", d.type === "preset" || d.type === "status" ? d.type : ""].filter(Boolean).join(" · ");

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

describe.each(SAMPLES)("%s", (id) => {
  it("files its rows as drawn", () => {
    expect(schemaOf(id)).toMatchSnapshot();
  });

  it("gives every colour row a palette role and files no section under Content or the widget's name", () => {
    const colors = (modules.find((m) => m.id === id)!.settings ?? []).filter((d) => d.type === "color" && !d.section);
    expect(colors.filter((d) => !d.role).map((d) => d.key)).toEqual([]);
    { // files no section under Content or the widget's name
      const mod = modules.find((m) => m.id === id)!;
      const titles = allSections(widgetContext(mod)).map((s) => s.title);
      expect(titles).not.toContain("Content");
      expect(titles).not.toContain(mod.title);
    }
  });
});

describe("More counts", () => {
  // Opacity and glow joined the visualiser's own rows from Widget colors, behind More as they were there.
  it("NowPlaying keeps 9 visualiser rows behind More", () => {
    const viz = allSections(widgetContext(modules.find((m) => m.id === "NowPlaying")!)).find((s) => s.title === "Visualizer" && s.tab === "show")!;
    expect(splitMore(viz).count).toBe(9);
  });
});
