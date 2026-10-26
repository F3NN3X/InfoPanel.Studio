/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { baseFamilyName, createTypeface, matchStyle, namedTypeface, type FontSet, type SkiaFamily, type Slant } from "@/lib/infopanel/fonts.ts";

const style = (name: string, weight: number, slant: Slant = "Upright", width = 5) => ({ name, weight, width, slant });

const fonts: FontSet = {
  defaultFamily: "Segoe UI",
  families: [
    { name: "Arial", styles: [style("Normal", 400), style("Negreta", 700), style("Cursiva", 400, "Italic")] },
    { name: "Segoe UI", styles: [style("Normal", 400), style("Negreta", 700)] },
    { name: "Spotify Mix", styles: [style("Regular", 400), style("Bold", 700), style("Extrabold", 800)] },
    { name: "Marathon Shapiro 65", styles: [style("Wide 30", 30, "Upright", 7)] },
    { name: "Webdings Mix", styles: [style("Regular", 400)] },
    { name: "Roboto", styles: [style("Light", 300), style("Regular", 400), style("Condensed", 400, "Upright", 3), style("Bold", 700)] },
  ],
};

describe("createTypeface", () => {
  it("finds a FontStyle by its exact (localized) name, else uses the default typeface", () => {
    expect(createTypeface(fonts, "Arial", "Normal", false, false)).toMatchObject({ family: "Arial", weight: 400, via: "style" });
    expect(createTypeface(fonts, "Arial", "Regular", true, false)).toMatchObject({ family: "Segoe UI", weight: 400, via: "default" });
    expect(createTypeface(fonts, "Roboto", "light", false, false)).toMatchObject({ family: "Segoe UI", via: "default" });
    expect(createTypeface(fonts, "Nunito Sans", "Bold", true, false)).toMatchObject({ family: "Segoe UI", via: "default" });
  });

  it("ignores Bold and Italic when FontStyle is set", () => {
    expect(createTypeface(fonts, "Roboto", "Light", true, true)).toMatchObject({ family: "Roboto", weight: 300, slant: "Upright" });
  });

  it("loads the family by weight, width and slant", () => {
    expect(createTypeface(fonts, "Spotify Mix", "", true, false)).toMatchObject({ family: "Spotify Mix", weight: 700, via: "family" });
    // "Roboto Condensed" is no family; its stripped name is, and the width comes from the name.
    expect(createTypeface(fonts, "Roboto Condensed", "", false, false)).toMatchObject({
      family: "Roboto",
      width: 3,
      via: "base-family",
    });
  });

  it("strips style words, even inside words, then looks for a similar family", () => {
    expect(baseFamilyName("Spotify Mix Extrabold")).toBe("Spotify Mix Extra");
    expect(baseFamilyName("Marathon Shapiro Wide 65")).toBe("Marathon Shapiro 65");
    expect(createTypeface(fonts, "Marathon Shapiro Wide 65", "", false, false)).toMatchObject({
      family: "Marathon Shapiro 65",
      weight: 30,
      via: "base-family",
    });
    // Bold against a weight-30 face: DirectWrite's simulated bold.
    expect(createTypeface(fonts, "Marathon Shapiro Wide 65", "", true, false)).toMatchObject({ weight: 700 });
    expect(createTypeface(fonts, "Spotify Mix Extrabold", "", false, false)).toMatchObject({
      family: "Spotify Mix",
      weight: 400,
      via: "similar",
    });
  });

  it("skips symbol fonts in the similar search and ends at Arial", () => {
    expect(createTypeface(fonts, "Mix Unknown", "", false, false)).toMatchObject({ family: "Spotify Mix", via: "similar" });
    expect(createTypeface(fonts, "Nothing Here", "", true, false)).toMatchObject({ family: "Arial", weight: 700, via: "arial" });
  });
});

describe("matchStyle", () => {
  const family: SkiaFamily = {
    name: "F",
    styles: [style("Light", 300), style("Medium", 500), style("Bold", 700), style("Black", 900), style("Light Oblique", 300, "Oblique")],
  };

  it("follows CSS weight order: 400 tries 500 first, bold tries heavier first", () => {
    expect(matchStyle(family, { weight: 400, width: 5, slant: "Upright" })?.name).toBe("Medium");
    expect(matchStyle(family, { weight: 600, width: 5, slant: "Upright" })?.name).toBe("Bold");
    expect(matchStyle(family, { weight: 200, width: 5, slant: "Upright" })?.name).toBe("Light");
  });

  it("prefers the slant over the weight", () => {
    expect(matchStyle(family, { weight: 700, width: 5, slant: "Italic" })?.name).toBe("Light Oblique");
  });
});

// Ground truth: InfoPanel's own CreateTypeface on this machine (tools/skia-fonts).
// Machine-specific and gitignored, so it skips when absent.
interface Reference {
  default: { family: string };
  families: { name: string; styles: { name: string; weight: number; width: number; slant: Slant }[] }[];
  results: {
    request: { Font: string; Style: string; Bold: boolean; Italic: boolean };
    typeface: { family: string; weight: number; width: number; slant: Slant };
  }[];
}
const refs = Object.values(
  import.meta.glob<Reference>("/lab/infopanel/fonts/skia-reference.json", { import: "default", eager: true }),
);

describe.skipIf(refs.length === 0)("createTypeface matches InfoPanel on this machine", () => {
  // A skipped describe still runs its body while collecting, so tolerate a missing file.
  const ref = refs[0] ?? { default: { family: "" }, families: [], results: [] };
  const machine: FontSet = { families: ref.families, defaultFamily: ref.default.family };
  it("every reference request", () => {
    for (const r of ref.results) {
      const t = createTypeface(machine, r.request.Font, r.request.Style, r.request.Bold, r.request.Italic);
      expect({ family: t.family, weight: t.weight, width: t.width, slant: t.slant }, `${r.request.Font} / ${r.request.Style || "-"}${r.request.Bold ? " bold" : ""}`).toEqual({
        family: r.typeface.family,
        weight: r.typeface.weight,
        width: r.typeface.width,
        slant: r.typeface.slant,
      });
    }
  });
});

describe("namedTypeface", () => {
  it("takes weight and slant from the FontStyle InfoPanel picks, else from Bold and Italic", () => {
    const face = (style: string, bold = false, italic = false) => {
      const t = namedTypeface("Barlow", style, bold, italic);
      return [t.family, t.weight, t.slant];
    };
    // InfoPanel draws FontStyle "Bold" bold with Bold off, and "Regular" regular with it on.
    expect(face("Bold")).toEqual(["Barlow", 700, "Upright"]);
    expect(face("Regular", true)).toEqual(["Barlow", 400, "Upright"]);
    expect(face("SemiBold")).toEqual(["Barlow", 600, "Upright"]);
    expect(face("Semilight")).toEqual(["Barlow", 350, "Upright"]);
    expect(face("Medium Italic")).toEqual(["Barlow", 500, "Italic"]);
    expect(face("Extra Bold")).toEqual(["Barlow", 800, "Upright"]);
    expect(face("Condensed")).toEqual(["Barlow", 400, "Upright"]);
    expect(face("", true, true)).toEqual(["Barlow", 700, "Italic"]);
  });
});
