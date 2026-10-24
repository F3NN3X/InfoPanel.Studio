import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ModuleSettings } from "@/modules/types";
import { GROUP_C } from "@/widgets/registry/c";
import { renderModule } from "@/widgets/test-render";

vi.mock("@/lib/wavelink", async (orig) => ({ ...(await orig<typeof import("@/lib/wavelink")>()), ...(await import("@/widgets/__fixtures__/wavelink")).wavelinkMock() }));

const html = (id: string, settings: ModuleSettings) => renderModule(GROUP_C.find((m) => m.id === id)!, settings);

describe("audio widgets: inputs and outputs", () => {
  it("Audio Meter: the bridge lists the devices of the flow shown, and the picked ones", () => {
    const inputs = html("AudioMeter", { mode: "bridge", flow: "input" });
    expect(inputs).toContain("Line In");
    expect(inputs).not.toContain("Headphones");
    const outputs = html("AudioMeter", { mode: "bridge", flow: "output" });
    expect(outputs).toContain("Headphones");
    expect(outputs).not.toContain("Line In");
    const picked = html("AudioMeter", { mode: "bridge", devices: "default-input" });
    expect(picked).toContain("Microphone");
    expect(picked).not.toContain("Line In");
  });

  it("Audio Meter: Auto follows the default of the flow shown, and a chosen device wins", () => {
    expect(html("AudioMeter", { flow: "input" })).toContain("Microphone");
    expect(html("AudioMeter", { flow: "input", device: "audio-meter-0-0-0-00000000-7d1f0a52-3b6e-4c8a-9e21-5a0c4f7b8d13" })).toContain("Line In");
  });

  it("Meter Bridge: columns follow the flow and the pick", () => {
    expect(html("MeterBridge", { flow: "input" })).toContain("Wave Mic 1");
    expect(html("MeterBridge", { flow: "input" })).not.toContain("Headphones");
    expect(html("MeterBridge", { flow: "output" })).not.toContain("Wave Mic 1");
    const picked = html("MeterBridge", { devices: "Line In" });
    expect(picked).toContain("Line In");
    expect(picked).not.toContain("Wave Mic 1");
  });

  it("Volume Mixer: lists the devices of the flow shown, and the picked ones", () => {
    expect(html("VolumeMixer", { flow: "input" })).toContain("Wave Mic 1");
    expect(html("VolumeMixer", { flow: "input" })).not.toContain("Headphones");
    expect(html("VolumeMixer", { flow: "output" })).not.toContain("Wave Mic 1");
    const picked = html("VolumeMixer", { devices: "audio-meter-0-0-0-00000000-44a2e633-0f41-497a-9de0-227ceef7e6c4" });
    expect(picked).toContain("Wave Mic 1");
    expect(picked).not.toContain("Headphones");
  });

  it("Visualizer and Now Playing draw from either flow without throwing", () => {
    for (const flow of ["all", "output", "input"]) {
      expect(renderToString(GROUP_C.find((m) => m.id === "Visualizer")!.render({}, { flow }) ?? <i />).length).toBeGreaterThan(0);
      expect(html("NowPlaying", { progress: "visualizer", flow, vizDevices: "default-input,default-audio" }).length).toBeGreaterThan(0);
    }
    expect(html("Visualizer", { flow: "input" })).toMatch(/(Wave Mic 1|Microphone|Line In) visualizer/);
    // the loudest of the picked: the default output (97 %) over the default input (34 %)
    expect(html("Visualizer", { devices: "default-input,default-audio" })).toContain("System visualizer");
  });

  it("Wave Link: Inputs lists the channels, Outputs the mixes", () => {
    expect(html("WaveLink", { flow: "input" })).toContain("Music");
    expect(html("WaveLink", { flow: "output" })).toContain("Stream Mix");
    expect(html("WaveLink", { flow: "output" })).not.toContain("Music");
  });
});
