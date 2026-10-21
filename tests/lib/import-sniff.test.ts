import { describe, expect, it } from "vitest";
import { buildFont } from "@tests/lib/infopanel/__fixtures__/builders";
import { profileFileText } from "@/components/studio/profile-file";
import { destinationsOf, sniffFile, UNKNOWN_FILE } from "@/lib/import-sniff";
import { framesZip } from "@/lib/gauge-studio/frames-zip";
import { specFile } from "@/lib/infopanel/gauges/spec-file";
import { DEFAULT_GAUGE } from "@/lib/infopanel/gauges/vector";
import { writeZip } from "@/lib/infopanel/zip";
import { defaultConfig, newProfile } from "@/lib/layout";

const enc = (s: string) => new TextEncoder().encode(s);
const sniff = async (name: string, bytes: Uint8Array, type = "") => (await sniffFile(name, type, bytes)).kind;

function png(w = 8, h = 6): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(b.buffer);
  dv.setUint32(8, 13);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}

describe("sniffFile: JSON by its shape, whatever the name", () => {
  it("tells a config backup from a Studio profile file and a bare profile", async () => {
    expect(await sniff("backup.json", enc(JSON.stringify(defaultConfig())))).toBe("config");
    expect(await sniff("screen.json", enc(profileFileText(newProfile("Wide", 1920, 550))))).toBe("profile");
    // What "Copy profile JSON" used to give: the bare profile.
    expect(await sniff("copy.txt", enc(JSON.stringify(newProfile("Wide", 1920, 550))))).toBe("profile");
  });

  it("reads a config whatever its extension, and through a byte order mark", async () => {
    expect(await sniff("whatever.dat", enc(JSON.stringify(defaultConfig())))).toBe("config");
    expect(await sniff("bom.json", new Uint8Array([0xef, 0xbb, 0xbf, ...enc(JSON.stringify(defaultConfig()))]))).toBe("config");
  });

  it("recognises a gauge spec", async () => {
    expect(await sniff("ring.gauge.json", enc(specFile("Ring", DEFAULT_GAUGE)))).toBe("gauge");
  });

  it("does not take other JSON for any of them", async () => {
    expect(await sniff("a.json", enc("{}"))).toBe("unknown");
    expect(await sniff("a.json", enc('{"profiles":[]}'))).toBe("unknown");
    expect(await sniff("a.json", enc('{"profiles":[{"x":1}]}'))).toBe("unknown");
    expect(await sniff("a.json", enc('{"version":10,"profiles":[{"x":1}]}'))).toBe("unknown");
    expect(await sniff("a.json", enc('{"pages":[],"name":"x"}'))).toBe("unknown");
    expect(await sniff("a.json", enc("{not json"))).toBe("unknown");
    expect(await sniff("a.json", enc("[1,2]"))).toBe("unknown");
  });
});

describe("sniffFile: a zip is told apart by what it holds", () => {
  const frames = framesZip({ name: "Ring", min: 0, max: 100, animationSpeed: 0, frames: [png()] });

  it("a frames zip has the gauge frames manifest", async () => {
    expect(await sniff("ring.gauge-frames.zip", frames)).toBe("frames-zip");
    // Named like anything: the manifest decides.
    expect(await sniff("download.zip", frames)).toBe("frames-zip");
  });

  it("a stored canvas has canvas.json, an InfoPanel export has Profile.xml", async () => {
    expect(await sniff("a.zip", writeZip([{ name: "canvas.json", data: enc("{}") }, { name: "assets/a.png", data: png() }]))).toBe("canvas-zip");
    expect(await sniff("a.zip", writeZip([{ name: "Profile.xml", data: enc("<Profile/>") }, { name: "DisplayItems.xml", data: enc("<x/>") }]))).toBe("infopanel");
  });

  it("a font pack is a zip of fonts, with its licence text along", async () => {
    const font = buildFont({ 1: "Orbitron", 2: "Regular" });
    expect(await sniff("Orbitron.zip", writeZip([{ name: "OFL.txt", data: enc("licence") }, { name: "static/Orbitron-Regular.ttf", data: font }]))).toBe("fonts-zip");
  });

  it("a manifest that is not the frames one does not make it a frames zip", async () => {
    expect(await sniff("a.zip", writeZip([{ name: "manifest.json", data: enc('{"format":"other"}') }, { name: "a.txt", data: enc("x") }]))).toBe("unknown");
  });

  it("a zip with nothing it knows, or that is cut short, is unknown", async () => {
    expect(await sniff("a.zip", writeZip([{ name: "readme.txt", data: enc("hello") }]))).toBe("unknown");
    expect(await sniff("a.zip", frames.slice(0, 30))).toBe("unknown");
  });
});

describe("sniffFile: files by their bytes", () => {
  it("takes a .infopanel by its extension", async () => {
    expect(await sniff("ARCv2.infopanel", enc("not even a zip"))).toBe("infopanel");
    expect(await sniff("ARCv2.INFOPANEL", enc("x"))).toBe("infopanel");
  });

  it("images, a video and fonts come from their magic bytes, not their names", async () => {
    expect(await sniff("photo", png())).toBe("image");
    expect(await sniff("clip.bin", new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]))).toBe("video");
    expect(await sniff("face.bin", buildFont({ 1: "Orbitron", 2: "Regular" }))).toBe("font");
  });

  it("an SVG that reads a gauge's variables is a gauge template, any other SVG an image", async () => {
    const template = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle r="4" stroke-dashoffset="var(--percent)"/></svg>';
    expect(await sniff("ring.svg", enc(template))).toBe("gauge-svg");
    expect(await sniff("logo.svg", enc('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle r="4"/></svg>'))).toBe("image");
  });

  it("anything else is unknown, with the door's own message", async () => {
    const got = await sniffFile("notes.txt", "text/plain", enc("just some words"));
    expect(got).toEqual({ kind: "unknown", label: UNKNOWN_FILE });
    expect(UNKNOWN_FILE).toBe("We don't recognise this file.");
    expect((await sniffFile("empty", "", new Uint8Array(0))).kind).toBe("unknown");
  });

  it("a recognised file the library refuses says why, not 'we don't recognise it'", async () => {
    const unsafe = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const got = await sniffFile("evil.svg", "image/svg+xml", enc(unsafe));
    expect(got.kind).toBe("unknown");
    expect(got.label).toMatch(/Unsafe SVG/);
  });
});

describe("destinationsOf", () => {
  const here = { screen: "Wide", page: "Main" };

  it("offers Replace everything first for a config, then its screens only", () => {
    expect(destinationsOf("config", here).map((d) => d.id)).toEqual(["replace", "add-screens"]);
  });

  it("offers a new screen first for an InfoPanel file, then a canvas zone on the current page", () => {
    for (const kind of ["infopanel", "canvas-zip"] as const) {
      const ds = destinationsOf(kind, here);
      expect(ds.map((d) => d.id)).toEqual(["new-screen", "canvas-zone"]);
      expect(ds[1].title).toBe("Canvas zone on “Main”");
    }
  });

  it("sends a profile to a new screen, Library files to their collection, and refuses the unknown", () => {
    expect(destinationsOf("profile", here).map((d) => d.id)).toEqual(["new-screen"]);
    const titles = (["gauge", "gauge-svg", "frames-zip", "image", "video", "font", "fonts-zip"] as const).map((k) => destinationsOf(k, here)[0].title);
    expect(titles).toEqual(["Library › Gauges", "Library › Gauges", "Library › Gauges", "Library › Media", "Library › Media", "Library › Fonts", "Library › Fonts"]);
    expect(destinationsOf("unknown", here)).toEqual([]);
  });
});
