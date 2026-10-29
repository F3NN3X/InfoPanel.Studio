import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import type { SensorMap } from "@/modules/types";
import { renderModule } from "@/widgets/test-render";
import capture from "../lib/infopanel/__fixtures__/hwinfo-capture.json";

// A PC with HWiNFO and no LibreHardwareMonitor: the capture's HWiNFO readings only (9950X3D, RTX 5090).
const hwinfo = Object.fromEntries(Object.entries(capture).filter(([k]) => k.startsWith("hwinfo."))) as unknown as SensorMap;
const text = (id: string) => renderModule(modules.find((m) => m.id === id)!, {}, hwinfo).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("hardware widgets on HWiNFO only", () => {
  it.each([
    ["CpuMonitor", ["61°C", "121.6 W", "1.19 GHz", "Max core 55%"]],
    ["GpuMonitor", ["84.8 W", "1,717 MHz", "12 %"]],
    ["SystemOverview", ["CPU 19%", "GPU 12%", "43.8 / 63.7 GB"]],
    ["MemoryUsage", ["43.8 GB", "Available 19.9 GB"]],
    ["NetworkThroughput", ["Download 12.6 KB/s", "Upload 57.7 KB/s"]],
    ["PowerDraw", ["206 W", "CPU 122", "GPU 85"]],
    ["Thermals", ["CPU 61 °C"]],
    ["Vitals", ["CPU 19 %"]],
    ["KpiTiles", ["CPU 19 %"]],
    ["CoreHeatmap", ["19 %"]],
    ["DiskIO", ["Drive"]],
  ])("%s draws HWiNFO's readings", (id, shown) => {
    const out = text(id as string);
    for (const s of shown as string[]) expect(out, s).toContain(s);
  });
});

describe("hardware widgets on any hardware name", () => {
  const render = (id: string, sensors: SensorMap) => renderModule(modules.find((m) => m.id === id)!, {}, sensors);
  it("CPU Monitor draws a 12th-gen Intel CPU, whose key starts with its generation", () => {
    const I = "libre.12th_gen_intel_core_i7_12700k";
    expect(render("CpuMonitor", { [`${I}_cpu_total`]: { value: 30, unit: "%", name: "12th Gen Intel Core i7-12700K CPU Total" } })).toContain("30");
  });
  it("Network Traffic draws an adapter with Windows' default name, Wi-Fi", () => {
    expect(render("NetworkThroughput", { "libre.wi_fi_download_speed": { value: 2048, unit: "KB/s", name: "Wi-Fi Download Speed" } })).not.toBe("");
  });
});
