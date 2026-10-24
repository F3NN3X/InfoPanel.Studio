import { describe, expect, it } from "vitest";
import type { DataApiValue } from "@/lib/infopanel/sensors.ts";
import { ROLES, resolveRole, resolveRoles, type Role } from "@/lib/infopanel/templates/roles.ts";
import { MOCK_SENSORS } from "@/lib/infopanel/templates/mock.ts";

const v = (name: string, unit: string, ref?: string, value = 1): DataApiValue => ({ name, unit, value, ...(ref ? { ref } : {}) });

describe("the template sensor roles", () => {
  // Each row: a Data API with the right sensor among decoys, and the key the role must pick.
  it.each<[Role, Record<string, DataApiValue>, string]>([
    ["cpu.load", { "libre.core": v("Intel CPU Core #1", "%", "libre:/intelcpu/0/load/1"), "libre.total": v("Intel CPU Total", "%", "libre:/intelcpu/0/load/0") }, "libre.total"],
    ["cpu.load", { "libre.total": v("AMD Ryzen 9 CPU Total", "%"), "system.cpu.load": v("CPU Load", "%") }, "libre.total"],
    ["cpu.load", { "hwinfo.a": v("Total CPU Usage", "%") }, "hwinfo.a"],
    ["cpu.temp", { "libre.ccd": v("AMD CCD1 (Tdie)", "°C", "libre:/amdcpu/0/temperature/3"), "libre.tctl": v("AMD Core (Tctl/Tdie)", "°C", "libre:/amdcpu/0/temperature/2") }, "libre.tctl"],
    ["cpu.temp", { "libre.pkg": v("Intel CPU Package", "°C", "libre:/intelcpu/0/temperature/8") }, "libre.pkg"],
    ["cpu.temp", { "hwinfo.t": v("CPU Package Temp", "°C") }, "hwinfo.t"],
    ["cpu.clock", { "libre.bus": v("AMD Bus Speed", "MHz", "libre:/amdcpu/0/clock/0"), "libre.avg": v("AMD Cores (Average)", "MHz", "libre:/amdcpu/0/clock/1") }, "libre.avg"],
    ["cpu.power", { "libre.gpu": v("NVIDIA GPU Package", "W"), "libre.cpu": v("AMD Ryzen Package", "W") }, "libre.cpu"],
    ["gpu.load", { "libre.t": v("NVIDIA GPU Core", "°C", "libre:/gpu-nvidia/0/temperature/0"), "libre.l": v("NVIDIA GPU Core", "%", "libre:/gpu-nvidia/0/load/0") }, "libre.l"],
    ["gpu.temp", { "libre.t": v("NVIDIA GPU Core", "°C"), "libre.l": v("NVIDIA GPU Core", "%") }, "libre.t"],
    ["gpu.clock", { "libre.c": v("AMD Radeon GPU Core", "MHz", "libre:/gpu-amd/0/clock/0") }, "libre.c"],
    ["gpu.power", { "hwinfo.p": v("GPU Power", "W"), "libre.pct": v("NVIDIA GPU Power", "%") }, "hwinfo.p"],
    ["ram.load", { "libre.v": v("Virtual Memory Memory", "%"), "libre.r": v("Total Memory Memory", "%") }, "libre.r"],
    ["ram.used", { "libre.d3d": v("NVIDIA D3D Dedicated Memory Used", "GB"), "libre.u": v("Total Memory Memory Used", "GB") }, "libre.u"],
    ["disk.load", { "libre.b": v("Disk #2 Total Activity", "%", "libre:/nvme/3/load/53"), "libre.a": v("Disk Total Activity", "%", "libre:/nvme/2/load/53") }, "libre.a"],
    ["disk.temp", { "hwinfo.d": v("Drive Temperature", "°C") }, "hwinfo.d"],
    // The busiest real adapter; virtual ones never.
    ["net.down", { "libre.wifi": v("WiFi Download Speed", "KB/s", undefined, 10), "libre.eth": v("Ethernet Download Speed", "KB/s", undefined, 900), "libre.ts": v("Tailscale Download Speed", "KB/s", undefined, 5000) }, "libre.eth"],
    ["net.up", { "hwinfo.up": v("Current UP rate", "KB/s") }, "hwinfo.up"],
    ["uptime", { "plugins.u.h": v("Uptime · Hours", "", "plugin:/system-info-plugin/uptime/hours"), "plugins.u.f": v("Uptime · Formatted", "", "plugin:/system-info-plugin/uptime/formatted") }, "plugins.u.f"],
  ])("%s picks the right sensor (%#)", (role, sensors, key) => {
    expect(resolveRole(role, sensors)?.key).toBe(key);
  });

  it("prefers a sensor with a ref, and carries the ref so the binding exports", () => {
    const s = resolveRole("cpu.load", { "a.cpu": v("CPU Total", "%"), "b.cpu": v("CPU Total", "%", "libre:/intelcpu/0/load/0") });
    expect(s).toEqual({ key: "b.cpu", name: "CPU Total", unit: "%", ref: "libre:/intelcpu/0/load/0" });
  });

  it("finds nothing for a role the machine doesn't have", () => {
    expect(resolveRole("gpu.temp", { "libre.cpu": v("CPU Total", "%", "libre:/amdcpu/0/load/0") })).toBeUndefined();
    expect(resolveRoles({}).size).toBe(0);
  });

  it("resolves every role on the gallery's mock machine", () => {
    expect([...resolveRoles(MOCK_SENSORS).keys()]).toEqual([...ROLES]);
  });
});
