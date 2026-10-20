import { describe, expect, it } from "vitest";
import { parseDisplayItemsXml } from "@/lib/infopanel/parse.ts";
import { bindingRef, buildCatalog, isBound, mapBinding, pluginKey, toReading, type BoundItem } from "@/lib/infopanel/sensors.ts";

function bound(kind: string, fields: Record<string, string | number> = {}): BoundItem {
  const xml = Object.entries(fields)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join("");
  const { items } = parseDisplayItemsXml(
    `<ArrayOfDisplayItem xmlns:xsi="x"><DisplayItem xsi:type="${kind}DisplayItem">${xml}</DisplayItem></ArrayOfDisplayItem>`,
  );
  if (!isBound(items[0])) throw new Error(`${kind} is not bound`);
  return items[0];
}

const catalog = buildCatalog({
  "libre.gpu_core": { value: 50, unit: "%", name: "GPU Core", ref: "libre:/gpu-nvidia/0/load/0" },
  "plugins.InfoPanel.RTSS.rtss.1% low fps": { value: 120, unit: "FPS", ref: "plugin:/InfoPanel.RTSS/rtss/1% low fps" },
  "plugins.spotify-plugin.spotify.artist": { text: "Queen" },
  "hwinfo.cpu_package": { value: 60, unit: "°C", name: "CPU Package", ref: "hwinfo:-1/240/0/16777216" },
  "hwinfo.cpu_package_2": { value: 61, unit: "°C", name: "CPU Package" },
  "hwinfo.r0_gpu_hot_spot": { value: 70, unit: "°C", name: "Remote 0: GPU Hot Spot" },
  "system.cpu": { value: 12, unit: "%" },
});

describe("bindingRef", () => {
  it("writes each sensor type the way the Data API's ref does", () => {
    expect(bindingRef(bound("Sensor", { SensorType: "Libre", LibreSensorId: "/gpu-nvidia/0/load/0" }))).toBe("libre:/gpu-nvidia/0/load/0");
    expect(bindingRef(bound("Bar", { SensorType: "Plugin", PluginSensorId: "/a/b/c" }))).toBe("plugin:/a/b/c");
    expect(bindingRef(bound("Gauge", { SensorType: "HwInfo", HwInfoRemoteIndex: 1, Id: 2, Instance: 3, EntryId: 4 }))).toBe("hwinfo:1/2/3/4");
    expect(bindingRef(bound("TableSensor", { PluginSensorId: "/t/x" }))).toBe("plugin:/t/x");
  });

  it("is null when the item names no sensor", () => {
    expect(bindingRef(bound("Sensor", { SensorType: "Libre" }))).toBeNull();
    expect(bindingRef(bound("Sensor", { SensorType: "Plugin" }))).toBeNull();
  });
});

describe("mapBinding", () => {
  it("prefers the exact ref", () => {
    expect(mapBinding(bound("Sensor", { SensorType: "Libre", LibreSensorId: "/gpu-nvidia/0/load/0" }), catalog)).toEqual({
      key: "libre.gpu_core",
      via: "ref",
    });
    expect(mapBinding(bound("Graph", { SensorType: "HwInfo", Id: 240, Instance: 0, EntryId: 16777216, SensorName: "Other" }), catalog)).toEqual({
      key: "hwinfo.cpu_package",
      via: "ref",
    });
  });

  it("derives the plugin key without a ref, ignoring case", () => {
    expect(pluginKey("/spotify-plugin/spotify/artist")).toBe("plugins.spotify-plugin.spotify.artist");
    expect(mapBinding(bound("Sensor", { SensorType: "Plugin", PluginSensorId: "/Spotify-Plugin/spotify/artist" }), catalog)).toEqual({
      key: "plugins.spotify-plugin.spotify.artist",
      via: "plugin-key",
    });
  });

  it("falls back to the first HWiNFO reading with the same name, per remote", () => {
    expect(mapBinding(bound("Sensor", { SensorType: "HwInfo", Id: 9, SensorName: " CPU  Package" }), catalog)).toEqual({
      key: "hwinfo.cpu_package",
      via: "name",
    });
    expect(mapBinding(bound("Sensor", { SensorType: "HwInfo", HwInfoRemoteIndex: 0, Id: 9, SensorName: "GPU Hot Spot" }), catalog)).toEqual({
      key: "hwinfo.r0_gpu_hot_spot",
      via: "name",
    });
  });

  it("leaves Libre without a ref match unmapped", () => {
    expect(mapBinding(bound("Sensor", { SensorType: "Libre", LibreSensorId: "/amdcpu/0/load/0", SensorName: "GPU Core" }), catalog)).toBeNull();
  });
});

describe("toReading", () => {
  it("fills missing numbers with 0, like InfoPanel's readers", () => {
    expect(toReading({ value: 50, unit: "%" })).toEqual({ now: 50, min: 0, max: 0, avg: 0, unit: "%" });
    expect(toReading({ value: 5, unit: "W", min: 1, max: 9, avg: 4 })).toEqual({ now: 5, min: 1, max: 9, avg: 4, unit: "W" });
  });

  it("keeps a table's first row as its text", () => {
    expect(toReading({ text: "a, 1\nb, 2" })).toEqual({ now: 0, min: 0, max: 0, avg: 0, unit: "", text: "a, 1" });
  });

  it("is null for a missing key", () => {
    expect(toReading(undefined)).toBeNull();
  });
});
