import { describe, expect, it } from "vitest";
import type { DashboardConfig, Placement } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { openCanvas } from "@/lib/infopanel/canvas";
import { tableOf } from "@/lib/infopanel/assets/assets";
import { insertVectorGauge, vectorOf } from "@/lib/infopanel/gauges/frames";
import { DEFAULT_GAUGE } from "@/lib/infopanel/gauges/vector";
import { toStored } from "@/lib/infopanel/import/stored";
import { parseProfileXml } from "@/lib/infopanel/parse";
import { defaultItem } from "@/lib/infopanel/schema";
import {
  CUSTOM_GAUGE_ID, gaugeDataOf, gaugeEntryOf, libraryGauges, presetGauges, profileGauges, sourceKey, widgetGauge, withGauge, withGaugeName, withGaugeSpeed,
} from "@/lib/gauge-studio/model";

const profile = parseProfileXml("<Profile><Name>Rig</Name><Width>800</Width><Height>480</Height></Profile>").profile;
const group = { ...defaultItem("Group"), DisplayItems: [insertVectorGauge([], { ...DEFAULT_GAUGE, sweep: 200 }, "Inner").items[0]] };
const items = [{ ...defaultItem("Gauge"), Name: "Frames", MinValue: 10, MaxValue: 90, AnimationSpeed: 4 }, group];
const canvas = toStored({ name: "Rig", origin: "file", dataApi: null, defaultMode: "infopanel", profile, items, fonts: [], assets: tableOf([]), keyOf: () => null });
const widget: Placement = { id: "w1", module: CUSTOM_GAUGE_ID, colStart: 2, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, settings: { gauge: JSON.stringify({ ...DEFAULT_GAUGE, shape: "bar" }), label: "CPU" } };
const zone: Placement = { id: "c1", module: "infopanel", colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, canvas };
const config = { profiles: [{ id: "p", name: "Rig", pages: [{ id: "pg", placements: [zone, widget] }] }] } as unknown as DashboardConfig;

describe("gauge sources", () => {
  it("lists presets read-only, with their kind", () => {
    const presets = presetGauges();
    expect(presets.length).toBeGreaterThan(3);
    expect(presets.find((p) => p.gauge?.shape === "svg")?.kind).toBe("svg");
    expect(presets[0].where).toBe("Preset");
  });

  it("finds canvas gauges (inside groups too) and Custom gauge widgets on the page", () => {
    const found = profileGauges({ name: "Rig", placements: [zone, widget] });
    expect(found.map((g) => [g.key, g.kind, g.name])).toEqual([
      ["canvas:c1:0", "frames", "Frames"],
      ["canvas:c1:1.0", "vector", "Inner"],
      ["widget:w1", "vector", "CPU"],
    ]);
    expect(found[0]).toMatchObject({ min: 10, max: 90, animationSpeed: 4, frames: [], stale: false });
    expect(found[1].stale).toBe(true);
  });

  it("lists a Custom gauge widget with no spec of its own as the default spec it draws", () => {
    const blank: Placement = { ...widget, id: "w2", settings: { label: "GPU" } };
    const bad: Placement = { ...widget, id: "w3", settings: { gauge: "{nope" } };
    const found = profileGauges({ name: "Rig", placements: [blank, bad] });
    expect(found.map((g) => [g.key, g.name, g.gauge?.shape])).toEqual([["widget:w2", "GPU", "arc"], ["widget:w3", "Custom gauge", "arc"]]);
    expect(widgetGauge(blank).text).toBeDefined();
  });

  it("reads library gauge data defensively", () => {
    expect(gaugeDataOf(null)).toBeNull();
    expect(gaugeDataOf({ frames: [{ id: "../x", name: "a" }] })).toBeNull();
    const ok = gaugeDataOf({ frames: [{ id: `${"a".repeat(64)}.png`, name: "f0.png" }], min: 0, max: 50, animationSpeed: 2 });
    expect(ok).toMatchObject({ min: 0, max: 50, animationSpeed: 2 });
    const item = { id: "lib_1", kind: "gauge", name: "Mine", data: ok } as LibraryItem;
    expect(libraryGauges([item, { ...item, id: "lib_2", kind: "image" }])).toMatchObject([{ key: "library:lib_1", kind: "frames", frames: [`/api/assets/${"a".repeat(64)}.png`], files: [{ id: `${"a".repeat(64)}.png`, name: "f0.png" }] }]);
  });

  it("sets a canvas gauge's frame rate in one change, leaving other sources alone", () => {
    const next = withGaugeSpeed(config, { kind: "canvas", zoneId: "c1", path: "0" }, 24);
    const open = openCanvas(JSON.parse(JSON.stringify(next.profiles[0].pages[0].placements[0].canvas)));
    expect(open.items[0]).toMatchObject({ Name: "Frames", AnimationSpeed: 24, MinValue: 10 });
    expect(next.profiles[0].pages[0].placements[1]).toBe(widget);
    expect(withGaugeSpeed(config, { kind: "widget", zoneId: "w1" }, 5)).toBe(config);
    expect(profileGauges({ name: "Rig", placements: [next.profiles[0].pages[0].placements[0]] })[0].animationSpeed).toBe(24);
  });

  it("renames a canvas gauge's Name or a widget's label in one change, leaving other sources alone", () => {
    const next = withGaugeName(config, { kind: "canvas", zoneId: "c1", path: "0" }, "Renamed")!;
    expect(profileGauges({ name: "Rig", placements: [next.profiles[0].pages[0].placements[0]] })[0]).toMatchObject({ name: "Renamed", min: 10 });
    expect(next.profiles[0].pages[0].placements[1]).toBe(widget);
    const labelled = withGaugeName(config, { kind: "widget", zoneId: "w1" }, "GPU")!;
    expect(profileGauges({ name: "Rig", placements: [labelled.profiles[0].pages[0].placements[1]] })[0].name).toBe("GPU");
    expect(withGaugeName(config, { kind: "library", itemId: "x" }, "n")).toBeNull();
  });

  it("writes a canvas gauge's spec back in one change, keeping the rest", () => {
    const next = withGauge(config, { kind: "canvas", zoneId: "c1", path: "1.0" }, { ...DEFAULT_GAUGE, sweep: 90 })!;
    const stored = next.profiles[0].pages[0].placements[0].canvas!;
    const open = openCanvas(JSON.parse(JSON.stringify(stored)));
    expect(vectorOf((open.items[1] as Extract<(typeof open.items)[number], { kind: "Group" }>).DisplayItems[0])?.sweep).toBe(90);
    expect(open.items[0]).toMatchObject({ Name: "Frames", MinValue: 10 });
    expect(next.profiles[0].pages[0].placements[1]).toBe(widget);
  });

  it("writes a widget's spec to its gauge setting; presets and library aren't in the config", () => {
    const next = withGauge(config, { kind: "widget", zoneId: "w1" }, { ...DEFAULT_GAUGE, sweep: 120 })!;
    expect(widgetGauge(next.profiles[0].pages[0].placements[1])?.sweep).toBe(120);
    expect(withGauge(config, { kind: "preset", index: 0 }, DEFAULT_GAUGE)).toBeNull();
    expect(sourceKey({ kind: "library", itemId: "x" })).toBe("library:x");
  });

  it("builds an entry for an unlisted spec: the range from its scale, else the previous data", () => {
    const scaled = { ...DEFAULT_GAUGE, scale: { min: 5, max: 50, unit: "", decimals: null } };
    expect(gaugeEntryOf({ kind: "library", itemId: "a" }, "Mine", scaled, "My library", { min: 0, max: 100, animationSpeed: 3 })).toMatchObject({ key: "library:a", min: 5, max: 50, animationSpeed: 3, kind: "vector" });
    expect(gaugeEntryOf({ kind: "preset", index: -1 }, "New", DEFAULT_GAUGE, "Preset")).toMatchObject({ min: 0, max: 100, animationSpeed: 0, where: "Preset" });
  });
});
