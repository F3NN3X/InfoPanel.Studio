import { describe, expect, it } from "vitest";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { DEFAULT_THEME, THEME_PRESETS } from "@/lib/theme";
import type { ThemeState, ThemeUse } from "@/lib/theme-apply";
import { skinLabel } from "@/lib/theme-skins";
import {
  backgroundLabel,
  cardName,
  commandThemeAt,
  filteredThemes,
  kindLine,
  otherUses,
  remText,
  resetText,
  rowTag,
  themeLabel,
  themeLinkOf,
  updateBarText,
  usedByText,
} from "@/components/studio/theme-view-model";
import { paletteName } from "@/lib/palettes";

const use = (name: string, kind: "profile" | "page"): ThemeUse => ({
  name,
  target: kind === "profile" ? { kind, profileId: name } : { kind, profileId: "desk", pageId: name },
});
const applied = (id: string, name: string) => ({ id, name, values: {} });
const state = (s: Partial<ThemeState>): ThemeState => ({ deleted: false, changed: [], own: [], ...s });
const DESK = state({ applied: applied("look-desk", "Desk"), theme: { id: "look-desk", name: "Desk" } as AppearancePreset });
const TEMPLATE = state({ applied: applied("builtin:tpl-terminal-amber", "Terminal · Amber") });

describe("the theme card", () => {
  it("names the saved theme with its other uses, a template with its level, a custom or deleted look as not saved", () => {
    const others = [use("Gaming", "page"), use("Work", "page")];
    expect(kindLine(DESK, others, "MyDefault")).toBe("Saved theme · also on the Gaming and Work pages");
    expect(kindLine(DESK, [], "MyDefault")).toBe("Saved theme · only here");
    expect(kindLine(DESK, [use("Wall", "profile"), use("Gaming", "page")], "MyDefault")).toBe("Saved theme · also on Wall and the Gaming page");
    expect(kindLine(TEMPLATE, [], "MyDefault")).toBe("From a screen template · applied to MyDefault");
    expect([cardName(state({})), kindLine(state({}), [], "x")]).toEqual(["Custom look", "not saved"]);
    expect(cardName(state({ applied: applied("look-x", "Night"), deleted: true }))).toBe("Night (deleted)");
  });

  it("names a level's theme by one rule: the theme, Changed from it, (deleted), or Custom look", () => {
    expect(themeLabel(DESK)).toBe("Desk");
    expect(themeLabel({ ...DESK, changed: ["skin"] })).toBe("Changed from Desk");
    expect(themeLabel({ ...TEMPLATE, changed: ["palette"] })).toBe("Changed from Terminal · Amber");
    expect(themeLabel(state({ applied: applied("look-x", "Night"), deleted: true, changed: ["corners"] }))).toBe("Night (deleted)");
    expect(themeLabel(state({}))).toBe("Custom look");
  });

  it("shows the Update bar only once a part changed, naming the other uses when there are some", () => {
    expect(updateBarText(DESK, [])).toBeUndefined();
    const changed: ThemeState = { ...DESK, changed: ["corners"] };
    expect(updateBarText(changed, [use("Gaming", "page")])).toBe("Changed here. Updating Desk also changes the Gaming page.");
    expect(updateBarText(changed, [])).toBe("Changed here.");
    expect(updateBarText({ ...TEMPLATE, changed: ["palette"] }, [])).toBe("Changed from Terminal · Amber. Save it to reuse it on other screens.");
  });

  it("leaves this level out of the other uses, and says when a theme is used nowhere", () => {
    const uses = [use("MyDefault", "profile"), use("Gaming", "page")];
    expect(otherUses(uses, { kind: "profile", profileId: "MyDefault" })).toEqual([use("Gaming", "page")]);
    expect(usedByText(uses)).toBe("Used by MyDefault and the Gaming page");
    expect(usedByText([])).toBe("Not in use");
  });

  it("Reset's sub-text drops the fine-tune clause when there is none", () => {
    expect(resetText("Desk", 2, "screen", "MyDefault")).toBe("Back to exactly Desk: clears 2 fine-tune changes and part changes on MyDefault. Pages keep their own.");
    expect(resetText("Desk", 0, "screen", "MyDefault")).toBe("Back to exactly Desk: clears part changes on MyDefault. Pages keep their own.");
  });
});

describe("Switch theme", () => {
  const paper = { id: "p", name: "Paper", theme: "paper" } as AppearancePreset;
  const zinc = { id: "z", name: "Zinc", theme: "zinc" } as AppearancePreset;
  const rows = [
    { id: "meters", name: "Meters", presets: [zinc, zinc], also: ["Orbit", "Ticker"] },
    { id: "paper", name: "Paper", presets: [paper], also: [] },
  ];
  it("filters to saved, templates or light ones", () => {
    expect(filteredThemes("saved", [zinc], rows)).toEqual({ saved: [zinc], rows: undefined });
    expect(filteredThemes("templates", [zinc], rows)).toEqual({ saved: undefined, rows });
    expect(filteredThemes("light", [zinc, paper], rows)).toEqual({ saved: [paper], rows: [rows[1]] });
  });

  it("tags a row with its variants and the templates folded into it", () => {
    expect(rowTag(rows[0])).toBe("2 variants · also Orbit, Ticker");
    expect(rowTag(rows[1])).toBe("Starter");
  });
});

describe("the parts", () => {
  it("label the background by kind", () => {
    expect(backgroundLabel(undefined)).toBe("None");
    expect(backgroundLabel({ type: "color", color: "#09090b" })).toBe("Solid #09090B");
    expect(backgroundLabel({ type: "gradient", gradient: { from: "#0b1023", to: "#05060a", angle: 160 } })).toBe("Gradient #0B1023 → #05060A");
    expect(backgroundLabel({ type: "image", src: "/media/aurora.jpg?v=2", dim: 25 })).toBe("Image · aurora, dim 25");
  });

  it("name skins and palettes as the UI writes them", () => {
    expect([skinLabel(undefined), skinLabel("auto"), skinLabel("default"), skinLabel("tui"), skinLabel("nixie")]).toEqual(["Default", "Default", "Default", "TUI", "Nixie"]);
    expect(paletteName(THEME_PRESETS[3].tokens)).toBe(THEME_PRESETS[3].label);
    expect(paletteName({ ...DEFAULT_THEME, primary: "1 2% 3%" })).toBe("Custom");
  });

  it("show the corners in rem", () => {
    expect(remText(10 / 16)).toBe("0.63 rem");
    expect(remText(0.5)).toBe("0.5 rem");
  });
});

describe("links into Theme", () => {
  it("open the new places for the old ids", () => {
    expect(themeLinkOf("start")).toEqual({ drill: "themes" });
    expect(themeLinkOf("background")).toEqual({ drill: "background" });
    expect(themeLinkOf("border")).toEqual({ section: "surface" });
    expect(themeLinkOf("type")).toEqual({ section: "type" });
    expect(themeLinkOf("palette")).toEqual({ section: "colors" });
    expect(themeLinkOf("customise")).toEqual({ section: "colors" });
  });
});

describe("the command palette's level", () => {
  it("is the screen until Theme is opened, then Theme's level", () => {
    expect(commandThemeAt(undefined, "desk")).toEqual({ level: "screen", profileId: "desk" });
    expect(commandThemeAt({ kind: "profile" }, "desk")).toEqual({ level: "screen", profileId: "desk" });
    expect(commandThemeAt({ kind: "page", pageId: "gaming" }, "desk")).toEqual({ level: "page", profileId: "desk", pageId: "gaming" });
  });
});
