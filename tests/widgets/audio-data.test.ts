import { describe, expect, it } from "vitest";
import { audioIds, audioIdsIn, flowFilterOf, flowOf, loudestId, pickedIds, readDevice, volumeFlowOf, volumePicked } from "@/widgets/audio-data";
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

describe("audio flows", () => {
  const flat = toFlat(fixtureSensors());
  const MIC = `audio-meter-0-0-0-00000000-44a2e633-0f41-497a-9de0-227ceef7e6c4`;
  const LINE = `audio-meter-0-0-0-00000000-7d1f0a52-3b6e-4c8a-9e21-5a0c4f7b8d13`;

  it("reads data-flow, and a container without one as an output", () => {
    expect(flowOf(flat, "default-input")).toBe("input");
    expect(flowOf(flat, MIC)).toBe("input");
    expect(flowOf(flat, "default-audio")).toBe("output");
    expect(flowOf(flat, "no-such-container")).toBe("output");
  });

  it("filters the containers by the Show choice, and reads anything unknown as all devices", () => {
    expect(audioIdsIn(flat, "input").sort()).toEqual(["default-input", LINE, MIC].sort());
    expect(audioIdsIn(flat, "output")).toContain("default-audio");
    expect(audioIdsIn(flat, "output")).not.toContain("default-input");
    expect(audioIdsIn(flat, "all")).toEqual(audioIds(flat));
    expect(flowFilterOf("inputs")).toBe("all");
    expect(flowFilterOf("input")).toBe("input");
  });

  it("narrows to the picked devices by id or name, in the picked order, and none picked is all", () => {
    const inputs = audioIdsIn(flat, "input");
    expect(pickedIds(flat, inputs, undefined)).toEqual(inputs);
    expect(pickedIds(flat, inputs, [])).toEqual(inputs);
    expect(pickedIds(flat, inputs, [LINE, "wave mic 1"])).toEqual([LINE, MIC]);
    expect(pickedIds(flat, inputs, ["default-audio", "gone"])).toEqual([]);
  });

  it("finds the loudest of the given containers, and none without any", () => {
    expect(loudestId(flat, ["default-input", LINE])).toBe("default-input");
    expect(loudestId(flat, [LINE, "default-input"])).toBe("default-input");
    expect(loudestId(flat, ["default-input", "default-audio"])).toBe("default-audio");
    expect(loudestId(flat, [])).toBeUndefined();
  });

  it("gives a volume entry the flow of the container with its GUID, else output", () => {
    expect(volumeFlowOf(flat, "{0.0.0.00000000}.{44a2e633-0f41-497a-9de0-227ceef7e6c4}")).toBe("input");
    expect(volumeFlowOf(flat, "{0.0.0.00000000}.{81fcb09e-e5cb-43ed-91b5-b02a98683de5}")).toBe("output");
    expect(volumeFlowOf(flat, "default")).toBe("output");
  });

  it("matches a volume entry to a picked container by GUID, and the default entry to default-audio", () => {
    const entry = "{0.0.0.00000000}.{44a2e633-0f41-497a-9de0-227ceef7e6c4}";
    expect(volumePicked(entry, [MIC])).toBe(true);
    expect(volumePicked(entry, [LINE, "default-audio"])).toBe(false);
    expect(volumePicked("default", ["default-audio"])).toBe(true);
  });
});
