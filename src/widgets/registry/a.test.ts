import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SensorMap } from "@/modules/types";
import snapshot from "../__fixtures__/snapshot.json";
import type { ShellProps, WidgetMeta } from "../core/types";
import { toFlat } from "../data-adapter";
import { GROUP_A } from "./a";
import * as SystemOverview from "../SystemOverview";
import * as MenuBar from "../MenuBar";
import * as KpiTiles from "../KpiTiles";
import * as StatusTracker from "../StatusTracker";
import * as SystemStatus from "../SystemStatus";
import * as Vitals from "../Vitals";
import * as ServiceHealth from "../ServiceHealth";
import * as ProcessList from "../ProcessList";
import * as Uptime from "../Uptime";
import * as CpuMonitor from "../CpuMonitor";
import * as CoreHeatmap from "../CoreHeatmap";
import * as GpuRings from "../GpuRings";
import * as GpuMonitor from "../GpuMonitor";
import * as MemoryUsage from "../MemoryUsage";
import * as Thermals from "../Thermals";
import * as PowerDraw from "../PowerDraw";
import * as Fans from "../Fans";

interface Entry {
  meta: WidgetMeta;
  default: ComponentType<ShellProps>;
}
const WIDGETS = [SystemOverview, MenuBar, KpiTiles, StatusTracker, SystemStatus, Vitals, ServiceHealth, ProcessList, Uptime, CpuMonitor, CoreHeatmap, GpuRings, GpuMonitor, MemoryUsage, Thermals, PowerDraw, Fans] as unknown as Entry[];

const DATA = toFlat(snapshot.sensors as SensorMap);
// Widgets whose source keys are absent from the captured snapshot, so no live value shows.
const NO_LIVE: Record<string, string> = {};

const render = (C: ComponentType<ShellProps>, data: ShellProps["data"], extra: Partial<ShellProps> = {}) => renderToString(createElement(C, { data, ...extra }));

describe("group A modules", () => {
  it("covers the 17 widgets in order", () => {
    expect(GROUP_A.map((m) => m.id)).toEqual(WIDGETS.map((w) => w.meta.id));
    expect(GROUP_A).toHaveLength(17);
  });

  // One test per kind: its module mirrors its meta, and it renders (a live value, the extremes, no data) without throwing.
  it.each(WIDGETS.map((w) => [w.meta.id, w] as const))("%s: mirrors its meta and renders", (id, w) => {
    const mod = GROUP_A.find((m) => m.id === w.meta.id)!;
    expect(mod.minCols).toBe(w.meta.minSize[0]);
    expect(mod.minRows).toBe(w.meta.minSize[1]);
    expect(mod.defaultSize).toEqual(w.meta.defaultSize);
    expect(mod.category).toBe(w.meta.category);
    if (!(id in NO_LIVE)) expect(render(w.default, DATA, { size: "md" })).toMatch(/\d/);
    expect(render(w.default, DATA, { size: "xs", variant: "studio", skin: "tui" }).length).toBeGreaterThan(0);
    expect(render(w.default, {}).length).toBeGreaterThan(0);
  });

  it("passes stored settings through by prop name", () => {
    const mod = GROUP_A.find((m) => m.id === "Uptime")!;
    expect(mod.render(snapshot.sensors as SensorMap, { showSeconds: false })).toBeTruthy();
  });
});
