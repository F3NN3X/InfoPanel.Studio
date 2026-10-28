import { describe, expect, it } from "vitest";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { defaultConfig, type DashboardConfig, type MonitorProfile } from "@/lib/layout";
import { applyTheme, themeState } from "@/lib/theme-apply";
import { themeCard, withCardLock, withPageFont, type ThemeAt } from "@/components/studio/theme-cards";
import { withPageFollow, withScopeValues } from "@/components/studio/theme-editor-model";
import { fineTuneChip, fineTuneHeading, fineTuneSummary, resetFineTune } from "@/components/studio/theme-fine-tune-model";
import { themeTarget } from "@/components/studio/use-appearance-presets";

const DESK: AppearancePreset = { id: "look-desk", name: "Desk", description: "", theme: "slate", radius: 0.75, style: { skin: "hud", surface: "glass", accent: "#38bdf8" } };

function setup(): DashboardConfig {
  const c = defaultConfig();
  const desk: MonitorProfile = { ...c.profiles[0], id: "desk", name: "Desk bar", pages: [{ id: "main", name: "Main", placements: [] }] };
  return { ...c, profiles: [desk], appearancePresets: [DESK] };
}

const SCREEN: ThemeAt = { level: "screen", profileId: "desk" };
const MAIN: ThemeAt = { level: "page", profileId: "desk", pageId: "main" };
const chip = (c: DashboardConfig, at: ThemeAt, id: Parameters<typeof themeCard>[0]) => fineTuneChip(c, at, themeCard(id), themeState(c, themeTarget(at)));

describe("a fine-tune section's chip", () => {
  it("a screen: Built-in with nothing set, From theme for what a theme wrote, Changed here once changed", () => {
    expect(chip(setup(), SCREEN, "colors").state).toBe("builtin");
    const applied = applyTheme(setup(), DESK, { kind: "profile", profileId: "desk" });
    expect(chip(applied, SCREEN, "colors").state).toBe("theme");
    expect(chip(applied, SCREEN, "surface").state).toBe("theme");
    expect(chip(applied, SCREEN, "motion").state).toBe("builtin");
    const changed = withScopeValues(applied, "desk", { kind: "profile" }, (v) => ({ ...v, accent: "#ff0000" }));
    expect(chip(changed, SCREEN, "colors").state).toBe("base");
    // The page font is the screen's own once set.
    expect(chip(withPageFont(applied, SCREEN, "mono"), SCREEN, "type").state).toBe("base");
  });

  it("a page: From the screen until it changes a section, Locked under the screen's lock", () => {
    expect(chip(setup(), MAIN, "format")).toMatchObject({ state: "inherited", from: "screen", fromName: "Desk bar" });
    const custom = withPageFollow(setup(), "desk", "main", "format", false);
    expect(chip(custom, MAIN, "format").state).toBe("custom");
    expect(chip(withCardLock(custom, "desk", themeCard("format"), true), MAIN, "format").state).toBe("locked");
    expect(chip(applyTheme(setup(), DESK, themeTarget(MAIN)), MAIN, "colors").state).toBe("theme");
  });
});

describe("Reset to inherited", () => {
  it("puts back the theme's values where a theme is applied, else drops the level's", () => {
    const applied = applyTheme(setup(), DESK, { kind: "profile", profileId: "desk" });
    const changed = withScopeValues(applied, "desk", { kind: "profile" }, (v) => ({ ...v, accent: "#ff0000", s1: "#00ff00" }));
    const reset = resetFineTune(changed, SCREEN, themeCard("colors"), themeState(changed, themeTarget(SCREEN)));
    expect(reset.profiles[0].widgetTheme?.values).toMatchObject({ accent: "#38bdf8" });
    expect(reset.profiles[0].widgetTheme?.values?.s1).toBeUndefined();
    const plain = withScopeValues(setup(), "desk", { kind: "profile" }, () => ({ accent: "#ff0000" }));
    expect(resetFineTune(plain, SCREEN, themeCard("colors"), themeState(plain, themeTarget(SCREEN))).profiles[0].widgetTheme?.values).toBeUndefined();
  });
});

describe("summaries", () => {
  const ctx = { paletteName: "Zinc", fontLabel: "Nunito" };
  it("read each section's values", () => {
    expect(fineTuneSummary("colors", { accent: "#38bdf8" }, ctx)).toBe("Zinc · accent #38BDF8");
    expect(fineTuneSummary("type", { fontWeight: "auto", numGlow: "off" }, ctx)).toBe("Nunito · auto weight · glow off");
    expect(fineTuneSummary("spacing", { scale: 100, padding: "8" }, ctx)).toBe("100% size · 8 px padding");
    expect(fineTuneSummary("surface", { surface: "auto", blur: "16", surfaceOpacity: 100 }, ctx)).toBe("Skin's card · blur 16 px");
    expect(fineTuneSummary("surface", { surface: "auto", blur: "16", surfaceOpacity: 55 }, ctx)).toBe("Skin's card · blur 16 px · 55% opacity");
    expect(fineTuneSummary("format", { tempUnit: "c", decimals: "auto", clock: "24" }, ctx)).toBe("°C · auto decimals · 24 h");
    expect(fineTuneSummary("thresholds", {}, ctx)).toBe("Load 80/92 · Temp 80/90 °C");
    expect(fineTuneSummary("motion", { smoothing: "smooth", meterBallistics: "peak" }, ctx)).toBe("Smooth graphs · peak meters");
    expect(fineTuneSummary("css", { customCss: ".a { color: red }" }, ctx)).toBe("1 rule");
    expect(fineTuneSummary("css", { customCss: "" }, ctx)).toBe("No rules");
  });

  it("the header counts the changes, or says just Fine-tune", () => {
    expect(fineTuneHeading(0)).toBe("Fine-tune");
    expect(fineTuneHeading(2)).toBe("Fine-tune · 2 changes here");
  });
});
