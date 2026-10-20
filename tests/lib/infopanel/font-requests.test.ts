import { describe, expect, it } from "vitest";
import { buildFont, buildZip } from "@tests/lib/infopanel/__fixtures__/builders.ts";
import { describeRequest, fontsInZip, isMissing, supplyFonts, withUse, zoneRequests } from "@/lib/infopanel/font-requests.ts";
import type { ResolvedFont } from "@/lib/infopanel/font-loader.ts";
import { facesFromFile, requestKey } from "@/lib/infopanel/font-supply.ts";
import { parseDisplayItemsXml, parseProfileXml } from "@/lib/infopanel/parse.ts";
import { toStored, type StoredCanvas } from "@/lib/infopanel/import/stored.ts";

const parse = (body: string) => parseDisplayItemsXml(`<ArrayOfDisplayItem xmlns:xsi="x">${body}</ArrayOfDisplayItem>`).items;
const profile = parseProfileXml("<Profile><Name>P</Name><Width>800</Width><Height>480</Height></Profile>").profile;
const text = (font: string, style = "") => `<DisplayItem xsi:type="TextDisplayItem"><Name>t</Name><Font>${font}</Font><FontStyle>${style}</FontStyle></DisplayItem>`;
const ITEMS = parse(text("Orbitron") + text("Rajdhani", "Medium") + `<DisplayItem xsi:type="GroupDisplayItem"><DisplayItems>${text("Rajdhani", "Medium")}${text("Orbitron")}</DisplayItems></DisplayItem>`);
const req = (font: string, style = "") => ({ font, style, bold: false, italic: false });
const RAJ = requestKey(req("Rajdhani", "Medium"));

function canvas(fonts: StoredCanvas["fonts"] = []): StoredCanvas {
  const s = toStored({ name: "ARCv2", origin: "file", dataApi: null, defaultMode: "infopanel", profile, items: ITEMS, fonts, assets: new Map(), keyOf: () => null });
  return JSON.parse(JSON.stringify(s));
}
const resolved = (family: string, fallback: boolean, source: ResolvedFont["source"] = "data-api") =>
  ({ typeface: { family, weight: 400, slant: "Upright" }, fallback, source }) as unknown as ResolvedFont;

describe("zoneRequests", () => {
  it("lists each request once with the paths of its text items", () => {
    const rows = zoneRequests(canvas([{ request: req("Rajdhani", "Medium"), use: "infopanel" }]));
    expect(rows.map((r) => [r.request.font, r.paths])).toEqual([
      ["Orbitron", ["0", "2.1"]],
      ["Rajdhani", ["1", "2.0"]],
    ]);
  });

  it("carries the stored choice", () => {
    const supplied = { hash: "a".repeat(64), file: "R.ttf", index: 0, family: "Rajdhani", face: "Medium" };
    const rows = zoneRequests(canvas([{ request: req("Rajdhani", "Medium"), use: "supplied", supplied }]));
    expect(rows.find((r) => r.key === RAJ)).toMatchObject({ use: "supplied", supplied });
    expect(rows.find((r) => r.request.font === "Orbitron")?.use).toBe("infopanel");
  });
});

describe("isMissing / describeRequest", () => {
  it("is missing when InfoPanel answers with another family", () => {
    expect(isMissing(null, req("Rajdhani"), resolved("Segoe UI", true))).toBe(true);
    expect(isMissing(null, req("Rajdhani Medium"), resolved("Rajdhani", true))).toBe(false);
    expect(isMissing(null, req("Orbitron"), resolved("Orbitron", false))).toBe(false);
    expect(isMissing(null, req("Orbitron"), undefined)).toBe(false);
  });

  it("names how each request is drawn", () => {
    const [orb, raj] = zoneRequests(canvas());
    expect(describeRequest(orb, resolved("Orbitron", false), false, true)).toMatchObject({ status: "ok", drawn: "Orbitron", how: "Asked from InfoPanel (Data API)" });
    expect(describeRequest(orb, resolved("Segoe UI", false, "reference"), false, true).how).toBe("System font");
    expect(describeRequest(raj, resolved("Segoe UI", true), true, true)).toMatchObject({ status: "missing", drawn: "Missing", how: "Not on this PC" });
    expect(describeRequest(raj, undefined, false, false).status).toBe("unknown");
    const supplied = { hash: "a".repeat(64), file: "R.ttf", index: 0, family: "Rajdhani", face: "Medium" };
    expect(describeRequest({ ...raj, supplied, use: "supplied" }, resolved("Segoe UI", true), true, true)).toMatchObject({ status: "ok", how: "Supplied with the profile" });
    expect(describeRequest({ ...raj, supplied, use: "infopanel" }, resolved("Segoe UI", true), true, true)).toMatchObject({ status: "switched", drawn: "Segoe UI (InfoPanel fallback)" });
  });
});

describe("withUse", () => {
  const supplied = { hash: "a".repeat(64), file: "R.ttf", index: 0, family: "Rajdhani", face: "Medium" };
  const base = canvas([{ request: req("Rajdhani", "Medium"), use: "supplied", supplied }]);

  it("switches to the fallback and back, keeping the supplied face", () => {
    const off = withUse(base, RAJ, "infopanel");
    expect(off.fonts.find((f) => requestKey(f.request) === RAJ)).toMatchObject({ use: "infopanel", supplied });
    expect(withUse(off, RAJ, "supplied").fonts.find((f) => requestKey(f.request) === RAJ)?.use).toBe("supplied");
    expect(base.fonts.find((f) => requestKey(f.request) === RAJ)?.use).toBe("supplied");
  });

  it("changes nothing it cannot: the same object comes back", () => {
    expect(withUse(base, RAJ, "supplied")).toBe(base);
    const bare = canvas([{ request: req("Rajdhani", "Medium"), use: "infopanel" }]);
    expect(withUse(bare, RAJ, "supplied")).toBe(bare);
    expect(withUse(base, "nope", "infopanel")).toBe(base);
  });
});

describe("supplyFonts", () => {
  it("supplies the matching face to each missing request and leaves the rest", async () => {
    const ttf = buildFont({ 1: "Rajdhani", 2: "Medium", 4: "Rajdhani Medium" }, { weight: 500 });
    const { faces } = await facesFromFile("Rajdhani-Medium.ttf", ttf, () => "");
    const hash = "b".repeat(64);
    const stored = canvas([{ request: req("Orbitron"), use: "infopanel" }, { request: req("Rajdhani", "Medium"), use: "infopanel" }]);
    const next = supplyFonts(stored, new Set([RAJ, requestKey(req("Orbitron"))]), [{ hash, faces, license: "OFL-1.1" }]);
    expect(next.fonts.find((f) => requestKey(f.request) === RAJ)).toMatchObject({
      use: "supplied",
      supplied: { hash, file: "Rajdhani-Medium.ttf", index: 0, family: "Rajdhani", face: "Medium", license: "OFL-1.1" },
    });
    expect(next.fonts.find((f) => f.request.font === "Orbitron")?.use).toBe("infopanel");
    expect(stored.fonts.find((f) => requestKey(f.request) === RAJ)?.use).toBe("infopanel");
  });

  it("returns the same object when no face fits or nothing is missing", async () => {
    const { faces } = await facesFromFile("B.ttf", buildFont({ 1: "Barlow", 2: "Regular" }), () => "");
    const stored = canvas([{ request: req("Rajdhani", "Medium"), use: "infopanel" }]);
    expect(supplyFonts(stored, new Set([RAJ]), [{ hash: "c".repeat(64), faces }])).toBe(stored);
    expect(supplyFonts(stored, new Set(), [{ hash: "c".repeat(64), faces }])).toBe(stored);
  });
});

describe("fontsInZip", () => {
  it("returns the font files by plain name and skips the rest", async () => {
    const zip = await buildZip([
      { name: "pack/Barlow-Bold.ttf", data: buildFont({ 1: "Barlow", 2: "Bold" }, { weight: 700 }), method: 0 },
      { name: "pack/Barlow.WOFF2", data: new Uint8Array(4), method: 0 },
      { name: "pack/readme.txt", text: "hi", method: 0 },
      { name: "__MACOSX/pack/._Barlow-Bold.ttf", data: new Uint8Array(4), method: 0 },
    ]);
    expect((await fontsInZip(zip)).map((f) => f.name)).toEqual(["Barlow-Bold.ttf", "Barlow.WOFF2"]);
  });
});
