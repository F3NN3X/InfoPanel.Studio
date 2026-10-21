import { describe, expect, it } from "vitest";
import { normalizeAlerts } from "@/lib/alerts";
import { ALERT_PRESETS, blankNotificationRule, blankSensorRule, matchSensor, presetRule, type PresetPoint } from "@/lib/alert-presets";

const pt = (key: string, name: string, type: PresetPoint["type"] = "number"): PresetPoint => ({ key, name, type });

const CATALOGUE: PresetPoint[] = [
  pt("hardware.cpu.package-temp", "CPU Package Temp"),
  pt("hardware.cpu.total-load", "CPU Total Load"),
  pt("hardware.gpu.core-clock", "GPU Core Clock"),
  pt("hardware.gpu.memory-junction-temp", "GPU Memory Junction Temp"),
  pt("hardware.gpu.hot-spot", "GPU Hot Spot"),
  pt("hardware.gpu.core-temp", "GPU Core Temp"),
  pt("hardware.gpu.board-power", "GPU Board Power"),
  pt("hardware.gpu.memory-used", "GPU Memory Used"),
  pt("hardware.memory.load", "Memory Load"),
  pt("hardware.drive-c.used", "Drive C: Used Space"),
  pt("rtss.fps", "Framerate"),
  pt("network.eth.status", "Ethernet Status", "text"),
];

const preset = (id: string) => ALERT_PRESETS.find((p) => p.id === id)!;
const keyOf = (id: string) => matchSensor(preset(id), CATALOGUE);

describe("alert presets", () => {
  it("picks the matching key from the live catalogue", () => {
    expect(keyOf("gpu-temp")).toBe("hardware.gpu.core-temp");
    expect(keyOf("gpu-hotspot")).toBe("hardware.gpu.hot-spot");
    expect(keyOf("gpu-power")).toBe("hardware.gpu.board-power");
    expect(keyOf("cpu-temp")).toBe("hardware.cpu.package-temp");
    expect(keyOf("cpu-usage")).toBe("hardware.cpu.total-load");
    expect(keyOf("ram-full")).toBe("hardware.memory.load");
    expect(keyOf("vram-full")).toBe("hardware.gpu.memory-used");
    expect(keyOf("drive-full")).toBe("hardware.drive-c.used");
    expect(keyOf("fps-drop")).toBe("rtss.fps");
    expect(keyOf("network-down")).toBe("network.eth.status");
  });

  it("watches a plugin's sensor for going missing, shown on the island", () => {
    const rule = presetRule(preset("plugin-missing"), [...CATALOGUE, pt("plugins.InfoPanel.FPS.fps", "FPS")]);
    expect(rule.source).toMatchObject({ kind: "sensor", conditions: [{ key: "plugins.InfoPanel.FPS.fps", op: "missing" }], forSeconds: 30 });
    expect(rule.outputs.display).toMatchObject({ style: "island", seconds: 0 });
    expect(normalizeAlerts({ rules: [rule] })!.rules[0].source).toMatchObject({ conditions: [{ op: "missing" }] });
  });

  it("leaves the key empty when nothing matches", () => {
    expect(matchSensor(preset("gpu-temp"), [pt("a.b", "Unrelated")])).toBeUndefined();
    const rule = presetRule(preset("fps-drop"), []);
    expect(rule.source).toMatchObject({ kind: "sensor", conditions: [{ key: "", op: "<" }] });
  });

  it("skips empty points and non-numbers for threshold presets", () => {
    expect(matchSensor(preset("gpu-temp"), [pt("gpu.temp", "GPU Temp", "empty"), pt("gpu.temp2", "GPU Temp", "text")])).toBeUndefined();
  });

  it("builds a fresh rule each time with defaults that survive normalisation", () => {
    const a = presetRule(preset("gpu-temp"), CATALOGUE);
    const b = presetRule(preset("gpu-temp"), CATALOGUE);
    expect(a.id).not.toBe(b.id);
    a.outputs.display!.seconds = 99;
    expect(preset("gpu-temp").rule.outputs.display!.seconds).not.toBe(99);
    expect(a.source).toMatchObject({
      conditions: [{ key: "hardware.gpu.core-temp", op: ">", value: 80, clearBelow: 75 }],
      forSeconds: 10,
    });
    const matched = ALERT_PRESETS.map((p) => presetRule(p, CATALOGUE));
    const all = [...matched, blankNotificationRule()];
    expect(normalizeAlerts({ rules: all })!.rules).toHaveLength(all.length);
    // An empty key is dropped on a reload (normalizeAlerts), so the blanks only live until a save.
    expect(blankSensorRule().source).toMatchObject({ kind: "sensor", conditions: [{ key: "" }] });
  });

  it("offers every preset the plan lists", () => {
    // The alerts plan lists 11; the island plan adds "Plugin stopped reporting".
    expect(ALERT_PRESETS).toHaveLength(12);
    expect(preset("notification").rule.source).toEqual({ kind: "notification" });
  });
});

describe("alert presets against a real catalogue (units decide)", () => {
  const u = (key: string, name: string, unit: string): PresetPoint => ({ key, name, type: "number", unit });
  // Points as the Data API reports them on an RTX 5090 / Ryzen 9950X3D machine.
  const REAL: PresetPoint[] = [
    u("libre.amd_ryzen_9_9950x3d_package", "AMD Ryzen 9 9950X3D Package", "W"),
    u("libre.nvidia_geforce_rtx_5090_gpu_power", "NVIDIA GeForce RTX 5090 GPU Power", "%"),
    u("libre.nvidia_geforce_rtx_5090_gpu_board_power", "NVIDIA GeForce RTX 5090 GPU Board Power", "%"),
    u("libre.nvidia_geforce_rtx_5090_gpu_package", "NVIDIA GeForce RTX 5090 GPU Package", "W"),
    u("plugins.InfoPanel.RTSS.rtss.1% low fps", "RTSS · 1% Low FPS", "FPS"),
    u("plugins.InfoPanel.RTSS.rtss.fps", "RTSS · Frames Per Second", "FPS"),
    u("system.cpu.load", "CPU Load", "%"),
  ];
  it("picks the GPU power in watts, not the percentage readings", () => {
    expect(matchSensor(preset("gpu-power"), REAL)).toBe("libre.nvidia_geforce_rtx_5090_gpu_package");
  });
  it("never takes a CPU package power reading for the CPU temperature", () => {
    expect(matchSensor(preset("cpu-temp"), REAL)).toBeUndefined();
  });
  it("picks the live frame rate and the CPU load", () => {
    expect(matchSensor(preset("fps-drop"), REAL)).toBe("plugins.InfoPanel.RTSS.rtss.fps");
    expect(matchSensor(preset("cpu-usage"), REAL)).toBe("system.cpu.load");
  });
});
