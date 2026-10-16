import { describe, expect, it } from "vitest";
import { readFaces } from "./sfnt.ts";

const u16 = (a: number[], v: number) => a.push((v >>> 8) & 0xff, v & 0xff);
const u32 = (a: number[], v: number) => a.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);

/** A font with a name table (Windows, en-US) and an OS/2 table; enough for readFaces. */
function font(names: Record<number, string>, opts: { weight?: number; italic?: boolean; stringLengthBonus?: number } = {}) {
  const records: number[] = [];
  const strings: number[] = [];
  const ids = Object.keys(names).map(Number).sort((a, b) => a - b);
  for (const id of ids) {
    const bytes = [...names[id]].flatMap((c) => [0, c.charCodeAt(0)]);
    u16(records, 3);
    u16(records, 1);
    u16(records, 0x409);
    u16(records, id);
    u16(records, bytes.length + (opts.stringLengthBonus ?? 0));
    u16(records, strings.length);
    strings.push(...bytes);
  }
  const name: number[] = [];
  u16(name, 0);
  u16(name, ids.length);
  u16(name, 6 + records.length);
  name.push(...records, ...strings);

  const os2 = new Array(78).fill(0);
  os2[4] = ((opts.weight ?? 400) >>> 8) & 0xff;
  os2[5] = (opts.weight ?? 400) & 0xff;
  os2[7] = 5;
  if (opts.italic) os2[63] = 1;

  const header: number[] = [];
  u32(header, 0x00010000);
  u16(header, 2);
  header.push(0, 0, 0, 0, 0, 0);
  const tables = [
    ["OS/2", os2],
    ["name", name],
  ] as const;
  let offset = 12 + tables.length * 16;
  const body: number[] = [];
  for (const [tag, data] of tables) {
    header.push(...[...tag].map((c) => c.charCodeAt(0)));
    u32(header, 0);
    u32(header, offset);
    u32(header, data.length);
    body.push(...data);
    offset += data.length;
  }
  return new Uint8Array([...header, ...body]);
}

describe("readFaces", () => {
  it("reads family, face, full name, weight and slant", () => {
    const [face] = readFaces(font({ 1: "Barlow Medium", 2: "Regular", 4: "Barlow Medium", 16: "Barlow", 17: "Medium" }, { weight: 500 }));
    expect(face).toMatchObject({ family: "Barlow", face: "Medium", legacyFamily: "Barlow Medium", fullName: "Barlow Medium", weight: 500, italic: false });
  });

  it("prefers WWS names, and reads italic from fsSelection", () => {
    const [face] = readFaces(font({ 1: "X", 2: "Italic", 21: "X WWS", 22: "Light Italic" }, { italic: true }));
    expect(face).toMatchObject({ family: "X WWS", face: "Light Italic", italic: true });
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
