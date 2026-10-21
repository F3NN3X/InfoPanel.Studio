import { describe, expect, it } from "vitest";
import { resolveFont } from "@/lib/general";
import { defaultConfig, type DashboardConfig, type MonitorProfile, type Placement } from "@/lib/layout";
import { DEFAULT_THEME } from "@/lib/theme";
import {
  cardInherit,
  cardsAt,
  customiseCard,
  resetCard,
  themeCard,
  withCardLock,
  withPageFont,
  withToken,
  type ThemeAt,
} from "@/components/studio/theme-cards";
import { withPageFollow, withScopeValues } from "@/components/studio/theme-editor-model";

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

const ALL: ThemeAt = { level: "all" };
const SCREEN: ThemeAt = { level: "screen", profileId: "desk" };
const GAMING: ThemeAt = { level: "page", profileId: "desk", pageId: "gaming" };
const desk = (c: DashboardConfig) => c.profiles[0];
const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe("which cards a scope edits", () => {
  it("All screens and a screen list the ten cards in order", () => {
    const order = ["colors", "type", "spacing", "surface", "border", "background", "format", "thresholds", "motion", "css"];
    expect(ids(cardsAt(setup(), ALL).cards)).toEqual(order);
    expect(ids(cardsAt(setup(), SCREEN).cards)).toEqual(order);
    expect(cardsAt(setup(), SCREEN).customise).toEqual([]);
  });

  it("a page lists only what it customises; the rest can be customised, with the reasons it can't", () => {
    let c = withPageFollow(setup(), "desk", "gaming", "border", false);
    c = withCardLock(c, "desk", themeCard("thresholds"), true);
    const { cards, customise } = cardsAt(c, GAMING);
    expect(ids(cards)).toEqual(["border"]);
    const why = Object.fromEntries(customise.map((o) => [o.card.id, o.disabled ?? o.note ?? ""]));
    expect(why).toEqual({
      // PLAN decision 13: the widget colors are a page's; the tokens stay with the screen (a LinkRow).
      colors: "",
      type: "",
      spacing: "Spacing only",
      surface: "",
      background: "Set per screen",
      format: "",
      thresholds: "Locked by Screen",
      motion: "",
      css: "",
    });
    expect(customise.filter((o) => o.disabled).map((o) => o.card.id)).toEqual(["background", "thresholds"]);
  });

  it("customising a card on a page turns its sections custom (both of Colors), never a locked one", () => {
    let c = customiseCard(setup(), GAMING, themeCard("colors"));
    expect(desk(c).pages[1].widgetTheme?.follow).toEqual({ colors: false, palette: false });
    expect(ids(cardsAt(c, GAMING).cards)).toEqual(["colors"]);
    c = withCardLock(setup(), "desk", themeCard("motion"), true);
    expect(customiseCard(c, GAMING, themeCard("motion"))).toEqual(c);
  });
});

describe("a card's chip", () => {
  it("All screens: built-in until set, then Set here", () => {
    expect(cardInherit(setup(), ALL, themeCard("colors")).state).toBe("builtin");
    expect(cardInherit(withToken(setup(), ALL, "primary", "1 2% 3%"), ALL, themeCard("colors")).state).toBe("base");
    expect(cardInherit(withScopeValues(setup(), "", { kind: "base" }, () => ({ smoothing: "smooth" })), ALL, themeCard("motion")).state).toBe("base");
  });

  it("a screen: inherited from All screens until it owns a store of the card, then Custom here", () => {
    expect(cardInherit(setup(), SCREEN, themeCard("colors"))).toMatchObject({ state: "inherited", from: "all" });
    // Either store makes the screen's Colors custom: a token, or a widget color.
    expect(cardInherit(withToken(setup(), SCREEN, "primary", "1 2% 3%"), SCREEN, themeCard("colors")).state).toBe("custom");
    const widget = withScopeValues(setup(), "desk", { kind: "profile" }, () => ({ s1: "#00ff00" }));
    expect(cardInherit(widget, SCREEN, themeCard("colors")).state).toBe("custom");
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

describe("the two-level stores", () => {
  it("the page font: All screens writes general.font (System as none), a screen its own profile.font", () => {
    const all = withPageFont(setup(), ALL, "mono");
    expect(all.general?.font).toBe("mono");
    expect(desk(all).font).toBeUndefined();
    expect(withPageFont(all, ALL, "system").general?.font).toBeUndefined();
    const screen = withPageFont(all, SCREEN, "serif");
    expect(screen.general?.font).toBe("mono");
    expect(desk(screen).font).toBe("serif");
    expect(resolveFont({ font: "mono" }, desk(screen))).toBe("serif");
    expect(cardInherit(screen, SCREEN, themeCard("type")).state).toBe("custom");
    // Reset to inherited drops the screen's font: it shows All screens' again.
    expect(desk(resetCard(screen, SCREEN, themeCard("type")))).not.toHaveProperty("font");
  });

  it("Colors and Shape & spacing keep the tokens and the radius apart on a screen", () => {
    let c = { ...setup(), radius: 0.75 };
    c = customiseCard(c, SCREEN, themeCard("colors"));
    expect(desk(c).theme).toEqual(DEFAULT_THEME);
    expect(desk(c)).not.toHaveProperty("radius");
    c = customiseCard(c, SCREEN, themeCard("spacing"));
    expect(desk(c).radius).toBe(0.75);
    const reset = resetCard(c, SCREEN, themeCard("colors"));
    expect(desk(reset)).not.toHaveProperty("theme");
    expect(desk(reset).radius).toBe(0.75);
  });

  it("a token edit on a screen starts from what it shows", () => {
    const c = withToken(withToken(setup(), ALL, "accent", "9 9% 9%"), SCREEN, "primary", "1 2% 3%");
    expect(desk(c).theme).toEqual({ ...DEFAULT_THEME, accent: "9 9% 9%", primary: "1 2% 3%" });
    expect(c.theme.primary).toBe(DEFAULT_THEME.primary);
  });
});
