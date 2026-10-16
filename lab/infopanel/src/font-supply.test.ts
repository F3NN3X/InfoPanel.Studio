import { describe, expect, it } from "vitest";
import { buildFont, buildZip } from "./__fixtures__/builders.ts";
import type { ResolvedFont } from "./font-loader.ts";
import { facesFromFile, fontSetOf, matchSupplied, missingFamilies, planFonts, requestKey, type SuppliedFace } from "./font-supply.ts";

const face = (family: string, faceName: string, weight: number, extra: Partial<SuppliedFace> = {}): SuppliedFace => ({
  family, face: faceName, legacyFamily: weight === 400 || weight === 700 ? family : `${family} ${faceName}`,
  fullName: `${family} ${faceName}`, postscriptName: "", weight, width: 5, italic: false, index: 0,
  origin: "pack", file: `${family}-${faceName}.ttf`, url: `/x/${family}-${faceName}.ttf`, ...extra,
});

const nunito = [
  face("Nunito Sans", "Regular", 400),
  face("Nunito Sans", "Bold", 700),
  face("Nunito Sans", "Light", 300),
  face("Nunito Sans", "Italic", 400, { italic: true }),
];
const req = (font: string, style = "", bold = false, italic = false) => ({ font, style, bold, italic });

describe("matchSupplied", () => {
  it("picks the face InfoPanel would pick if the library were installed", () => {
    expect(matchSupplied(req("Nunito Sans"), nunito)?.face).toBe("Regular");
    expect(matchSupplied(req("Nunito Sans", "", true), nunito)?.face).toBe("Bold");
    expect(matchSupplied(req("Nunito Sans", "", false, true), nunito)?.face).toBe("Italic");
    expect(matchSupplied(req("Nunito Sans", "Light"), nunito)?.face).toBe("Light");
  });

  it("answers to legacy family names, as DirectWrite does", () => {
    expect(matchSupplied(req("Nunito Sans Light"), nunito)?.face).toBe("Light");
  });

  it("never stands in another family", () => {
    expect(matchSupplied(req("Barlow"), nunito)).toBeNull();
    expect(matchSupplied(req("Sans"), [])).toBeNull();
    // A named style the files lack: InfoPanel would use its default font, not this family.
    expect(matchSupplied(req("Nunito Sans", "Black"), nunito)).toBeNull();
  });

  it("falls back to faces whose names start with the family (badly named instanced files)", () => {
    const odd = (faceName: string, weight: number) =>
      face("Nunito Sans 12pt ExtraLight 12pt", faceName, weight, { legacyFamily: "Nunito Sans 12pt ExtraLight 12pt", origin: "download" });
    const downloads = [odd("Regular", 400), odd("Bold", 700), odd("Light", 300)];
    expect(matchSupplied(req("Nunito Sans", "", true), downloads)?.face).toBe("Bold");
    expect(matchSupplied(req("Nunito Sans", "Light"), downloads)?.face).toBe("Light");
    // An exact family wins over the loose match.
    expect(matchSupplied(req("Nunito Sans", "", true), [...downloads, ...nunito])?.origin).toBe("pack");
    expect(matchSupplied(req("Nunito"), downloads)?.face).toBe("Regular");
    expect(matchSupplied(req("Barlow"), downloads)).toBeNull();
  });

  it("lists each family once with its styles", () => {
    const set = fontSetOf(nunito);
    expect(set.families.find((f) => f.name === "Nunito Sans")?.styles).toHaveLength(4);
    expect(set.families.map((f) => f.name)).toContain("Nunito Sans Light");
  });
});

describe("facesFromFile", () => {
  const url = () => "blob:x";

  it("reads a font file and a zip of fonts, and rejects the rest", async () => {
    const ttf = buildFont({ 1: "Barlow", 2: "Regular", 4: "Barlow Regular" });
    expect((await facesFromFile("Barlow.ttf", ttf, url)).faces).toMatchObject([{ family: "Barlow", origin: "upload", file: "Barlow.ttf", url: "blob:x" }]);

    const zip = await buildZip([
      { name: "pack/Barlow-Bold.ttf", data: buildFont({ 1: "Barlow", 2: "Bold" }, { weight: 700 }), method: 0 },
      { name: "pack/readme.txt", text: "hi", method: 0 },
      { name: "pack/broken.otf", data: new Uint8Array(12), method: 0 },
    ]);
    const r = await facesFromFile("pack.zip", zip, url);
    expect(r.faces.map((f) => [f.family, f.weight, f.file])).toEqual([["Barlow", 700, "pack.zip/pack/Barlow-Bold.ttf"]]);
    expect(r.rejected).toEqual(["pack.zip/pack/broken.otf"]);

    expect((await facesFromFile("notes.pdf", new Uint8Array(4), url)).rejected).toEqual(["notes.pdf (not ttf, otf, ttc or zip)"]);
  });
});

describe("planFonts", () => {
  const resolved = (family: string, fallback: boolean) => ({ typeface: { family }, fallback }) as unknown as ResolvedFont;

  it("draws the supplied face for a missing font, unless set to InfoPanel's fallback", () => {
    const a = req("Nunito Sans", "", true);
    const b = req("Arial");
    const c = req("Gone Font");
    const requests = new Map([a, b, c].map((r) => [requestKey(r), { request: r, count: 2 }]));
    const answers = new Map([
      [requestKey(a), resolved("Comic Sans MS", true)],
      [requestKey(b), resolved("Arial", false)],
      [requestKey(c), resolved("Arial", true)],
    ]);
    const missing = (_: unknown, r: ResolvedFont | undefined) => r?.fallback === true;

    const rows = planFonts(requests, answers, nunito, new Map(), missing);
    expect(rows.map((r) => [r.request.font, r.missing, r.supplied?.face ?? null, r.use])).toEqual([
      ["Nunito Sans", true, "Bold", "supplied"],
      ["Arial", false, null, "infopanel"],
      ["Gone Font", true, null, "infopanel"],
    ]);
    const shown = planFonts(requests, answers, nunito, new Map([[requestKey(a), "infopanel" as const]]), missing);
    expect(shown[0].use).toBe("infopanel");

    expect(missingFamilies(rows).map((m) => [m.family, m.items])).toEqual([["Nunito Sans", 2], ["Gone Font", 2]]);
  });
});
