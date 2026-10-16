import { describe, expect, it } from "vitest";
import { listEntries, readEntry } from "./zip.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface Fixture {
  name: string;
  text: string;
  method: 0 | 8;
  /** Extra bytes in the local header only, as some writers emit. */
  localExtra?: number;
}

/** Builds a zip by hand (CRCs left at 0; the reader does not check them). */
async function buildZip(files: Fixture[]): Promise<Uint8Array> {
  const parts: number[] = [];
  const central: number[] = [];
  const u16 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff);
  const u32 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);

  for (const f of files) {
    const name = enc.encode(f.name);
    const plain = enc.encode(f.text);
    const body = f.method === 8 ? await deflateRaw(plain) : plain;
    const extra = f.localExtra ?? 0;
    const offset = parts.length;

    u32(parts, 0x04034b50);
    u16(parts, 20);
    u16(parts, 0x0800);
    u16(parts, f.method);
    u32(parts, 0);
    u32(parts, 0);
    u32(parts, body.length);
    u32(parts, plain.length);
    u16(parts, name.length);
    u16(parts, extra);
    parts.push(...name, ...new Array(extra).fill(0), ...body);

    u32(central, 0x02014b50);
    u16(central, 20);
    u16(central, 20);
    u16(central, 0x0800);
    u16(central, f.method);
    u32(central, 0);
    u32(central, 0);
    u32(central, body.length);
    u32(central, plain.length);
    u16(central, name.length);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u32(central, 0);
    u32(central, offset);
    central.push(...name);
  }

  const eocd: number[] = [];
  u32(eocd, 0x06054b50);
  u16(eocd, 0);
  u16(eocd, 0);
  u16(eocd, files.length);
  u16(eocd, files.length);
  u32(eocd, central.length);
  u32(eocd, parts.length);
  u16(eocd, 0);
  return new Uint8Array([...parts, ...central, ...eocd]);
}

describe("zip reader", () => {
  it("lists entries with sizes and normalised names", async () => {
    const zip = await buildZip([
      { name: "Profile.xml", text: "<Profile/>", method: 8 },
      { name: "assets\\bg.png", text: "png", method: 0 },
    ]);
    const entries = listEntries(zip);
    expect(entries.map((e) => [e.name, e.method, e.size])).toEqual([
      ["Profile.xml", 8, 10],
      ["assets/bg.png", 0, 3],
    ]);
  });

  it("reads stored and deflated entries", async () => {
    const xml = "<DisplayItems>" + "<Item/>".repeat(200) + "</DisplayItems>";
    const zip = await buildZip([
      { name: "DisplayItems.xml", text: xml, method: 8 },
      { name: "raw.txt", text: "stored", method: 0 },
    ]);
    const [a, b] = listEntries(zip);
    expect(dec.decode(await readEntry(zip, a))).toBe(xml);
    expect(dec.decode(await readEntry(zip, b))).toBe("stored");
  });

  it("uses the local header's own extra length", async () => {
    const zip = await buildZip([{ name: "a.txt", text: "hello", method: 8, localExtra: 7 }]);
    const [e] = listEntries(zip);
    expect(dec.decode(await readEntry(zip, e))).toBe("hello");
  });

  it("works on a subarray view", async () => {
    const zip = await buildZip([{ name: "a.txt", text: "x", method: 0 }]);
    const padded = new Uint8Array(zip.length + 8);
    padded.set(zip, 4);
    const view = padded.subarray(4, 4 + zip.length);
    const [e] = listEntries(view);
    expect(dec.decode(await readEntry(view, e))).toBe("x");
  });

  it("rejects data that is not a zip", () => {
    expect(() => listEntries(enc.encode("not a zip at all, just text"))).toThrow(/end of central directory/);
  });

  it("rejects unknown compression methods", async () => {
    const zip = await buildZip([{ name: "a.txt", text: "x", method: 0 }]);
    const [e] = listEntries(zip);
    await expect(readEntry(zip, { ...e, method: 14 })).rejects.toThrow(/method 14/);
  });
});
