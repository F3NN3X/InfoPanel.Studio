import { describe, expect, it } from "vitest";
import { CONFIG_VERSION, mergeConfig, type Placement, type StoredConfig } from "@/lib/layout";
import { migratePlacementV12 } from "@/lib/settings-migrate";

const zone = (id: string, module: string, settings?: Record<string, unknown>) => ({ id, module, colStart: 1, rowStart: 1, colSpan: 3, rowSpan: 2, visible: true, ...(settings ? { settings } : {}) });

const stored = (version: number, placements: Record<string, unknown>[]): StoredConfig =>
  ({ version, activeProfile: "auto", profiles: [{ id: "p", name: "Desk", width: 1920, height: 1080, cols: 12, rows: 6, fit: "scroll", pages: [{ id: "main", name: "Main", placements }] }] }) as unknown as StoredConfig;

const zonesOf = (c: ReturnType<typeof mergeConfig>): Placement[] => c.profiles[0].pages[0].placements;

describe("v12: the audio widgets pick several devices", () => {
  it("turns a single device into a one-device pick and keeps the other settings", () => {
    const migrated = mergeConfig(
      stored(11, [
        zone("mix", "VolumeMixer", { device: "default-audio", levelColor: "#00ff00" }),
        zone("viz", "Visualizer", { device: "audio-meter-0-0-0-00000000-e2087318-05b8-4830-84b9-1e6e8852d2f9", mode: "wave" }),
        zone("np", "NowPlaying", { device: "default-audio", progress: "visualizer" }),
      ])
    );
    expect(migrated.version).toBe(CONFIG_VERSION);
    const [mix, viz, np] = zonesOf(migrated);
    expect(mix.settings).toEqual({ devices: "default-audio", levelColor: "#00ff00" });
    expect(viz.settings).toEqual({ devices: "audio-meter-0-0-0-00000000-e2087318-05b8-4830-84b9-1e6e8852d2f9", mode: "wave" });
    expect(np.settings).toEqual({ vizDevices: "default-audio", progress: "visualizer" });
  });

  it("drops Auto without a pick, and leaves the Audio Meter's own device and other widgets alone", () => {
    const migrated = mergeConfig(
      stored(11, [
        zone("auto", "Visualizer", { device: "auto" }),
        zone("blank", "VolumeMixer", { device: "" }),
        zone("meter", "AudioMeter", { device: "default-audio" }),
        zone("cpu", "CpuMonitor", { device: "cpu0" }),
      ])
    );
    const [auto, blank, meter, cpu] = zonesOf(migrated);
    expect(auto.settings).toBeUndefined();
    expect(blank.settings).toBeUndefined();
    expect(meter.settings).toEqual({ device: "default-audio" });
    expect(cpu.settings).toEqual({ device: "cpu0" });
  });

  it("keeps a pick already saved under the new key", () => {
    const out = migratePlacementV12(zone("mix", "VolumeMixer", { device: "default-audio", devices: "a,b" }) as unknown as Placement);
    expect(out.settings).toEqual({ devices: "a,b" });
  });

  it("is idempotent and round-trips through JSON", () => {
    const once = mergeConfig(stored(11, [zone("mix", "VolumeMixer", { device: "default-audio" })]));
    const again = mergeConfig(JSON.parse(JSON.stringify(once)) as StoredConfig);
    expect(again).toEqual(once);
  });
});
