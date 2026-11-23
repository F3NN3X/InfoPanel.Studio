import { describe, expect, it } from "vitest";
import {
  cornerStep,
  densityOf,
  knobCustom,
  knobValue,
  lockedKnobs,
  modeCustom,
  modeOf,
  modePatch,
  surfaceChip,
  variantCustom,
  variantKeys,
  variantKnobs,
  variantOf,
} from "@/components/studio/look-knobs-model";
import { scopeLookValues } from "@/components/studio/theme-editor-model";
import { lookLayers } from "@/looks/sample-cards";
import { registerSampleCards } from "@/looks/sample-materials";

const term = { surface: "look-term", accent: "#8BE37A" };

describe("the Look knobs", () => {
  it("are Custom only for an own value that differs from the Look's", () => {
    expect(knobCustom({ own: {}, inherited: term }, "accent", term)).toBe(false);
    expect(knobCustom({ own: { accent: "#8BE37A" }, inherited: term }, "accent", term)).toBe(false);
    expect(knobCustom({ own: { accent: "#ff0000" }, inherited: term }, "accent", term)).toBe(true);
    // Surface moves the card with its opacity and blur: any of them makes it Custom.
    expect(knobCustom({ own: { blur: "8" } }, "surface", term)).toBe(true);
  });

  it("compare with what the level shows without its own value, as the renderer resolves it", () => {
    registerSampleCards();
    // A screen that applied Term before the Look layer stores every value of it: none of them is Custom.
    const copy = { lookId: "term", ...lookLayers.term };
    expect(knobCustom(scopeLookValues({ profile: { values: copy } }, "profile"), "accent")).toBe(false);
    expect(knobCustom(scopeLookValues({ profile: { values: { ...copy, accent: "#ff0000" } } }, "profile"), "accent")).toBe(true);
  });

  it("ignore a widget's own value while its section follows", () => {
    const values = { own: { accent: "#ff0000" }, inherited: term, applies: () => false };
    expect(knobCustom(values, "accent", term)).toBe(false);
    expect(knobValue(values, "accent")).toBe("#8BE37A");
  });

  it("show the Look's own card stored by a level saved before the Look layer as the Look chip", () => {
    expect(surfaceChip({ own: { lookId: "term", surface: "look-term" } })).toBe("");
    expect(surfaceChip({ own: { surface: "look-term" }, inherited: { lookId: "term" } })).toBe("");
    expect(surfaceChip({ own: { lookId: "term", surface: "look-paper" } })).toBe("look-paper");
    expect(surfaceChip({ own: { surface: "glass" }, applies: () => false })).toBe("");
  });

  it("name the screen that locks a knob's section", () => {
    const levels = { profile: { locks: { colors: true, spacing: true } } };
    expect(lockedKnobs(levels, "Desk")).toEqual({ accent: "Locked by Desk", corners: "Locked by Desk", density: "Locked by Desk" });
    expect(lockedKnobs({}, "Desk")).toEqual({});
  });

  it("read the nearest corner step, none for the Look's", () => {
    expect([cornerStep(undefined), cornerStep("auto"), cornerStep("0"), cornerStep("13"), cornerStep("999")]).toEqual([undefined, undefined, 0, 3, 6]);
  });

  it("name the density padding and gap make, Custom when they match none", () => {
    expect(densityOf({ own: {} })).toBe("normal");
    expect(densityOf({ own: { padding: "4", gap: "4" } })).toBe("compact");
    expect(densityOf({ own: { padding: "16" }, inherited: { gap: "16" } })).toBe("roomy");
    expect(densityOf({ own: { padding: "8" } })).toBe("custom");
  });
});

describe("the Mode knob (D3)", () => {
  it("shows the tone of the stored card, the Look's own mode while it stores none, none on the theme card", () => {
    expect(modeOf({ own: {} }, "dark")).toBe("dark");
    expect(modeOf({ own: { surface: "matte-light" } }, "dark")).toBe("light");
    expect(modeOf({ own: {}, inherited: { surface: "matte-dark" } }, "light")).toBe("dark");
    expect(modeOf({ own: { surface: "look-paper" } }, "light")).toBe("light");
    expect(modeOf({ own: { surface: "theme" } }, "dark")).toBeUndefined();
    // any material shows its own tone, not the Look's: Surface can store glass on a light-only Look and Paper on a dark one
    expect(modeOf({ own: { surface: "glass" } }, "light")).toBe("dark");
    expect(modeOf({ own: { surface: "matte-light" } }, "light")).toBe("light");
  });

  it("is Custom only for a stored card of another mode, and writes the matte card of the other mode", () => {
    expect(modeCustom({ own: {} }, "dark")).toBe(false);
    expect(modeCustom({ own: { surface: "matte-light" } }, "dark")).toBe(true);
    expect(modeCustom({ own: { surface: "matte-light" } }, "light")).toBe(false);
    expect([modePatch("light", "dark"), modePatch("dark", "dark"), modePatch("dark", "light")]).toEqual([{ surface: "matte-light" }, {}, { surface: "matte-dark" }]);
  });
});

describe("the Variant knob", () => {
  const variants = [
    { id: "night", name: "Night", values: { accent: "#5fa7ff", surface: "matte-dark" } },
    { id: "dusk", name: "Dusk", values: { accent: "#da950b", surface: "matte-dark" } },
  ];

  it("shows the variant whose every value the level shows, else the theme's own or Custom", () => {
    expect(variantOf({ own: {}, inherited: { accent: "#ff0000" } }, variants)).toBe("");
    expect(variantOf({ own: { accent: "#DA950B", surface: "matte-dark" } }, variants)).toBe("dusk");
    // One value of its own that matches no variant: Custom, none checked.
    expect(variantOf({ own: { accent: "#da950b" }, inherited: { surface: "glass" } }, variants)).toBeUndefined();
    // A widget's own values while its sections follow are not its.
    expect(variantOf({ own: { accent: "#da950b" }, applies: () => false }, variants)).toBe("");
  });

  it("is Custom for an own value of its keys that differs from what the level inherits, and Reset clears them all", () => {
    expect(variantCustom({ own: { accent: "#5fa7ff" }, inherited: { accent: "#5fa7ff" } }, variants)).toBe(false);
    expect(variantCustom({ own: { surface: "matte-dark" } }, variants)).toBe(true);
    expect(variantKeys(variants)).toEqual(["accent", "surface"]);
  });

  it("shows a variant that also sets the text colours, and Reset clears those keys too", () => {
    const colours = [
      { id: "ice", name: "Ice", values: { accent: "#41d9f8", textColor: "#eaf9ff", mutedColor: "#7fa6b8" } },
      { id: "toxin", name: "Toxin", values: { accent: "#40ef7c", textColor: "#eafff0", mutedColor: "#7fb88f" } },
    ];
    expect(variantOf({ own: { accent: "#40ef7c", textColor: "#EAFFF0", mutedColor: "#7fb88f" } }, colours)).toBe("toxin");
    // the accent alone no longer shows the variant: its text colours are not the level's
    expect(variantOf({ own: { accent: "#40ef7c" }, inherited: { textColor: "#ffffff" } }, colours)).toBeUndefined();
    expect(variantKeys(colours)).toEqual(["accent", "textColor", "mutedColor"]);
    // the Colours section's lock holds them, through the Accent knob
    expect(variantKnobs([{ id: "t", name: "T", values: { textColor: "#fff" } }])).toEqual(["accent"]);
  });

  it("is held by the screen's lock of any knob it writes", () => {
    expect(variantKnobs(variants)).toEqual(["accent", "surface"]);
    expect(variantKnobs([{ id: "roomy", name: "Roomy", values: { padding: "16" } }])).toEqual(["density"]);
  });
});
