import { describe, expect, it } from "vitest";
import { readFaces } from "./sfnt.ts";
import { buildFont as font } from "./__fixtures__/builders.ts";

describe("readFaces", () => {
  it("reads family, face, full name, weight and slant", () => {
    const [face] = readFaces(font({ 1: "Barlow Medium", 2: "Regular", 4: "Barlow Medium", 16: "Barlow", 17: "Medium" }, { weight: 500 }));
    expect(face).toMatchObject({ family: "Barlow", face: "Medium", legacyFamily: "Barlow Medium", fullName: "Barlow Medium", weight: 500, italic: false });
  });

  it("prefers WWS names, and reads italic from fsSelection", () => {
    const [face] = readFaces(font({ 1: "X", 2: "Italic", 21: "X WWS", 22: "Light Italic" }, { italic: true }));
    expect(face).toMatchObject({ family: "X WWS", face: "Light Italic", italic: true });
  });

  it("reads the font's license and embedding permission", () => {
    const [face] = readFaces(font({ 1: "A", 2: "Regular", 13: "SIL Open Font License 1.1", 14: "https://openfontlicense.org" }, { fsType: 0x0004 }));
    expect(face).toMatchObject({ licenseText: "SIL Open Font License 1.1", licenseUrl: "https://openfontlicense.org", embedding: "preview & print" });
    expect(readFaces(font({ 1: "A", 2: "Regular" }))[0]).toMatchObject({ embedding: "installable" });
    expect(readFaces(font({ 1: "A", 2: "Regular" }))[0].licenseText).toBeUndefined();
  });

  it("returns no faces for malformed files instead of reading past them", () => {
    const good = font({ 1: "A", 2: "Regular" });
    expect(readFaces(good.subarray(0, 40))).toEqual([]);
    expect(readFaces(new Uint8Array(4))).toEqual([]);
    expect(readFaces(font({ 1: "A", 2: "Regular" }, { stringLengthBonus: 200 }))).toEqual([]);
  });

  it("never reads bytes outside its own view of a larger buffer", () => {
    // The name string claims to run on past the font, into neighbouring "secret" bytes.
    const evil = font({ 1: "AB" }, { stringLengthBonus: 6 });
    const pool = new Uint8Array(evil.length + 6);
    pool.set(evil);
    pool.set([0, 0x53, 0, 0x45, 0, 0x43], evil.length);
    expect(readFaces(pool.subarray(0, evil.length))).toEqual([]);
  });
});
