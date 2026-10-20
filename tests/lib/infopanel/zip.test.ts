import { describe, expect, it } from "vitest";
import { crc32, listEntries, readEntry, writeZip } from "@/lib/infopanel/zip.ts";
import { buildZip } from "@tests/lib/infopanel/__fixtures__/builders.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

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

  it("caps the inflated size even when the header understates it", async () => {
    const zip = await buildZip([{ name: "a.txt", text: "x".repeat(5000), method: 8 }]);
    const [e] = listEntries(zip);
    await expect(readEntry(zip, { ...e, size: 10 }, 100)).rejects.toThrow(/more than 100 bytes/);
    await expect(readEntry(zip, e, 100)).rejects.toThrow(/5000 bytes is too large/);
    expect((await readEntry(zip, e, 5000)).length).toBe(5000);
  });

  it("rejects unknown compression methods", async () => {
    const zip = await buildZip([{ name: "a.txt", text: "x", method: 0 }]);
    const [e] = listEntries(zip);
    await expect(readEntry(zip, { ...e, method: 14 })).rejects.toThrow(/method 14/);
  });
});

describe("zip writer", () => {
  it("writes stored entries the reader (and the CRC check) reads back, UTF-8 names included", async () => {
    const enc = new TextEncoder();
    const files = [{ name: "Profile.xml", data: enc.encode("<Profile/>") }, { name: "assets/løgo.png", data: new Uint8Array([1, 2, 3]) }, { name: "empty", data: new Uint8Array() }];
    const zip = writeZip(files);
    const entries = listEntries(zip);
    expect(entries.map((e) => [e.name, e.method, e.size])).toEqual([["Profile.xml", 0, 10], ["assets/løgo.png", 0, 3], ["empty", 0, 0]]);
    expect(await Promise.all(entries.map((e) => readEntry(zip, e)))).toEqual(files.map((f) => f.data));
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
  });
});
