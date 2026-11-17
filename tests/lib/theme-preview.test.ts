import { describe, expect, it } from "vitest";
import type { AppearancePreset } from "@/lib/appearance-presets";
import type { DashboardConfig, MonitorProfile, Placement } from "@/lib/layout";
import { mainPage } from "@/lib/pages";
import { THEME_PRESETS } from "@/lib/theme";
import { applyLookToLevel, applyThemeToLevel, applyThemeToScreens } from "@/lib/theme-apply";
import { applyPreview, parsePreview, previewCovers, wears } from "@/lib/theme-preview";
import { lookPreset } from "@/components/studio/look-gallery-model";

// A preview is the config as Apply would leave it: the same rule as Switch theme, and the config it starts from untouched.

const OCEAN = THEME_PRESETS.find((p) => p.name === "ocean")!.tokens;

const zone = (id: string): Placement => ({ id, module: "SensorValue", colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true });
const profile = (id: string): MonitorProfile => ({
  id,
  name: id.toUpperCase(),
  width: 1920,
  height: 550,
  cols: 12,
  rows: 4,
  fit: "fill",
  pages: [mainPage([zone(`${id}-z`)])],
  background: { type: "color", color: "#000000" },
  widgetTheme: { values: { accent: "#ff0000" } },
});
const config = (): DashboardConfig => ({ version: 21, activeProfile: "auto", profiles: [profile("p1"), profile("p2")] });

const desk: AppearancePreset = {
  id: "desk",
  name: "Desk",
  description: "",
  theme: OCEAN,
  radius: 1,
  style: { lookId: "tui", accent: "#38bdf8" },
  background: { type: "color", color: "#101820" },
};
const term = lookPreset({ id: "term", name: "Term", description: "" });

const P1 = { kind: "profile", profileId: "p1" } as const;
const PAGE = { kind: "page", profileId: "p1", pageId: "main" } as const;

describe("applyPreview", () => {
  it("is Switch theme's apply at a screen and a page, for a theme and for a Look, with Keep my background", () => {
    for (const keepBackground of [false, true]) {
      expect(applyPreview(config(), { preset: desk, look: false, scope: P1, keepBackground })).toEqual(applyThemeToLevel(config(), desk, P1, { keepBackground }));
      expect(applyPreview(config(), { preset: desk, look: false, scope: PAGE, keepBackground })).toEqual(applyThemeToLevel(config(), desk, PAGE, { keepBackground }));
      expect(applyPreview(config(), { preset: term, look: true, scope: P1, keepBackground })).toEqual(applyLookToLevel(config(), term, P1, { keepBackground }));
      expect(applyPreview(config(), { preset: term, look: true, scope: PAGE, keepBackground })).toEqual(applyLookToLevel(config(), term, PAGE, { keepBackground }));
    }
  });

  it("on all screens is Apply to other screens for a theme, and a Look picked on each screen", () => {
    const all = { kind: "all" } as const;
    expect(applyPreview(config(), { preset: desk, look: false, scope: all, keepBackground: false })).toEqual(applyThemeToScreens(config(), desk, ["p1", "p2"]));
    const looked = applyPreview(config(), { preset: term, look: true, scope: all, keepBackground: true });
    expect(looked).toEqual(applyLookToLevel(applyLookToLevel(config(), term, P1, { keepBackground: true }), term, { kind: "profile", profileId: "p2" }, { keepBackground: true }));
    expect(looked.profiles.map((p) => p.widgetTheme?.values?.lookId)).toEqual(["term", "term"]);
  });

  it("never changes the config it is given", () => {
    const before = config();
    const frozen = structuredClone(before);
    const after = applyPreview(before, { preset: desk, look: false, scope: P1, keepBackground: false });
    expect(before).toEqual(frozen);
    expect(after).not.toBe(before);
    expect(after.profiles[0].background).toEqual(desk.background);
  });
});

describe("wears", () => {
  it("is false before the theme is applied and true once the config holds it, for a theme and a Look at each scope", () => {
    for (const [preset, look] of [[desk, false], [term, true]] as const) {
      for (const scope of [P1, PAGE, { kind: "all" } as const]) {
        const p = { preset, look, scope, keepBackground: false };
        expect(wears(config(), p)).toBe(false);
        expect(wears(applyPreview(config(), p), p)).toBe(true);
      }
    }
  });
});

describe("previewCovers", () => {
  it("covers every screen on all screens, else its own screen", () => {
    expect(previewCovers({ kind: "all" }, "p2")).toBe(true);
    expect(previewCovers(P1, "p1")).toBe(true);
    expect(previewCovers(PAGE, "p2")).toBe(false);
  });
});

describe("parsePreview", () => {
  it("reads a preview as the kiosks get it, a built-in theme's id kept", () => {
    const parsed = parsePreview({ preset: term, look: true, scope: P1, keepBackground: true, until: 123 });
    expect(parsed).toEqual({ preset: { ...term, theme: expect.any(Object) }, look: true, scope: P1, keepBackground: true });
    expect(parsed?.preset.id).toBe("builtin:look-term");
    expect(parsePreview({ preset: desk, scope: { kind: "all" } })?.scope).toEqual({ kind: "all" });
    expect(parsePreview({ preset: desk, scope: P1, applied: true })?.applied).toBe(true);
    expect(parsePreview({ preset: desk, scope: P1, applied: "yes" })).not.toHaveProperty("applied");
  });

  it("drops style values that are not valid options, as for a stored theme", () => {
    const parsed = parsePreview({ preset: { ...desk, style: { accent: "#38bdf8", surface: "not-a-surface" } }, scope: P1 });
    expect(parsed?.preset.style).toEqual({ accent: "#38bdf8" });
  });

  it("refuses what it cannot draw", () => {
    for (const bad of [null, 5, [], {}, { preset: desk }, { preset: desk, scope: { kind: "profile" } }, { preset: desk, scope: { kind: "page", profileId: "p1" } }, { preset: { ...desk, name: "" }, scope: P1 }, { preset: { ...desk, theme: 7 }, scope: P1 }]) {
      expect(parsePreview(bad)).toBeUndefined();
    }
  });
});
