import { describe, expect, it } from "vitest";
import { aliasSource, isHwinfoDefaultName, slugOf, withHwinfoAliases } from "@/lib/hwinfo-aliases";
import { readAdapters, readSystem } from "@/lib/system-metrics";
import type { SensorMap } from "@/modules/types";
import { toFlat } from "@/widgets/data-adapter";
import { hw } from "@/widgets/core/data";
import capture from "./infopanel/__fixtures__/hwinfo-capture.json";

// A live Data API's HWiNFO readings (9950X3D, RTX 5090, four drives, three Wi-Fi adapters), as InfoPanel keys them; the
// capture's few LibreHardwareMonitor keys are left out, so it reads as a PC with HWiNFO only.
const hwinfo = Object.fromEntries(Object.entries(capture).filter(([k]) => k.startsWith("hwinfo."))) as unknown as SensorMap;
const s = (value: number, unit: string, name: string) => ({ value, unit, name });

describe("withHwinfoAliases", () => {
  const all = withHwinfoAliases(hwinfo);
  const r = readSystem(all);

  it("fills the CPU, GPU and memory readings from HWiNFO", () => {
    expect(r.cpu).toMatchObject({ name: "CPU", load: 18.83, temp: 61.25, power: 121.62, clock: 1194.97 });
    expect(r.gpu).toMatchObject({ name: "GPU", load: 12, temp: 35.96, power: 84.82, clock: 1717, memClock: 1750.13 });
    expect(r.ram.used).toBeCloseTo(44868 / 1024);
    expect(r.ram.total).toBeCloseTo((44868 + 20337) / 1024);
  });

  it("finds the drives and adapters by device, without serial numbers in their keys", () => {
    const flat = toFlat(all);
    expect(hw(flat).disks).toEqual(expect.arrayContaining(["drive", "kingston_sfyrd2000g", "kingston_sfyrd2000g__2", "kingston_sfyrd2000g__3", "wdc_wds100t2b0a_00sm50"]));
    expect(Object.keys(all).filter((k) => k.startsWith("libre.") && /50026b|210376/.test(k))).toEqual([]);
    // the C: drive's activity (Drive device) and its temperature (S.M.A.R.T. device) land on one id
    const c = hw(flat).disks.find((id) => flat[`libre.${id}_total_activity`] === "3.5 %");
    expect(flat[`libre.${c}_temperature`]).toBe("50 °C");
    expect(readAdapters(all).map((a) => a.id)).toEqual(expect.arrayContaining(["network", "wifi", "wifi_3", "wifi_4"]));
  });

  it("converts to LibreHardwareMonitor's units: KB/s rates to bytes, MB memory to GB", () => {
    expect(all["libre.network_download_speed"]).toMatchObject({ value: 12.31 * 1024, unit: "KB/s", name: "network Download Speed" });
    expect(all["libre.total_memory_memory_available"]).toMatchObject({ unit: "GB" });
    expect(all["libre.cpu_cpu_package"].unit).toBe("°C");
  });

  it("keeps the source's ref, and says which HWiNFO key an alias reads", () => {
    expect(all["libre.cpu_cpu_total"]).toMatchObject({ ref: (capture as Record<string, { ref: string }>)["hwinfo.total_cpu_usage"].ref });
    expect(aliasSource(all, "libre.cpu_cpu_package_power")).toBe("hwinfo.cpu_package_power");
    expect(aliasSource(all, "hwinfo.gpu_power")).toBe("hwinfo.gpu_power");
  });

  it("adds nothing for a device class LibreHardwareMonitor reports, and leaves remote readings alone", () => {
    const both = withHwinfoAliases({ ...hwinfo, "libre.intel_core_i9_14900k_cpu_total": s(20, "%", "Intel Core i9-14900K CPU Total") });
    expect(Object.keys(both).some((k) => k.startsWith("libre.cpu_"))).toBe(false);
    expect(Object.keys(both).some((k) => k.startsWith("libre.gpu_"))).toBe(true);
    const remote = { "hwinfo.r0_total_cpu_usage": s(50, "%", "Total CPU Usage") };
    expect(withHwinfoAliases(remote)).toBe(remote);
  });

  it("numbers HWiNFO's threads in core then thread order, and its per-core clocks and power", () => {
    const threads = withHwinfoAliases({
      "hwinfo.total_cpu_usage": s(30, "%", "Total CPU Usage"),
      "hwinfo.core_1_t0_usage": s(40, "%", "Core 1 T0 Usage"),
      "hwinfo.core_0_t1_usage": s(20, "%", "Core 0 T1 Usage"),
      "hwinfo.core_0_t0_usage": s(10, "%", "Core 0 T0 Usage"),
      "hwinfo.e_core_2_t0_usage": s(5, "%", "E-core 2 T0 Usage"),
      "hwinfo.core_0_clock__perf__1_2": s(5000, "MHz", "Core 0 Clock (perf #1/2)"),
      "hwinfo.core_0_power": s(9, "W", "Core 0 Power"),
    });
    expect(readSystem(threads).cpu.cores).toEqual([10, 20, 40, 5]);
    expect(threads["libre.cpu_cpu_core__1_clock"]).toMatchObject({ value: 5000 });
    expect(threads["libre.cpu_cpu_core__1_power"]).toMatchObject({ value: 9 });
  });

  it("reads the discrete card when HWiNFO lists integrated graphics too, and works out its memory total", () => {
    const two = withHwinfoAliases({
      "hwinfo.gpu_temperature": s(45, "°C", "GPU Temperature"),
      "hwinfo.gpu_temperature_dgpu___0___nvidia_geforce_rtx_5090": s(60, "°C", "GPU Temperature"),
      "hwinfo.gpu_memory_usage_dgpu___0___nvidia_geforce_rtx_5090": s(25, "%", "GPU Memory Usage"),
      "hwinfo.gpu_memory_allocated_dgpu___0___nvidia_geforce_rtx_5090": s(8192, "MB", "GPU Memory Allocated"),
    });
    expect(two["libre.gpu_gpu_core"]).toMatchObject({ value: 60 });
    expect(two["libre.gpu_gpu_memory_total"]).toMatchObject({ value: 32768, unit: "MB" });
    expect(readSystem(two).gpu.vram).toMatchObject({ used: 8, total: 32 });
  });

  it("adds the per-core VID, host reads and writes, and the board's VRM and CPU fan", () => {
    const more = withHwinfoAliases({
      "hwinfo.total_cpu_usage": s(30, "%", "Total CPU Usage"),
      "hwinfo.p_core_0_vid": s(1.2, "V", "P-core 0 VID"),
      "hwinfo.total_host_reads_s_m_a_r_t___samsung_ssd_990": s(1200, "GB", "Total Host Reads"),
      "hwinfo.vrm_mos": s(48, "°C", "VRM MOS"),
      "hwinfo.cpu_opt_fan": s(900, "RPM", "CPU_OPT Fan"),
    });
    expect(more["libre.cpu_cpu_core__1_voltage"]).toMatchObject({ value: 1.2 });
    expect(more["libre.samsung_ssd_990_data_read"]).toMatchObject({ value: 1200, unit: "GB" });
    expect(readSystem(more).board).toEqual({ vrm: 48, cpuFan: 900 });
  });

  it("leaves the board to LibreHardwareMonitor when it reports a VRM", () => {
    const both = withHwinfoAliases({ "libre.nct6798d_vrm_mos": s(40, "°C", "VRM MOS"), "hwinfo.vrm_mos": s(48, "°C", "VRM MOS") });
    expect(both["libre.board_vrm"]).toBeUndefined();
  });

  it("returns the same map when there is nothing to add, and memoises per map", () => {
    const libre = { "libre.x_cpu_total": s(5, "%", "X CPU Total") };
    expect(withHwinfoAliases(libre)).toBe(libre);
    expect(withHwinfoAliases(hwinfo)).toBe(all);
  });
});

describe("slugOf", () => {
  it("slugs as InfoPanel does: every other character as _, trimmed", () => {
    expect(slugOf("CPU (Tctl/Tdie)")).toBe("cpu__tctl_tdie");
    expect(slugOf("Framerate 0.1% Low")).toBe("framerate_0_1__low");
  });
});

describe("isHwinfoDefaultName", () => {
  it("knows HWiNFO's own names and not a user's", () => {
    for (const name of ["GPU Temperature", "P-core 3 T1 Usage", "E-core 8 Clock", "Drive Temperature 2", "CPU_OPT Fan", "Total Host Writes"])
      expect(isHwinfoDefaultName(name), name).toBe(true);
    for (const name of ["My GPU temp", "Alice's rig", "Office fan", "Alice's MOS rig", "Alice CPU", "Core 0 Clock Alice"])
      expect(isHwinfoDefaultName(name), name).toBe(false);
  });
});
