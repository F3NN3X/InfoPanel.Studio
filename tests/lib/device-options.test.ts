import { describe, expect, it } from "vitest";
import { autoDevice, deviceOptions } from "@/lib/device-options";
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

  it("tags each audio device with its flow, a device without data-flow being an output", () => {
    const withInput = { ...sensors, "plugins.audio-level-meter.mic-1.device-name": t("Microphone (USB)"), "plugins.audio-level-meter.mic-1.data-flow": t("input") };
    expect(deviceOptions("audio", withInput).filter((o) => o.value).map((o) => [o.value, o.flow])).toEqual([
      ["default-audio", "output"],
      ["dev-1", "output"],
      ["mic-1", "input"],
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

  it("picks the busiest adapter, the default audio device, else the first", () => {
    expect(autoDevice("adapter", live)).toBe("wifi");
    expect(autoDevice("audio", live)).toBe("default-audio");
    expect(autoDevice("cpu", live)).toBe("amd_ryzen_9_9950x3d");
    expect(autoDevice("gpu", {})).toBeUndefined();
  });

  it("follows the Show filter for audio, as Audio Meter meters it", () => {
    const mic = (id: string): SensorMap => ({
      [`plugins.audio-level-meter.${id}.device-name`]: t("Microphone (USB)"),
      [`plugins.audio-level-meter.${id}.data-flow`]: { value: 0, unit: "", text: "input" },
    });
    expect(autoDevice("audio", { ...live, ...mic("mic-1"), ...mic("default-input") }, "input")).toBe("default-input");
    // no default container in the filter: the first device it shows
    expect(autoDevice("audio", { ...live, ...mic("mic-1") }, "input")).toBe("mic-1");
    expect(autoDevice("audio", live, "output")).toBe("default-audio");
    expect(autoDevice("audio", live, "input")).toBeUndefined();
  });

});
