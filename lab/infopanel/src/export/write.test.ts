/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { loadExport, entriesFromZip } from "../archive.ts";
import { parseDisplayItemsXml, parseProfileXml } from "../parse.ts";
import { displayItemsXml, dotnetDouble, dotnetFloat, infopanelExport, profileXml } from "./write.ts";

const xml = import.meta.glob<string>("../../corpus/*/*.xml", { query: "?raw", import: "default", eager: true });
const ids = [...new Set(Object.keys(xml).map((k) => k.split("/")[3]))];

describe("number formats", () => {
  it("writes doubles and floats as XmlConvert does", () => {
    expect([1, 0.5, 2.675, 1e-7, 1e21, -0, Infinity, -Infinity, NaN].map(dotnetDouble)).toEqual(["1", "0.5", "2.675", "1E-7", "1E+21", "-0", "INF", "-INF", "NaN"]);
    expect([Math.fround(1.33), Math.fround(0.1), 3, Math.fround(16777217)].map(dotnetFloat)).toEqual(["1.33", "0.1", "3", "16777216"]);
  });
});

describe("writer", () => {
  it("leaves lab fields and C#-default fonts out, and keeps unknown fields", () => {
    const [item] = parseDisplayItemsXml('<ArrayOfDisplayItem xmlns:xsi="x"><DisplayItem xsi:type="TextDisplayItem"><Name>a &amp; b</Name><Future>7</Future></DisplayItem></ArrayOfDisplayItem>').items;
    const out = displayItemsXml([{ ...item, native: true } as unknown as typeof item]);
    expect(out).toContain("<Name>a &amp; b</Name>");
    expect(out).toContain("<Future>7</Future>");
    expect(out).not.toContain("native");
    expect(out).not.toContain("<Font>");
    expect(parseDisplayItemsXml(out).items).toEqual([item]);
  });
});

describe.skipIf(ids.length === 0)("corpus round trip", () => {
  it.each(ids)("%s reads back the same after writing", async (id) => {
    const profile = parseProfileXml(xml[`../../corpus/${id}/Profile.xml`]);
    const items = parseDisplayItemsXml(xml[`../../corpus/${id}/DisplayItems.xml`]);
    const back = await loadExport(entriesFromZip(infopanelExport(profile.profile, items.items, [{ name: "x.png", bytes: new Uint8Array([1]) }])));
    expect(back.profile).toEqual(profile.profile);
    expect(back.items).toEqual(items.items);
    expect([...back.assets.keys()]).toEqual(["x.png"]);
    // Only what the original file already had wrong: nothing new.
    const codes = (list: { code: string }[]) => list.map((i) => i.code).filter((c) => c !== "unknown-field").sort();
    expect(codes(back.issues).length).toBeLessThanOrEqual(codes([...profile.issues, ...items.issues]).length);
    expect(profileXml(back.profile)).toBe(profileXml(profile.profile));
  });
});
