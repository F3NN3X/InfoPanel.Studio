import { describe, expect, it } from "vitest";
import type { Usage } from "@/lib/data-usage";
import {
  bindOptions,
  isBoundTo,
  resolveBindTarget,
  streamPath,
  type BindZone,
} from "@/components/studio/explorer/explorer-model";
const usage = (u: Partial<Usage> & { zoneId: string }): Usage => ({ label: "Panel › Temp", ...u });

describe("streamPath", () => {
  it("streams one key once a second", () => {
    expect(streamPath("cpu.load")).toBe("/events?prefix=cpu.load&interval=1000");
    expect(streamPath("a b")).toBe("/events?prefix=a%20b&interval=1000");
  });
});

describe("binding target", () => {
  const zones: BindZone[] = [
    { id: "z-meter", title: "Meter" },
    { id: "z-panel", title: "Stats", widgets: [{ id: "w1", label: "Temp" }, { id: "w2", label: "Load" }] },
    { id: "z-empty", title: "Empty panel", widgets: [] },
  ];
  const options = bindOptions(zones);

  it("lists widget zones and each panel widget, but not an empty panel", () => {
    expect(options.map((o) => o.label)).toEqual(["Meter", "Stats › Temp", "Stats › Load"]);
    expect(options[1]).toMatchObject({ zoneId: "z-panel", widgetId: "w1" });
  });

  it("defaults to the selected zone, else the first option", () => {
    expect(resolveBindTarget(options, null, "z-panel")).toBe(options[1]);
    expect(resolveBindTarget(options, null, "gone")).toBe(options[0]);
    expect(resolveBindTarget(options, null, null)).toBe(options[0]);
    expect(resolveBindTarget([], null, null)).toBeNull();
  });

  it("knows whether the point is already bound to the target", () => {
    const used = [usage({ zoneId: "z-panel", panelWidgetId: "w1" }), usage({ zoneId: "z-meter" })];
    expect(isBoundTo(used, options[0])).toBe(true);
    expect(isBoundTo(used, options[1])).toBe(true);
    expect(isBoundTo(used, options[2])).toBe(false);
    expect(isBoundTo(used, null)).toBe(false);
  });
});

