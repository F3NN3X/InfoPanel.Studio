import { describe, expect, it } from "vitest";
import { AUTO_RULES, autoDevice, deviceOptions, deviceReading } from "./device-options";
import type { SensorMap } from "@/modules/types";

const t = (text: string) => ({ text, unit: "" });
const sensors: SensorMap = {
  "libre.amd_ryzen_9_9950x3d_cpu_total": { value: 3, unit: "%" },
  "libre.nvidia_rtx_4090_gpu_core_load": { value: 5, unit: "%" },
  "libre.samsung_ssd_980_power_on_hours": { value: 5, unit: "h" },
  "libre.samsung_ssd_980__2_power_on_hours": { value: 5, unit: "h" },
  "libre.samsung_ssd_980__2_volumes": t("D: Games"),
  "libre.ethernet_download_speed": { value: 5, unit: "KB/s" },
  "plugins.audio-level-meter.default-audio.device-name": t("Speakers (Realtek)"),
  "plugins.audio-level-meter.dev-1.device-name": t("Headset (USB)"),
  "plugins.drive-info-plugin.c.name": t("C:\\"),
  "plugins.drive-info-plugin.d.name": t("D:\\"),
};

describe("deviceOptions", () => {
  it("puts Auto first and lists the detected hardware", () => {
    expect(deviceOptions("cpu", sensors)).toEqual([
      { value: "", label: "Auto" },
      { value: "amd_ryzen_9_9950x3d", label: "AMD Ryzen 9 9950X3D" },
    ]);
    expect(deviceOptions("gpu", sensors).map((o) => o.value)).toEqual(["", "nvidia_rtx_4090"]);
    expect(deviceOptions("disk", sensors).map((o) => o.value)).toEqual(["", "samsung_ssd_980", "samsung_ssd_980__2"]);
    expect(deviceOptions("disk", sensors).map((o) => o.label)).toEqual(["Auto", "Samsung SSD 980", "D: Games · Samsung SSD 980 #2"]);
    expect(deviceOptions("adapter", sensors).map((o) => o.value)).toEqual(["", "ethernet"]);
  });

  it("labels audio devices and drives by their sensor names", () => {
    expect(deviceOptions("audio", sensors)).toEqual([
      { value: "", label: "Auto" },
      { value: "default-audio", label: "Default device" },
      { value: "dev-1", label: "Headset" },
    ]);
    expect(deviceOptions("drive", sensors)).toEqual([
      { value: "", label: "Auto" },
      { value: "c", label: "C:\\" },
      { value: "d", label: "D:\\" },
    ]);
  });

  it("is just Auto with no live keys", () => {
    expect(deviceOptions("cpu", {})).toEqual([{ value: "", label: "Auto" }]);
  });
});

describe("Auto (SPEC §4.5)", () => {
  const live: SensorMap = {
    ...sensors,
    "libre.wifi_download_speed": { value: 900, unit: "KB/s" },
    "libre.wifi_upload_speed": { value: 100, unit: "KB/s" },
    "plugins.audio-level-meter.default-audio.audio-level": { value: 10, unit: "%" },
    "plugins.audio-level-meter.dev-1.audio-level": { value: 60, unit: "%" },
  };

  it("states its rule per kind", () => {
    expect(AUTO_RULES.adapter).toBe("Busiest adapter");
    expect(AUTO_RULES.audio).toBe("Loudest live device");
    expect(AUTO_RULES.cpu).toBe("First detected processor");
  });

  it("picks the busiest adapter, the loudest audio device, else the first", () => {
    expect(autoDevice("adapter", live)).toBe("wifi");
    expect(autoDevice("audio", live)).toBe("dev-1");
    expect(autoDevice("cpu", live)).toBe("amd_ryzen_9_9950x3d");
    expect(autoDevice("gpu", {})).toBeUndefined();
  });

  it("reads each device's live value", () => {
    expect(deviceReading("cpu", "amd_ryzen_9_9950x3d", live)).toBe("3 %");
    expect(deviceReading("audio", "dev-1", live)).toBe("60 %");
    expect(deviceReading("gpu", "missing", live)).toBeUndefined();
  });
});
