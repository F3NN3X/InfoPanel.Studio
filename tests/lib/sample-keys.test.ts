import { describe, expect, it } from "vitest";
import { newPanel, type Widget } from "@/lib/layout";
import { onThisPc, retargetPanel } from "@/lib/sample-keys";
import type { SensorMap } from "@/modules/types";

const s = (value: number, unit: string, name = "") => ({ value, unit, name });
const I = "libre.intel_core_i9_14900k";

// An Intel PC with an AMD GPU, a "Wi-Fi" adapter and a Yr place of its own
const intel: SensorMap = {
  [`${I}_cpu_total`]: s(20, "%"),
  [`${I}_cpu_package`]: s(71, "°C"),
  [`${I}_cpu_package_power`]: s(120, "W"),
  [`${I}_bus_speed`]: s(100, "MHz"),
  "libre.amd_radeon_rx_7900_xtx_gpu_core_load": s(50, "%"),
  "libre.amd_radeon_rx_7900_xtx_gpu_fan_1": s(1200, "RPM"),
  "libre.wi_fi_download_speed": s(9000, "KB/s"),
  "libre.wi_fi_upload_speed": s(100, "KB/s"),
  "libre.wi_fi_data_uploaded": s(2, "GB"),
  "plugins.yr-weather-plugin.oslo.weather": { text: "Rain", unit: "" },
};

describe("onThisPc", () => {
  it("points the sample CPU's readings at this CPU, by role where the vendors' keys differ", () => {
    expect(onThisPc("libre.amd_ryzen_9_9950x3d_package", intel)).toBe(`${I}_cpu_package_power`);
    expect(onThisPc("libre.amd_ryzen_9_9950x3d_ccd1__tdie", intel)).toBe(`${I}_cpu_package`);
    expect(onThisPc("libre.amd_ryzen_9_9950x3d_bus_speed", intel)).toBe(`${I}_bus_speed`);
  });

  it("points the sample GPU, adapter and weather place at this PC's", () => {
    expect(onThisPc("libre.nvidia_geforce_rtx_5090_gpu_fan_1", intel)).toBe("libre.amd_radeon_rx_7900_xtx_gpu_fan_1");
    expect(onThisPc("libre.ethernet_data_uploaded", intel)).toBe("libre.wi_fi_data_uploaded");
    expect(onThisPc("plugins.yr-weather-plugin.place.weather", intel)).toBe("plugins.yr-weather-plugin.oslo.weather");
  });

  it("keeps a key this PC has, and one it has no match for", () => {
    expect(onThisPc("system.cpu.load", intel)).toBe("system.cpu.load");
    expect(onThisPc("libre.nvidia_geforce_rtx_5090_d3d_3d", intel)).toBe("libre.nvidia_geforce_rtx_5090_d3d_3d");
    expect(onThisPc("libre.amd_ryzen_9_9950x3d_package", {})).toBe("libre.amd_ryzen_9_9950x3d_package");
  });

  it("uses HWiNFO's readings under their alias keys on a PC without LibreHardwareMonitor", () => {
    const hwinfo: SensorMap = { "hwinfo.total_cpu_usage": s(10, "%", "Total CPU Usage"), "hwinfo.cpu_package_power": s(90, "W", "CPU Package Power") };
    expect(onThisPc("libre.amd_ryzen_9_9950x3d_package", hwinfo)).toBe("libre.cpu_cpu_package_power");
  });
});

describe("retargetPanel", () => {
  it("moves every widget's key and leaves the panel itself unchanged", () => {
    const panel = { ...newPanel("CPU"), widgets: [{ id: "a", kind: "stat", visible: true, sensor: "libre.amd_ryzen_9_9950x3d_package" } as Widget, { id: "b", kind: "text", visible: true } as Widget] };
    const next = retargetPanel(panel, intel);
    expect(next.widgets.map((w) => w.sensor)).toEqual([`${I}_cpu_package_power`, undefined]);
    expect(panel.widgets[0].sensor).toBe("libre.amd_ryzen_9_9950x3d_package");
  });
});
