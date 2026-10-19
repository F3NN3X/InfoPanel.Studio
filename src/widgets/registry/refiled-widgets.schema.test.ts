import { describe, expect, it } from "vitest";
import { allSections, inspectorTabs, tabStates, widgetContext } from "@/components/studio/inspector-model";
import { modules } from "@/modules";
import { isMore, type ModuleSetting } from "@/modules/types";

// Widget settings v2 (SPEC §6.4): the widgets filed by the rules rather than drawn in the concept, each
// tab's sections in order with each row's key, More flag, palette role and per-widget flag.
// Batch A: system and hardware (`a.ts`).
const BATCH_A = ["MenuBar", "KpiTiles", "StatusTracker", "SystemStatus", "Vitals", "ServiceHealth", "ProcessList", "CoreHeatmap", "GpuRings", "GpuMonitor", "MemoryUsage", "Thermals", "PowerDraw", "Fans"];

const row = (d: ModuleSetting): string => [d.key, isMore(d) ? "more" : "", d.role ? `role ${d.role}` : "", d.perWidget ? "per widget" : ""].filter(Boolean).join(" · ");

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

describe.each(BATCH_A)("%s", (id) => {
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
