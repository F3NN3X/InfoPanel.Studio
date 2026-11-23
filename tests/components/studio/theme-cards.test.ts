import { describe, expect, it } from "vitest";
import { resolveFont } from "@/lib/general";
import { CONFIG_VERSION, defaultConfig, type DashboardConfig, type MonitorProfile, type Placement, type StoredConfig } from "@/lib/layout";
import { DEFAULT_THEME, resolveTheme } from "@/lib/theme";
import { upgradeConfig } from "@/lib/config-upgrade";
import { appearanceOf, resolveWith } from "@/lib/style-resolve";
import { cornersPx } from "@/components/studio/theme-view-model";
import { knobValue } from "@/components/studio/look-knobs-model";
import {
  cardInherit,
  cardSet,
  customiseCard,
  resetCard,
  THEME_CARDS,
  themeCard,
  resetCorners,
  withCardLock,
  withCorners,
  withPageFont,
  withToken,
  withTokens,
  withKnobReset,
  withValuesAt,
  type ThemeAt,
} from "@/components/studio/theme-cards";
import { scopeLookValues, withPageFollow, withScopeValues } from "@/components/studio/theme-editor-model";
import { TEMPLATE_PRESETS } from "@/lib/screen-templates/template-presets";
import { applyThemeToLevel, themeState } from "@/lib/theme-apply";
import { registerSampleCards } from "@/looks/sample-materials";

const zone = (id: string, extra: Partial<Placement> = {}): Placement => ({
  id,
  module: "CpuMonitor",
  colStart: 1,
  rowStart: 1,
  colSpan: 3,
  rowSpan: 2,
  visible: true,
  ...extra,
});

/** Screen "Desk" (pages Main and Gaming; a CPU on Main with its own Colors). */
function setup(): DashboardConfig {
  const c = defaultConfig();
  const desk: MonitorProfile = {
    ...c.profiles[0],
    id: "desk",
    name: "Desk",
    pages: [
      { id: "main", name: "Main", placements: [zone("cpu", { settings: { accent: "#ff0000" }, follow: { colors: false } })] },
      { id: "gaming", name: "Gaming", placements: [] },
    ],
  };
  return { ...c, profiles: [desk] };
}

const SCREEN: ThemeAt = { level: "screen", profileId: "desk" };
const GAMING: ThemeAt = { level: "page", profileId: "desk", pageId: "gaming" };
const desk = (c: DashboardConfig) => c.profiles[0];
const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe("the fine-tune sections", () => {
  it("are the eight sections in order, with no background (a theme part now)", () => {
    expect(ids([...THEME_CARDS])).toEqual(["colors", "type", "spacing", "surface", "format", "thresholds", "motion", "css"]);
    expect(themeCard("surface").sections).toEqual(["surface", "skin", "border"]);
  });

  it("changing a section on a page turns its sections custom (both of Colors), never a locked one", () => {
    let c = customiseCard(setup(), GAMING, themeCard("colors"));
    expect(desk(c).pages[1].widgetTheme?.follow).toEqual({ colors: false, palette: false });
    expect(THEME_CARDS.filter((card) => cardSet(c, GAMING, card)).map((card) => card.id)).toEqual(["colors"]);
    c = withCardLock(setup(), "desk", themeCard("motion"), true);
    expect(customiseCard(c, GAMING, themeCard("motion"))).toEqual(c);
  });
});

describe("a card's chip", () => {
  it("a screen (the top level): built-in until it owns a value of the card, then Set here", () => {
    expect(cardInherit(setup(), SCREEN, themeCard("colors"))).toEqual({ state: "builtin", keptOverride: false });
    // A token is the palette, a theme part: only a widget color makes the screen's Colors its own.
    expect(cardInherit(withToken(setup(), SCREEN, "primary", "1 2% 3%"), SCREEN, themeCard("colors")).state).toBe("builtin");
    const widget = withScopeValues(setup(), "desk", { kind: "profile" }, () => ({ s1: "#00ff00" }));
    expect(cardInherit(widget, SCREEN, themeCard("colors")).state).toBe("base");
    expect(cardInherit(withScopeValues(setup(), "desk", { kind: "profile" }, () => ({ smoothing: "smooth" })), SCREEN, themeCard("motion")).state).toBe("base");
    // A screen has nothing above it to take a value from.
    expect(customiseCard(setup(), SCREEN, themeCard("colors"))).toEqual(setup());
  });

  it("a page under a lock: Locked by Screen, keeping its own values", () => {
    let c = withPageFollow(setup(), "desk", "gaming", "type", false);
    c = withCardLock(c, "desk", themeCard("type"), true);
    expect(cardInherit(c, GAMING, themeCard("type"))).toMatchObject({ state: "locked", from: "screen", fromName: "Desk", keptOverride: true });
  });
});

describe("locks", () => {
  it("locking a card locks each of its sections; locking and unlocking keep every override", () => {
    const c = setup();
    const locked = withCardLock(c, "desk", themeCard("colors"), true);
    expect(desk(locked).widgetTheme?.locks).toEqual({ colors: true, palette: true });
    // The widget's own Colors stay stored while locked, and are back as they were after unlocking.
    expect(desk(locked).pages[0].placements[0]).toEqual(desk(c).pages[0].placements[0]);
    const unlocked = withCardLock(locked, "desk", themeCard("colors"), false);
    expect(desk(unlocked).widgetTheme).toBeUndefined();
    expect(desk(unlocked).pages).toEqual(desk(c).pages);
  });
});

describe("the screen's stores", () => {
  it("the page font: a screen writes its own profile.font", () => {
    const screen = withPageFont(setup(), SCREEN, "serif");
    expect(screen.general).toBeUndefined();
    expect(desk(screen).font).toBe("serif");
    expect(resolveFont(desk(screen))).toBe("serif");
    expect(cardInherit(screen, SCREEN, themeCard("type")).state).toBe("base");
    // Reset drops the screen's font: it shows the built-in one again.
    expect(desk(resetCard(screen, SCREEN, themeCard("type")))).not.toHaveProperty("font");
  });

  it("Colors and Shape & spacing leave a screen's palette and corners alone (theme parts)", () => {
    let c = withToken(setup(), SCREEN, "primary", "1 2% 3%");
    c = { ...c, profiles: [{ ...desk(c), radius: 1 }] };
    const changed = customiseCard(customiseCard(c, SCREEN, themeCard("colors")), SCREEN, themeCard("spacing"));
    expect(desk(changed).theme).toEqual(desk(c).theme);
    expect(desk(changed).radius).toBe(1);
    const reset = resetCard(resetCard(c, SCREEN, themeCard("colors")), SCREEN, themeCard("spacing"));
    expect(desk(reset).theme?.primary).toBe("1 2% 3%");
    expect(desk(reset).radius).toBe(1);
  });

  it("a token edit on a screen starts from what it shows", () => {
    const c = withToken(withToken(setup(), SCREEN, "accent", "9 9% 9%"), SCREEN, "primary", "1 2% 3%");
    expect(desk(c).theme).toEqual({ ...DEFAULT_THEME, accent: "9 9% 9%", primary: "1 2% 3%" });
  });
});

describe("the Look's own card picked in Advanced", () => {
  it("stores no card, so the Look's accent, text and font stay on; another card is the level's own", () => {
    registerSampleCards();
    const termed = withScopeValues(setup(), "desk", { kind: "profile" }, () => ({ lookId: "term" }));
    const card = (surface: string) => desk(withValuesAt(termed, SCREEN, (v) => ({ ...v, surface }))).widgetTheme?.values;
    expect(card("look-term")).toEqual({ lookId: "term" });
    expect(card("look-paper")).toEqual({ lookId: "term", surface: "look-paper" });
  });
});

describe("a knob's Reset on a page (L46)", () => {
  it("follows the screen again once the page holds nothing of its own in the section", () => {
    const own = (values: Record<string, string>) =>
      withScopeValues(withPageFollow(setup(), "desk", "gaming", "colors", false), "desk", { kind: "page", pageId: "gaming" }, () => values);
    const reset = (c: DashboardConfig) => desk(withKnobReset(c, GAMING, ["accent"])).pages[1].widgetTheme;
    expect(reset(own({ accent: "#ff0000" }))).toBeUndefined();
    expect(reset(own({ accent: "#ff0000", textColor: "#000000" }))).toEqual({ values: { textColor: "#000000" }, follow: { colors: false } });
  });
});

describe("withTokens (a palette picked)", () => {
  const themed = () => withScopeValues(setup(), "desk", { kind: "profile" }, () => ({ accent: "#22d3ee", glowColor: "#22D3EE", borderColor: "#ffffff" }));
  const blue = { ...DEFAULT_THEME, primary: "200 80% 50%" };

  it("a palette with an accent recolors the screen's accent and the glow that was it; other colors stay", () => {
    const c = withTokens(themed(), SCREEN, blue, "#ffb000");
    expect(desk(c).theme).toEqual(blue);
    expect(desk(c).widgetTheme?.values).toEqual({ accent: "#ffb000", glowColor: "#ffb000", borderColor: "#ffffff" });
  });

  it("a palette without one changes the tokens only", () => {
    const c = withTokens(themed(), SCREEN, blue);
    expect(desk(c).theme).toEqual(blue);
    expect(desk(c).widgetTheme?.values).toEqual(desk(themed()).widgetTheme?.values);
  });

  it("the palette's accent is the theme's, not a change of the screen's own: the next theme replaces it", () => {
    const preset = (name: string) => TEMPLATE_PRESETS.find((t) => t.name === name)!;
    const target = { kind: "profile" as const, profileId: "desk" };
    const amber = withTokens(applyThemeToLevel(setup(), preset("Graphite · Teal"), target), SCREEN, blue, "#ffb000");
    expect(themeState(amber, target, TEMPLATE_PRESETS).own).not.toContain("colors");
    const gaming = applyThemeToLevel(amber, preset("Gaming"), target);
    expect(desk(gaming).widgetTheme?.values?.accent).toBe("#22d3ee");
  });

  it("a screen with no accent of its own takes the palette's", () => {
    expect(desk(withTokens(setup(), SCREEN, blue, "#ffb000")).widgetTheme?.values).toEqual({ accent: "#ffb000" });
  });
});

describe("the one Corners control (L48)", () => {
  it("writes the same px to the widget knob and the screen's rem, and Reset gives the theme's corners back", () => {
    const set = withCorners(setup(), SCREEN, 12);
    expect(desk(set).radius).toBe(0.75);
    expect(desk(set).widgetTheme?.values?.radius).toBe("12");
    const reset = resetCorners(set, SCREEN, 0.5);
    expect(desk(reset).radius).toBe(0.5);
    expect(desk(reset).widgetTheme?.values?.radius).toBeUndefined();
    // No theme names corners: the built-in ones, so the screen stores none.
    expect("radius" in desk(resetCorners(set, SCREEN, undefined))).toBe(false);
  });

  it("reads an old config with the two stores apart as it draws, with no migration", () => {
    // Saved before the fold: the Corners knob at 12 px, Base corners at 4 px (0.25 rem).
    const old = setup();
    const stored = JSON.parse(
      JSON.stringify({ ...old, version: CONFIG_VERSION, profiles: [{ ...old.profiles[0], radius: 0.25, widgetTheme: { values: { radius: "12" } } }] })
    ) as StoredConfig;
    const loaded = upgradeConfig(stored);
    // Both stores are read as saved: the page's corners (rem) and the widgets' (px) draw as before.
    expect(desk(loaded).radius).toBe(0.25);
    expect(resolveTheme(desk(loaded)).radius).toBe(0.25);
    const levels = appearanceOf(loaded, { ...desk(loaded), pageId: "gaming" });
    expect(resolveWith(levels, undefined, undefined)?.radius).toBe("12");
    // The one control shows what the widgets draw; an edit writes both stores to it.
    expect(cornersPx(knobValue(scopeLookValues(levels, "profile"), "radius"), desk(loaded).radius!)).toBe(12);
    const edited = withCorners(loaded, SCREEN, 16);
    expect([desk(edited).radius, desk(edited).widgetTheme?.values?.radius]).toEqual([1, "16"]);
  });

  it("shows a screen that never stored the widget knob at its rem corners", () => {
    expect(cornersPx(undefined, 0.75)).toBe(12);
    expect(cornersPx("auto", 0.5)).toBe(8);
    expect(cornersPx("20", 0.5)).toBe(20);
    // The control's range is 0 to 24 px.
    expect(cornersPx("28", 0.5)).toBe(24);
  });
});
