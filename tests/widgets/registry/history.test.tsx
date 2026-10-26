import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SensorMap } from "@/modules/types";
import snapshot from "@/widgets/__fixtures__/snapshot.json";
import { toFlat, toNames } from "@/widgets/data-adapter";
import type { ShellProps } from "@/widgets/kit";
import BottleneckLens, { meta as bottleneck } from "@/widgets/BottleneckLens";
import FrameHistogram, { meta as histogram } from "@/widgets/FrameHistogram";
import SessionStats, { meta as stats } from "@/widgets/SessionStats";
import ThresholdTimeline, { meta as timeline } from "@/widgets/ThresholdTimeline";
import { GROUP_HISTORY } from "@/widgets/registry/history";
import { roleData } from "@/widgets/role-data";

const WIDGETS: [typeof bottleneck, ComponentType<ShellProps>][] = [
  [bottleneck, BottleneckLens],
  [histogram, FrameHistogram],
  [stats, SessionStats],
  [timeline, ThresholdTimeline],
];
const SENSORS = (snapshot as unknown as { sensors: SensorMap }).sensors;
const RTSS = "plugins.InfoPanel.RTSS.rtss.";
const GPU = "libre.nvidia_geforce_rtx_5090_gpu_core_load";

/** The snapshot with some readings replaced: the snapshot's game is running (77 fps, GPU 90 %). */
const withValues = (values: Record<string, number>): SensorMap =>
  Object.fromEntries(Object.entries(SENSORS).map(([k, s]) => [k, k in values ? { ...s, value: values[k] } : s]));
const view = (sensors: SensorMap) => ({ data: toFlat(sensors), names: toNames(sensors) });

const LIVE = view(SENSORS);
const IDLE = view(withValues({ [`${RTSS}fps`]: 0, [`${RTSS}current frame time`]: 0, [GPU]: 4 }));

const html = (Component: ComponentType<ShellProps>, props: Partial<ShellProps> & { data: ShellProps["data"] }) => renderToString(createElement(Component, props));

describe("history and analysis widgets", () => {
  it("are registered in order, as their meta says", () => {
    expect(GROUP_HISTORY.map((m) => m.id)).toEqual(WIDGETS.map(([m]) => m.id));
  });

  WIDGETS.forEach(([meta, Component], i) => {
    describe(meta.id, () => {
      it("mirrors its meta in the module", () => {
        expect(GROUP_HISTORY[i]).toMatchObject({ id: meta.id, minCols: meta.minSize[0], minRows: meta.minSize[1], category: meta.category });
      });

      it("renders live, idle, dense and with no data without throwing", () => {
        expect(html(Component, { ...LIVE, size: "md" })).toMatch(/\d/);
        expect(html(Component, { ...IDLE, size: "md" }).length).toBeGreaterThan(0);
        expect(html(Component, { ...LIVE, size: "xs", variant: "studio", skin: "tui" }).length).toBeGreaterThan(0);
        expect(html(Component, { data: {} }).length).toBeGreaterThan(0);
      });
    });
  });

  it("Bottleneck Lens says Balanced for the snapshot's game and Idle with none running", () => {
    expect(html(BottleneckLens, { ...LIVE, size: "lg" })).toContain("Balanced");
    expect(html(BottleneckLens, { ...IDLE, size: "lg" })).toContain("Idle");
  });

  it("Bottleneck Lens names a GPU at its limit", () => {
    expect(html(BottleneckLens, { ...view(withValues({ [GPU]: 99 })), size: "lg" })).toContain("GPU-bound");
  });

  it("Frame Histogram shows the empty state when no game runs", () => {
    expect(html(FrameHistogram, { ...IDLE, size: "lg" })).toContain("No game running");
  });
});

describe("roleData", () => {
  it("finds the roles by name in the flat data, and the throttle flags", () => {
    const r = roleData(LIVE.data, LIVE.names);
    expect(r.roles["gpu.load"]?.key).toBe(GPU);
    expect(r.roles["cpu.maxcore"]?.value).toBeCloseTo(79.87, 1);
    expect(r.roles.fps?.value).toBeCloseTo(77.76, 1);
    expect(r.thermalThrottle || r.powerThrottle).toBe(false);

    const flags = view({
      ...SENSORS,
      "hwinfo.performance_limit___thermal": { value: 1, unit: "Yes/No", name: "Performance Limit - Thermal" },
      "hwinfo.performance_limit___power": { value: 0, unit: "Yes/No", name: "Performance Limit - Power" },
    });
    const f = roleData(flags.data, flags.names);
    expect([f.thermalThrottle, f.powerThrottle]).toEqual([true, false]);
  });
});
