import { describe, expect, it } from "vitest";
import { writeZip } from "@/lib/infopanel/zip";
import { FRAMES_FORMAT, framesFileName, framesZip, parseManifest, readFramesZip, type FramesFile } from "@/lib/gauge-studio/frames-zip";

/** A header-only PNG: signature, IHDR size, and a tail byte so frames differ. */
function png(w: number, h: number, tag: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(b.buffer);
  dv.setUint32(8, 13);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  b[39] = tag;
  return b;
}

const file: FramesFile = { name: "Ring / 2", min: 5, max: 95, animationSpeed: 12, frames: [png(8, 6, 1), png(8, 6, 2), png(8, 6, 3)] };
const manifestOf = (over: object = {}) => ({
  format: FRAMES_FORMAT, version: 1, name: "x", frameCount: 1, frames: ["frames/0001.png"], width: 8, height: 6, min: 0, max: 100, animationSpeed: 0, ...over,
});
const text = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));

describe("frames zip", () => {
  it("round-trips the frames byte for byte, in order, with the model", async () => {
    const got = await readFramesZip(framesZip(file));
    expect(got).toEqual(file);
    expect(got.frames.map((f) => f[39])).toEqual([1, 2, 3]);
  });

  it("writes a manifest with the format, frame names and size", () => {
    expect(parseManifest(JSON.stringify(manifestOf()))).toMatchObject({ format: "infopanel-gauge-frames", frameCount: 1, width: 8, height: 6 });
    expect(new TextDecoder().decode(framesZip(file))).toContain('"frames/0003.png"');
  });

  it("refuses to export no frames or a non-PNG frame", () => {
    expect(() => framesZip({ ...file, frames: [] })).toThrow("no frames");
    expect(() => framesZip({ ...file, frames: [png(1, 1, 0), new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0])] })).toThrow("Frame 2 is not a PNG");
  });

  it("refuses a wrong format, version, frame count or frame name", () => {
    expect(() => parseManifest("nope")).toThrow("not JSON");
    expect(() => parseManifest(JSON.stringify(manifestOf({ format: "other" })))).toThrow("Not a gauge frames file");
    expect(() => parseManifest(JSON.stringify(manifestOf({ version: 2 })))).toThrow("not supported");
    expect(() => parseManifest(JSON.stringify(manifestOf({ frameCount: 2 })))).toThrow("says 2 frames but lists 1");
    expect(() => parseManifest(JSON.stringify(manifestOf({ frames: ["../x.png"], })))).toThrow("bad frame list");
    expect(() => parseManifest(JSON.stringify(manifestOf({ min: "a" })))).toThrow("min is not a number");
  });

  it("refuses a zip with no manifest, a missing frame, an extra file, or a non-PNG frame", async () => {
    await expect(readFramesZip(writeZip([{ name: "a.png", data: png(1, 1, 0) }]))).rejects.toThrow("manifest.json is missing");
    await expect(readFramesZip(writeZip([{ name: "manifest.json", data: text(manifestOf()) }]))).rejects.toThrow("missing from the zip");
    const ok = { name: "frames/0001.png", data: png(8, 6, 1) };
    const manifest = { name: "manifest.json", data: text(manifestOf()) };
    await expect(readFramesZip(writeZip([manifest, ok, { name: "evil.exe", data: new Uint8Array(4) }]))).rejects.toThrow("evil.exe is not a listed frame");
    await expect(readFramesZip(writeZip([manifest, { name: ok.name, data: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]) }]))).rejects.toThrow("not a still PNG");
  });

  it("names the download after the gauge", () => {
    expect(framesFileName("My ring / v2")).toBe("My-ring-v2.gauge-frames.zip");
    expect(framesFileName("???")).toBe("gauge.gauge-frames.zip");
  });
});
