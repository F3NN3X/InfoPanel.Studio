import { describe, expect, it } from "vitest";
import { defaultConfig, PANEL_ID } from "@/lib/layout";
import type { DataPoint } from "@/lib/data-points";
import { pageOf } from "@/lib/pages";
import { addStatZone, withSourcePref } from "@/components/studio/explorer/explorer-actions";
import { parseEndpoints, KNOWN_ENDPOINTS } from "@/components/studio/explorer/explorer-endpoints";

const point: DataPoint = {
  key: "system.cpu.load",
  name: "CPU Load",
  sourceId: "system",
  sourceName: "System",
  containerId: "system/",
  containerRawId: "",
  containerTitle: "System",
  raw: "12 %",
  type: "number",
  num: 12,
  unit: "%",
  kind: "Load",
};

describe("addStatZone", () => {
  it("adds a panel zone with one stat bound to the point", () => {
    const config = defaultConfig();
    const profile = config.profiles[0];
    const next = addStatZone(config, profile.id, point, "z1");
    const zone = pageOf(next.profiles[0]).placements.find((p) => p.id === "z1");
    expect(zone?.module).toBe(PANEL_ID);
    expect(zone?.panel?.widgets).toHaveLength(1);
    expect(zone?.panel?.widgets[0]).toMatchObject({ kind: "stat", sensor: "system.cpu.load", label: "CPU Load" });
    expect(pageOf(next.profiles[0]).placements).toHaveLength(pageOf(profile).placements.length + 1);
  });

  it("makes the zone two rows tall for a number and one for anything else", () => {
    const zoneOf = (p: DataPoint) =>
      addStatZone(defaultConfig(), defaultConfig().profiles[0].id, p, "z1").profiles[0].pages[0].placements.find((pl) => pl.id === "z1");
    expect(zoneOf(point)?.rowSpan).toBe(2);
    expect(zoneOf({ ...point, type: "text", num: null, unit: "" })?.rowSpan).toBe(1);
  });

  it("leaves other profiles alone", () => {
    const config = defaultConfig();
    expect(addStatZone(config, "nope", point, "z1").profiles).toEqual(config.profiles);
  });
});

describe("parseEndpoints", () => {
  it("reads an array and an object holding one", () => {
    const list = [{ method: "get", path: "/api/sensors", description: "Snapshot" }];
    expect(parseEndpoints(list)).toEqual([{ method: "GET", path: "/api/sensors", description: "Snapshot" }]);
    expect(parseEndpoints({ endpoints: list })).toHaveLength(1);
  });

  it("skips junk and returns [] when unreadable", () => {
    expect(parseEndpoints([1, null, {}])).toEqual([]);
    expect(parseEndpoints("nope")).toEqual([]);
    expect(KNOWN_ENDPOINTS).toHaveLength(9);
  });
});

describe("withSourcePref", () => {
  const key = "plugins.audio::usb";

  it("writes a display name beside what the source already holds", () => {
    const config = { ...defaultConfig(), sourcePrefs: { [key]: { enabled: false } } };
    const next = withSourcePref(config, key, { displayName: "Headset" });
    expect(next.sourcePrefs?.[key]).toEqual({ enabled: false, displayName: "Headset" });
    expect(config.sourcePrefs?.[key]).toEqual({ enabled: false });
  });

  it("drops the key for an empty name, so the source shows under its own name again", () => {
    const config = { ...defaultConfig(), sourcePrefs: { [key]: { displayName: "Headset" } } };
    expect(withSourcePref(config, key, { displayName: undefined }).sourcePrefs?.[key]).toEqual({});
    expect(withSourcePref(config, key, { displayName: "" }).sourcePrefs?.[key]).toEqual({});
  });
});
