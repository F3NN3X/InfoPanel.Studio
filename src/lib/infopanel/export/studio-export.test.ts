import { describe, expect, it } from "vitest";
import { entriesFromZip, loadExport } from "../archive.ts";
import { assetFile, tableOf, type Doc } from "../assets/assets.ts";
import { openBundle } from "../import/bundle.ts";
import { readStored, toStored, type StoredCanvas, type StoredFont } from "../import/stored.ts";
import { parseDisplayItemsXml, parseProfileXml } from "../parse.ts";
import type { DisplayItem } from "../schema.ts";
import { DEFAULT_GAUGE } from "../gauges/vector.ts";
import {
  canvasZip,
  defaultFontChoice,
  fileStem,
  fontLicences,
  infopanelFile,
  restoreStored,
  staleGauges,
  unusedFiles,
  withFontChoices,
} from "./studio-export.ts";

const parse = (body: string) => parseDisplayItemsXml(`<ArrayOfDisplayItem xmlns:xsi="x">${body}</ArrayOfDisplayItem>`).items;
const profile = parseProfileXml("<Profile><Name>Arc</Name><Width>800</Width><Height>480</Height></Profile>").profile;
const bytes = (s: string) => new TextEncoder().encode(s);

const request = (font: string) => ({ font, style: "Regular", bold: false, italic: false });
const supplied = (font: string, hash: string, license?: string): StoredFont => ({
  request: request(font),
  use: "supplied",
  supplied: { hash, file: `${font}.ttf`, index: 0, family: font, face: "Regular", ...(license ? { license } : {}) },
});

async function setup() {
  const items = parse(
    '<DisplayItem xsi:type="ImageDisplayItem"><Name>i</Name><FilePath>a.png</FilePath><RelativePath>true</RelativePath></DisplayItem>' +
      '<DisplayItem xsi:type="SensorDisplayItem"><Name>s</Name><SensorName>FPS</SensorName><SensorType>Plugin</SensorType><PluginSensorId>p</PluginSensorId></DisplayItem>',
  );
  const assets = tableOf([await assetFile("a.png", bytes("png-a"), "export"), await assetFile("spare.png", bytes("png-spare-1234"), "export")]);
  const doc: Doc = { items, assets };
  const stored = toStored({
    name: "Arc", origin: "installed", dataApi: null, defaultMode: "native", profile, items, assets,
    keyOf: (item) => (item.kind === "Sensor" ? { key: "plugins.p", via: "chosen" } : null),
    fonts: [supplied("Open", "a".repeat(64), "OFL-1.1"), supplied("Shut", "b".repeat(64), "may not be redistributed"), supplied("Open", "a".repeat(64), "OFL-1.1")],
    now: new Date("2026-10-01T00:00:00Z"),
  });
  return { doc, stored: { ...stored, assets: stored.assets.map((a) => (a.name === "a.png" ? { ...a, ext: "png" } : a)) } as StoredCanvas };
}

describe("export helpers", () => {
  it("finds the unused files and their size", async () => {
    const { doc } = await setup();
    expect(unusedFiles(doc)).toEqual({ names: ["spare.png"], bytes: 14 });
  });

  it("lists vector gauges whose frames are out of date", () => {
    const [gauge] = parse('<DisplayItem xsi:type="GaugeDisplayItem"><Name>g</Name></DisplayItem>');
    const fresh = parse('<DisplayItem xsi:type="TextDisplayItem"><Name>t</Name></DisplayItem>');
    expect(staleGauges([...fresh, { ...gauge, vector: DEFAULT_GAUGE } as unknown as DisplayItem])).toEqual(["1"]);
    expect(staleGauges(fresh)).toEqual([]);
  });

  it("writes an .infopanel without the left-out files", async () => {
    const { doc } = await setup();
    const out = infopanelFile(profile, doc, unusedFiles(doc).names);
    expect(out.files).toBe(1);
    const parsed = await loadExport(entriesFromZip(out.bytes));
    expect([...parsed.assets.keys()]).toEqual(["a.png"]);
    expect(parsed.items.map((i) => i.kind)).toEqual(["Image", "Sensor"]);
    expect(parsed.profile.Name).toBe("Arc");
  });

  it("rebuilds the stored form after an edit, keeping the source, keys, fonts and store extensions", async () => {
    const { doc, stored } = await setup();
    const keys = readStored(JSON.parse(JSON.stringify(stored))).keys;
    const extra = await assetFile("frame.png", bytes("frame"), "added");
    const next = restoreStored(stored, profile, { ...doc, assets: new Map([...doc.assets, ["frame.png", extra]]) }, keys, new Map([[extra.hash, "png"]]));
    expect(next.source).toEqual(stored.source);
    expect(next.defaultMode).toBe("native");
    expect(next.fonts).toEqual(stored.fonts);
    expect(next.items[1].$).toEqual({ key: "plugins.p", via: "chosen" });
    expect(next.assets.find((a) => a.name === "a.png")?.ext).toBe("png");
    expect(next.assets.find((a) => a.name === "frame.png")?.ext).toBe("png");
    expect(next.assets.find((a) => a.name === "spare.png")?.ext).toBeUndefined();
  });

  it("reviews each supplied font file once; one that may not be shared starts left out", async () => {
    const { stored } = await setup();
    const rows = fontLicences(stored);
    expect(rows.map((r) => [r.family, r.uses, r.verdict])).toEqual([
      ["Open", 2, "share"],
      ["Shut", 1, "keep"],
    ]);
    expect(rows.map(defaultFontChoice)).toEqual(["include", "leave"]);
    const out = withFontChoices(stored, new Map([["b".repeat(64), "leave"]]));
    expect(out.fonts[1]).toEqual({ request: request("Shut"), use: "infopanel" });
    expect(out.fonts[0]).toBe(stored.fonts[0]);
    expect(withFontChoices(stored, new Map())).toBe(stored);
  });

  it("writes a .canvas.zip that reopens, carrying only the fonts the canvas still draws with", async () => {
    const { doc, stored } = await setup();
    const fonts = new Map([
      ["a".repeat(64), bytes("open-font")],
      ["b".repeat(64), bytes("shut-font")],
    ]);
    const zip = canvasZip(withFontChoices(stored, new Map([["b".repeat(64), "leave"]])), doc.assets, fonts);
    const back = await openBundle(zip);
    expect(back.read.stored.source.name).toBe("Arc");
    expect([...back.assets.keys()].sort()).toEqual(["a.png", "spare.png"]);
    // The font entries are checked against their hash: these fake ones are refused, the left-out one is absent.
    expect(back.missing).toEqual([`fonts/${"a".repeat(64)}`]);
  });

  it("makes a file name from a profile name", () => {
    expect(fileStem("ARC v2 (wide)")).toBe("ARC_v2_wide");
    expect(fileStem("***")).toBe("profile");
  });
});
