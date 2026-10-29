import { describe, expect, it } from "vitest";
import { resolveFont } from "@/lib/general";
import { defaultConfig, type DashboardConfig, type MonitorProfile, type Placement } from "@/lib/layout";
import { DEFAULT_THEME } from "@/lib/theme";
import {
  cardInherit,
  cardSet,
  customiseCard,
  resetCard,
  THEME_CARDS,
  themeCard,
  withCardLock,
  withPageFont,
  withToken,
  withTokens,
  type ThemeAt,
} from "@/components/studio/theme-cards";
import { withPageFollow, withScopeValues } from "@/components/studio/theme-editor-model";
import { TEMPLATE_PRESETS } from "@/lib/screen-templates/template-presets";
import { applyTheme, themeState } from "@/lib/theme-apply";

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
    const amber = withTokens(applyTheme(setup(), preset("Graphite · Teal"), target), SCREEN, blue, "#ffb000");
    expect(themeState(amber, target, TEMPLATE_PRESETS).own).not.toContain("colors");
    const gaming = applyTheme(amber, preset("Gaming"), target);
    expect(desk(gaming).widgetTheme?.values?.accent).toBe("#22d3ee");
  });

  it("a screen with no accent of its own takes the palette's", () => {
    expect(desk(withTokens(setup(), SCREEN, blue, "#ffb000")).widgetTheme?.values).toEqual({ accent: "#ffb000" });
  });
});
