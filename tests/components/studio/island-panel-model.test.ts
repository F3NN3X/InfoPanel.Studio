import { describe, expect, it } from "vitest";
import { ISLAND_DEFAULTS, normalizeIsland } from "@/lib/island/config";
import { GENERAL_DEFAULTS } from "@/lib/general";
import { FOLLOW_DASHBOARD, FOLLOW_THEME, islandClockLink, islandFontLink } from "@/components/studio/island-panel-model";

describe("islandFontLink", () => {
  it("follows the screen's page font from Theme", () => {
    expect(islandFontLink(ISLAND_DEFAULTS, "sans")).toEqual({ value: "Sans", from: "Theme", own: false });
    expect(islandFontLink(undefined, "system")).toEqual({ value: "System", from: "Theme", own: false });
  });

  it("keeps an island's own font readable, as its own", () => {
    const island = normalizeIsland({ font: "rounded" })!;
    expect(islandFontLink(island, "sans")).toEqual({ value: "Rounded", from: "this island", own: true });
    // Handing it back is the stored default.
    expect(normalizeIsland({ ...island, ...FOLLOW_THEME })!.font).toBe("system");
  });
});

describe("islandClockLink", () => {
  it("reads the Dashboard's clock", () => {
    expect(islandClockLink(ISLAND_DEFAULTS, { ...GENERAL_DEFAULTS, hour12: false })).toEqual({ value: "24 h", from: "Dashboard", own: false });
    expect(islandClockLink(ISLAND_DEFAULTS, { ...GENERAL_DEFAULTS, hour12: true, showSeconds: false })).toMatchObject({ value: "12 h · no seconds" });
    expect(islandClockLink(undefined, GENERAL_DEFAULTS)).toMatchObject({ value: "Locale" });
  });

  it("keeps an island's own hours and seconds readable, as its own", () => {
    const island = normalizeIsland({ hours: "12", seconds: "hide" })!;
    expect(islandClockLink(island, { ...GENERAL_DEFAULTS, hour12: false })).toEqual({ value: "12 h · no seconds", from: "this island", own: true });
    const back = normalizeIsland({ ...island, ...FOLLOW_DASHBOARD })!;
    expect(islandClockLink(back, { ...GENERAL_DEFAULTS, hour12: false }).own).toBe(false);
  });
});
