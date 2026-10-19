import { beforeEach, describe, expect, it, vi } from "vitest";
import { assetFile } from "@/lib/infopanel/assets/assets";
import { bakeSignature } from "@/lib/infopanel/gauges/frames";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { normalizeGauge } from "@/lib/infopanel/gauges/vector";

// The canvas raster and the asset store are the edges; the PNG bytes are stand-ins.
const edge = vi.hoisted(() => ({ bake: vi.fn(), uploadBytes: vi.fn() }));
vi.mock("@/lib/infopanel/gauges/raster", () => ({ bake: edge.bake }));
vi.mock("@/lib/assets", () => ({ uploadBytes: edge.uploadBytes }));
import { bakeForDrop } from "./bake-on-drop";
import { DEFAULT_BAKE_COUNT } from "./bake-bar";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 4, 0, 0, 0, 4, 8, 6, 0, 0, 0]);
const gauge = normalizeGauge(STARTERS[0].gauge);

beforeEach(() => {
  edge.bake.mockReset();
  edge.uploadBytes.mockReset();
});

describe("bakeForDrop", () => {
  it("bakes the default frame count, stores each frame and signs what they were baked from", async () => {
    const files = await Promise.all([0, 1].map(async (i) => assetFile(`Ring_${i}.png`, new Uint8Array([...png, i]), "added")));
    edge.bake.mockResolvedValue(files);
    edge.uploadBytes.mockImplementation(async () => ({ id: `${"e".repeat(64)}.png` }));
    const r = await bakeForDrop(gauge, "My Ring!");
    expect(edge.bake).toHaveBeenCalledWith(gauge, DEFAULT_BAKE_COUNT, "My_Ring");
    expect(edge.uploadBytes).toHaveBeenCalledTimes(2);
    expect(r.frames.map((f) => [f.name, f.hash, f.type, f.ext])).toEqual(files.map((f) => [f.name, f.hash, "png", "png"]));
    expect(r.baked).toBe(bakeSignature(gauge, 2));
  });

  it("rejects when a frame can't be stored", async () => {
    edge.bake.mockResolvedValue([await assetFile("a.png", png, "added")]);
    edge.uploadBytes.mockRejectedValue(new Error("The dashboard server could not be reached."));
    await expect(bakeForDrop(gauge, "Ring")).rejects.toThrow("could not be reached");
  });
});
