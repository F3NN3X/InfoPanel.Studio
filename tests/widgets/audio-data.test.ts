import { describe, expect, it } from "vitest";
import { readDevice } from "@/widgets/audio-data";
import { toFlat } from "@/widgets/data-adapter";
import { fixtureSensors } from "@/widgets/__fixtures__";

const GUID = "cffd42bd-62a0-43d7-98d5-8b227c5ac3ce";

describe("readDevice: volume and mute from the volume plugin", () => {
  const flat = toFlat(fixtureSensors());

  it("matches a device container by the GUID its id ends with", () => {
    expect(readDevice(flat, `audio-meter-0-0-0-00000000-${GUID}`).vol).toBe(40);
  });

  it("reads the default-device container from the plugin's default entry", () => {
    const one = readDevice(flat, "default-audio");
    expect(one.vol).toBe(40);
    expect(one.muted).toBe(false);
    expect(readDevice({ ...flat, "plugins.volume-plugin.default.mute": "True" }, "default-audio").muted).toBe(true);
  });

  it("has no volume when the plugin publishes none", () => {
    const without = Object.fromEntries(Object.entries(flat).filter(([k]) => !k.startsWith("plugins.volume-plugin.default.")));
    expect(readDevice(without, "default-audio").vol).toBeNaN();
    expect(readDevice(without, "default-audio").muted).toBe(false);
  });
});
