import { describe, expect, it } from "vitest";
import type { Usage } from "@/lib/data-usage";
import {
  bindOptions,
  isBoundTo,
  pointDisplayName,
  prefKeyOf,
  resolveBindTarget,
  streamPath,
  usedInCell,
  type BindZone,
} from "@/components/studio/explorer/explorer-model";
import type { DataPoint, DataSource } from "@/lib/data-points";
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


describe("point display names", () => {
  const point = (over: Partial<DataPoint>): DataPoint => ({
    key: "k", name: "Peak", sourceId: "plugins.audio", sourceName: "Audio", containerId: "plugins.audio/usb", containerRawId: "usb",
    containerTitle: "USB headset", raw: "1", type: "number", num: 1, unit: "", kind: "", ...over,
  });
  const container = { id: "plugins.audio/usb", title: "USB headset", sourceId: "plugins.audio", points: [], status: "ok" as const };
  const plugin: DataSource = { id: "plugins.audio", name: "Audio", category: "Plugins", containers: [container, { ...container, id: "plugins.audio/mic", title: "Mic" }], count: 2, status: "ok" };
  const builtin: DataSource = { id: "system", name: "System", category: "Built-in", containers: [], count: 1, status: "ok" };

  it("edits the container's name for a plugin, and the source's for any other source", () => {
    expect(prefKeyOf(plugin, container)).toBe("plugins.audio::usb");
    expect(prefKeyOf(builtin)).toBe("system::");
    expect(prefKeyOf(builtin, { ...container, sourceId: "system" })).toBeNull();
    expect(pointDisplayName([plugin, builtin], point({}), { "plugins.audio::usb": { displayName: "Headset" } })).toEqual({
      key: "plugins.audio::usb",
      value: "Headset",
      name: "USB headset",
    });
    expect(pointDisplayName([plugin, builtin], point({ sourceId: "system", containerId: "system/" }), undefined)).toEqual({ key: "system::", value: "", name: "System" });
  });

  it("has none for a point whose source is gone", () => {
    expect(pointDisplayName([builtin], point({}), undefined)).toBeNull();
  });
});

describe("usedInCell", () => {
  it("lists up to two screens, then counts, and dashes none", () => {
    expect(usedInCell(undefined)).toEqual({ text: "—", used: false });
    expect(usedInCell(["Bar", "Panel"])).toEqual({ text: "Bar, Panel", used: true });
    expect(usedInCell(["A", "B", "C"])).toEqual({ text: "3 screens", used: true });
  });
});
