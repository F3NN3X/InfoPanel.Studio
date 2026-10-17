import { describe, expect, it } from "vitest";
import { parseDisplayItemsXml } from "../parse.ts";
import { buildCatalog } from "../sensors.ts";
import { groupBindings, indexCatalog, needsAttention, resolveAll, resolveGroup, search, statusOf, suggest } from "./remap.ts";

const item = (type: string, fields: Record<string, string | number> = {}) =>
  `<DisplayItem xsi:type="${type}DisplayItem">${Object.entries(fields)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join("")}</DisplayItem>`;
const parse = (body: string) =>
  parseDisplayItemsXml('<ArrayOfDisplayItem xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + body + "</ArrayOfDisplayItem>").items;
const libre = (name: string, id: string) => ({ SensorType: "Libre", SensorName: name, LibreSensorId: id });
const plugin = (name: string, id: string) => ({ SensorType: "Plugin", SensorName: name, PluginSensorId: id });

// Shaped like the live Data API: Libre names are "<hardware> <sensor>".
const index = indexCatalog(
  buildCatalog({
    "libre.rtx_gpu_core": { value: 34, unit: "°C", name: "NVIDIA GeForce RTX 5090 GPU Core", ref: "libre:/gpu-nvidia/0/temperature/0" },
    "libre.rtx_gpu_core_load": { value: 14, unit: "%", name: "NVIDIA GeForce RTX 5090 GPU Core", ref: "libre:/gpu-nvidia/0/load/0" },
    "libre.rtx_gpu_hot_spot": { value: 40, unit: "°C", name: "NVIDIA GeForce RTX 5090 GPU Hot Spot", ref: "libre:/gpu-nvidia/0/temperature/2" },
    "libre.ryzen_cpu_total": { value: 19, unit: "%", name: "AMD Ryzen 9 9950X3D CPU Total", ref: "libre:/amdcpu/0/load/0" },
    "libre.nct_fan_1": { value: 900, unit: "RPM", name: "Nuvoton NCT6701D Fan #1", ref: "libre:/lpc/nct6701d/0/fan/0" },
    "libre.nct_fan_2": { value: 1200, unit: "RPM", name: "Nuvoton NCT6701D Fan #2", ref: "libre:/lpc/nct6701d/0/fan/1" },
    "plugins.network-info-plugin.{b}.ipv4-0": { text: "10.0.0.2", name: "Ethernet · IPv4", ref: "plugin:/network-info-plugin/{B}/ipv4-0" },
    "plugins.fps-plugin.fps.fps": { value: 144, unit: "FPS", ref: "plugin:/fps-plugin/fps/fps" },
  }),
);

describe("groupBindings", () => {
  it("groups items reading the same sensor, nested ones included, with tree paths", () => {
    const items = parse(
      item("Sensor", libre("GPU Core", "/gpu-amd/2/temperature/0")) +
        item("Group", {}).replace("</DisplayItem>", "<DisplayItems>" + item("Bar", libre("GPU Core", "/gpu-amd/2/temperature/0")) + "</DisplayItems></DisplayItem>") +
        item("Sensor", libre("GPU Core", "/gpu-amd/2/load/0")) +
        item("Text"),
    );
    const groups = groupBindings(items);
    expect(groups.map((g) => [g.ref, g.paths])).toEqual([
      ["libre:/gpu-amd/2/temperature/0", ["0", "1.0"]],
      ["libre:/gpu-amd/2/load/0", ["2"]],
    ]);
  });

  it("keeps HWiNFO items with different names apart even without ids", () => {
    const items = parse(item("Sensor", { SensorType: "HwInfo", SensorName: "A" }) + item("Sensor", { SensorType: "HwInfo", SensorName: "B" }));
    expect(groupBindings(items)).toHaveLength(2);
  });
});

describe("suggest", () => {
  const [gpuTemp, gpuLoad, fan, ipv4, cpuTotal] = groupBindings(
    parse(
      item("Sensor", libre("GPU Core", "/gpu-amd/2/temperature/0")) +
        item("Sensor", libre("GPU Core", "/gpu-amd/2/load/0")) +
        item("Sensor", libre("CPU Fan", "/lpc/nct6687dr/0/fan/0")) +
        item("Sensor", plugin("IPv4 Address", "/network-info-plugin/{25B4}/ipv4-0")) +
        item("Sensor", libre("CPU Total", "/intelcpu/0/load/0")),
    ),
  );

  it("only offers Libre readings of the same type, same hardware family and name first", () => {
    const s = suggest(gpuTemp, index);
    expect(s[0]).toMatchObject({ key: "libre.rtx_gpu_core", strong: true });
    expect(s.map((c) => c.key)).not.toContain("libre.rtx_gpu_core_load");
    expect(suggest(gpuLoad, index)[0]).toMatchObject({ key: "libre.rtx_gpu_core_load", strong: true });
    // An Intel CPU's load maps to an AMD CPU's: same family, same type, same name.
    expect(suggest(cpuTotal, index)[0]).toMatchObject({ key: "libre.ryzen_cpu_total", strong: true });
  });

  it("is weak when several candidates fit equally", () => {
    const s = suggest(fan, index);
    expect(s.map((c) => c.key).slice(0, 2)).toEqual(["libre.nct_fan_1", "libre.nct_fan_2"]);
    expect(s.every((c) => !c.strong)).toBe(true);
  });

  it("matches a plugin reading across instances (another network adapter)", () => {
    expect(suggest(ipv4, index)[0]).toMatchObject({ key: "plugins.network-info-plugin.{b}.ipv4-0", strong: true });
  });
});

describe("resolve", () => {
  const groups = groupBindings(
    parse(
      item("Sensor", libre("GPU Core", "/gpu-nvidia/0/temperature/0")) +
        item("Sensor", libre("GPU Core", "/gpu-amd/2/temperature/0")) +
        item("Sensor", libre("CPU Fan", "/lpc/nct6687dr/0/fan/0")),
    ),
  );
  const [exact, other, fan] = groups;

  it("prefers the user's choice, then the exact ref, then a unique strong suggestion", () => {
    const none = new Map<string, string>();
    expect(resolveGroup(exact, index, none)).toEqual({ key: "libre.rtx_gpu_core", via: "ref" });
    expect(resolveGroup(other, index, none)).toEqual({ key: "libre.rtx_gpu_core", via: "suggested" });
    expect(resolveGroup(fan, index, none)).toBeNull();
    const chosen = new Map([[fan.id, "libre.nct_fan_2"], [other.id, ""]]);
    expect(resolveGroup(fan, index, chosen)).toEqual({ key: "libre.nct_fan_2", via: "chosen" });
    expect(resolveGroup(other, index, chosen)).toBeNull();
  });

  it("reports which groups still need a look", () => {
    const overrides = new Map([[exact.id, ""]]);
    const resolved = resolveAll(groups, index, overrides);
    const statuses = groups.map((g) => statusOf(g, resolved.get(g.id) ?? null, overrides));
    expect(statuses).toEqual(["unbound", "suggested", "unresolved"]);
    expect(statuses.map(needsAttention)).toEqual([false, true, true]);
  });
});

describe("search", () => {
  it("needs every word, in the key, name or ref", () => {
    expect(search(index, "gpu temperature/2")).toEqual(["libre.rtx_gpu_hot_spot"]);
    expect(search(index, "FAN nuvoton")).toEqual(["libre.nct_fan_1", "libre.nct_fan_2"]);
    expect(search(index, "nothing like this")).toEqual([]);
  });

  it("puts what suits the group first", () => {
    const [load] = groupBindings(parse(item("Sensor", libre("GPU Core", "/gpu-amd/0/load/0"))));
    expect(search(index, "gpu core")).toEqual(["libre.rtx_gpu_core", "libre.rtx_gpu_core_load"]);
    expect(search(index, "gpu core", 50, load)).toEqual(["libre.rtx_gpu_core_load", "libre.rtx_gpu_core"]);
  });
});
