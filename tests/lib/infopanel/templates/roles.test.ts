import { describe, expect, it } from "vitest";
import type { DataApiValue } from "@/lib/infopanel/sensors.ts";
import { ROLES, resolveRole, resolveRoles, type Role } from "@/lib/infopanel/templates/roles.ts";
import { MOCK_SENSORS } from "@/lib/infopanel/templates/mock.ts";
import capture from "../__fixtures__/hwinfo-capture.json";

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
    // The clock plugin's seconds, by ref, or by name when the Data API reports no refs (the dot arrives mangled).
    ["clock.second", { "plugins.clock-plugin.clock.minute": v("Clock · Minute", "", "plugin:/clock-plugin/clock/minute"), "plugins.clock-plugin.clock.second": v("Clock · Second", "", "plugin:/clock-plugin/clock/second") }, "plugins.clock-plugin.clock.second"],
    // RTSS through InfoPanel's plugin, by ref and (no refs) by name; the other frame readings are not mistaken for fps.
    ["fps", { "p.low": v("RTSS · 1% Low FPS", "FPS", "plugin:/InfoPanel.RTSS/rtss/1% low fps"), "p.fps": v("RTSS · Frames Per Second", "FPS", "plugin:/InfoPanel.RTSS/rtss/fps") }, "p.fps"],
    ["fps", { "p.max": v("RTSS · Max FPS", "FPS"), "p.fps": v("RTSS · Frames Per Second", "FPS") }, "p.fps"],
    ["fps.low1", { "p.fps": v("RTSS · Frames Per Second", "FPS", "plugin:/InfoPanel.RTSS/rtss/fps"), "p.low": v("RTSS · 1% Low FPS", "FPS", "plugin:/InfoPanel.RTSS/rtss/1% low fps") }, "p.low"],
    ["fps.low01", { "p.low1": v("RTSS · 1% Low FPS", "FPS", "plugin:/InfoPanel.RTSS/rtss/1% low fps"), "p.low": v("RTSS · 0.1% Low FPS", "FPS", "plugin:/InfoPanel.RTSS/rtss/0.1% low fps") }, "p.low"],
    ["frametime", { "p.ft": v("RTSS · Current Frame Time", "ms", "plugin:/InfoPanel.RTSS/rtss/current frame time"), "p.fps": v("RTSS · Frames Per Second", "FPS") }, "p.ft"],
    ["vram.used", { "l.free": v("NVIDIA GPU Memory Free", "", "libre:/gpu-nvidia/0/smalldata/0"), "l.used": v("NVIDIA GPU Memory Used", "", "libre:/gpu-nvidia/0/smalldata/1"), "l.d3d": v("NVIDIA D3D Dedicated Memory Used", "", "libre:/gpu-nvidia/0/smalldata/3") }, "l.used"],
    ["vram.total", { "l.used": v("NVIDIA GPU Memory Used", "", "libre:/gpu-nvidia/0/smalldata/1"), "l.total": v("NVIDIA GPU Memory Total", "", "libre:/gpu-nvidia/0/smalldata/2") }, "l.total"],
    ["vram.temp", { "l.core": v("NVIDIA GPU Core", "°C", "libre:/gpu-nvidia/0/temperature/0"), "l.mem": v("NVIDIA GPU Memory Junction", "°C", "libre:/gpu-nvidia/0/temperature/3") }, "l.mem"],
    ["gpu.memclock", { "l.core": v("NVIDIA GPU Core", "MHz", "libre:/gpu-nvidia/0/clock/0"), "l.mem": v("NVIDIA GPU Memory", "MHz", "libre:/gpu-nvidia/0/clock/4") }, "l.mem"],
    ["gpu.hotspot", { "l.core": v("NVIDIA GPU Core", "°C", "libre:/gpu-nvidia/0/temperature/0"), "l.hot": v("NVIDIA GPU Hot Spot", "°C", "libre:/gpu-nvidia/0/temperature/2") }, "l.hot"],
    ["gpu.hotspot", { "h.hot": v("GPU Hot Spot Temperature", "°C") }, "h.hot"],
    ["gpu.fan", { "l.ctl": v("NVIDIA GPU Fan 1", "%", "libre:/gpu-nvidia/0/control/1"), "l.fan": v("NVIDIA GPU Fan 1", "RPM", "libre:/gpu-nvidia/0/fan/1") }, "l.fan"],
    ["gpu.volt", { "l.v": v("NVIDIA GPU Core Voltage", "V", "libre:/gpu-nvidia/0/voltage/0"), "l.cpu": v("AMD Core #1 VID", "V", "libre:/amdcpu/0/voltage/2") }, "l.v"],
    ["ram.total", { "h.t": v("Physical Memory Total", "GB"), "h.u": v("Physical Memory Used", "GB") }, "h.t"],
    ["ram.free", { "l.v": v("Virtual Memory Memory Available", "GB", "libre:/vram/data/3"), "l.a": v("Total Memory Memory Available", "GB", "libre:/ram/data/1") }, "l.a"],
    ["disk.free", { "l.used": v("SSD Used Space", "%", "libre:/nvme/2/load/52"), "l.free": v("SSD Free Space", "GB", "libre:/nvme/2/data/3") }, "l.free"],
    ["cpu.maxcore", { "l.t": v("AMD CPU Total", "%", "libre:/amdcpu/0/load/0"), "l.m": v("AMD CPU Core Max", "%", "libre:/amdcpu/0/load/1") }, "l.m"],
    ["cpu.ccd1", { "l.2": v("AMD CCD2 (Tdie)", "°C", "libre:/amdcpu/0/temperature/4"), "l.1": v("AMD CCD1 (Tdie)", "°C", "libre:/amdcpu/0/temperature/3") }, "l.1"],
    ["cpu.ccd2", { "l.1": v("AMD CCD1 (Tdie)", "°C", "libre:/amdcpu/0/temperature/3"), "l.2": v("AMD CCD2 (Tdie)", "°C", "libre:/amdcpu/0/temperature/4") }, "l.2"],
    ["psu.12v", { "h.5": v("+5V", "V"), "h.12": v("+12V", "V") }, "h.12"],
    ["ups.power", { "p.load": v("UPS Battery", "%"), "p.w": v("UPS Power", "W") }, "p.w"],
    ["ram.speed", { "m.t": v("Memory Timings", "ns"), "m.c": v("Memory Clock", "MHz") }, "m.c"],
    ["board.vrm", { "l.cpu": v("ASUS EC CPU", "°C"), "l.vrm": v("ASUS EC VRM", "°C"), "l.gpu": v("NVIDIA GPU VRM", "W") }, "l.vrm"],
    ["board.vrm", { "h.mos": v("MOS", "°C") }, "h.mos"],
    ["cpu.fan", { "l.gpu": v("NVIDIA GPU Fan 1", "RPM"), "l.cpu": v("ASUS EC CPU Optional", "RPM") }, "l.cpu"],
    ["cpu.fan", { "h.t": v("CPU", "°C"), "h.f": v("CPU_OPT Fan", "RPM") }, "h.f"],
    // with integrated graphics beside a card, the card's reading
    ["gpu.temp", { "l.igpu": v("AMD Radeon(TM) Graphics GPU Core", "°C", "libre:/gpu-amd/0/temperature/0"), "l.card": v("NVIDIA GeForce RTX 4080 GPU Core", "°C", "libre:/gpu-nvidia/0/temperature/0") }, "l.card"],
    ["clock.second", { "plugins.c.minute": v("Clock \uFFFD Minute", ""), "plugins.c.second": v("Clock \uFFFD Second", "") }, "plugins.c.second"],
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

// A trimmed real capture of one PC with HWiNFO running (AMD CPU, NVIDIA GPU, five drives). HWiNFO reports its
// temperatures as "Â°C" (the degree sign's first byte doubled).
describe("roles against a real HWiNFO capture", () => {
  const all = capture as Record<string, DataApiValue>;
  const hwinfoOnly = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith("hwinfo.")));

  it.each<[Role, string]>([
    // HWiNFO has what LibreHardwareMonitor lacks
    ["gpu.hotspot", "hwinfo.gpu_hot_spot_temperature"],
    ["ram.speed", "hwinfo.memory_clock"],
    ["psu.12v", "hwinfo.12v"],
    // LibreHardwareMonitor first where it has the reading
    ["cpu.load", "libre.amd_ryzen_9_9950x3d_cpu_total"],
    ["gpu.memclock", "libre.nvidia_geforce_rtx_5090_gpu_memory_clock"],
  ])("%s finds %s on the whole machine", (role, key) => {
    expect(resolveRole(role, all)?.key).toBe(key);
  });

  it.each<[Role, string]>([
    ["cpu.temp", "hwinfo.cpu__tctl_tdie"],
    ["cpu.ccd1", "hwinfo.cpu_ccd1__tdie"],
    ["cpu.ccd2", "hwinfo.cpu_ccd2__tdie"],
    ["gpu.temp", "hwinfo.gpu_temperature"],
    ["gpu.fan", "hwinfo.gpu_fan1"],
    ["vram.temp", "hwinfo.gpu_memory_junction_temperature"],
    ["gpu.hotspot", "hwinfo.gpu_hot_spot_temperature"],
    ["gpu.memclock", "hwinfo.gpu_memory_clock"],
    ["ram.speed", "hwinfo.memory_clock"],
    ["fps", "hwinfo.framerate"],
    ["disk.temp", "hwinfo.drive_temperature"],
  ])("%s finds %s from HWiNFO alone", (role, key) => {
    expect(resolveRole(role, hwinfoOnly)?.key).toBe(key);
  });

  it("reads the doubled degree sign as °C, and picks the DRAM clock over the GPU's and the ratio", () => {
    expect(resolveRole("gpu.hotspot", hwinfoOnly)).toMatchObject({ unit: "°C", ref: "hwinfo:-1/3758104576/0/16777221" });
    expect(resolveRole("ram.speed", hwinfoOnly)?.ref).toBe("hwinfo:-1/4026532609/1/100663296");
  });

  it("leaves a role this PC has no sensor for unbound", () => {
    expect(resolveRole("ups.power", all)).toBeUndefined();
    expect(resolveRole("ram.total", all)).toBeUndefined();
  });
});
