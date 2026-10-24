import { describe, expect, it } from "vitest";
import { parseDisplayItemsXml } from "@/lib/infopanel/parse.ts";
import { bindingFromRef, bindingRef, buildCatalog, isBound, mapBinding, pluginKey, toReading, withBinding, type BoundItem } from "@/lib/infopanel/sensors.ts";

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

describe("bindingFromRef (the Data API ref back to InfoPanel's binding)", () => {
  it.each([
    ["libre:/intelcpu/0/load/0", { SensorType: "Libre", LibreSensorId: "/intelcpu/0/load/0" }],
    ["libre:/gpu-nvidia/0/load/3/GPU Memory", { SensorType: "Libre", LibreSensorId: "/gpu-nvidia/0/load/3/GPU Memory" }],
    ["plugin:/InfoPanel.RTSS/rtss/1% low fps", { SensorType: "Plugin", PluginSensorId: "/InfoPanel.RTSS/rtss/1% low fps" }],
    // An ephemeral container: "/{pluginId}/{entryId}"; dots stay inside the id.
    ["plugin:/InfoPanel.Spotify/title", { SensorType: "Plugin", PluginSensorId: "/InfoPanel.Spotify/title" }],
    ["hwinfo:-1/4026531840/0/16777216", { SensorType: "HwInfo", HwInfoRemoteIndex: -1, Id: 4026531840, Instance: 0, EntryId: 16777216 }],
    ["hwinfo:2/4026531840/1/4294967295", { SensorType: "HwInfo", HwInfoRemoteIndex: 2, Id: 4026531840, Instance: 1, EntryId: 4294967295 }],
  ])("%s", (ref, binding) => {
    expect(bindingFromRef(ref)).toEqual(binding);
  });

  it.each([
    "",
    "libre:",
    "libre:intelcpu/0",
    "plugin:",
    "plugin:/",
    "plugins.InfoPanel.RTSS.rtss.fps",
    "hwinfo:-1/1/2",
    "hwinfo:-1/1/2/3/4",
    "hwinfo:-2/1/2/3",
    "hwinfo:x/1/2/3",
    "hwinfo:-1/4294967296/0/0",
    "hwinfo:-1/-1/0/0",
    "hwinfo:-1/1.5/0/0",
    "system:cpu",
  ])("is null for %j", (ref) => {
    expect(bindingFromRef(ref)).toBeNull();
  });

  it("round-trips through bindingRef on every bound kind that holds it", () => {
    for (const ref of ["libre:/amdcpu/0/temperature/2", "plugin:/p/c/e", "plugin:/p/e", "hwinfo:-1/7/0/9", "hwinfo:0/7/1/9"]) {
      const binding = bindingFromRef(ref)!;
      for (const kind of ["Sensor", "Bar", "Graph", "Donut", "Gauge", "SensorImage", "HttpImage"]) {
        const item = withBinding(bound(kind), binding, "CPU")!;
        expect(bindingRef(item)).toBe(ref);
        expect(item.SensorName).toBe("CPU");
      }
    }
  });

  it("binds a table to plugins only", () => {
    expect(withBinding(bound("TableSensor"), bindingFromRef("libre:/a/0/load/0")!, "x")).toBeNull();
    expect(bindingRef(withBinding(bound("TableSensor"), bindingFromRef("plugin:/p/c/t")!, "x")!)).toBe("plugin:/p/c/t");
  });
});
