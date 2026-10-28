import { describe, expect, it } from "vitest";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { defaultConfig, type DashboardConfig } from "@/lib/layout";
import { deletePalette, duplicatePalette, paletteName, paletteUsers, renamePalette, savePalette } from "@/lib/palettes";
import { DEFAULT_THEME, THEME_PRESETS } from "@/lib/theme";

const blue = { ...DEFAULT_THEME, primary: "200 80% 50%" };

describe("saved palettes", () => {
  it("save puts the new palette first, a copy of the tokens; an empty name saves nothing", () => {
    const one = savePalette(defaultConfig(), "a", " Desk ", blue);
    const two = savePalette(one, "b", "Night", DEFAULT_THEME);
    expect(two.palettes?.map((p) => [p.id, p.name])).toEqual([
      ["b", "Night"],
      ["a", "Desk"],
    ]);
    expect(two.palettes?.[1].tokens).toEqual(blue);
    expect(two.palettes?.[1].tokens).not.toBe(blue);
    expect(savePalette(one, "c", "  ", blue)).toBe(one);
  });

  it("rename, duplicate after the original, and delete; the last delete leaves none", () => {
    let c = savePalette(savePalette(defaultConfig(), "a", "Desk", blue), "b", "Night", DEFAULT_THEME);
    c = renamePalette(c, "a", "Desk blue");
    expect(renamePalette(c, "a", "")).toBe(c);
    c = duplicatePalette(c, "b", "b2");
    expect(c.palettes?.map((p) => p.name)).toEqual(["Night", "Night copy", "Desk blue"]);
    expect(duplicatePalette(c, "gone", "x")).toBe(c);
    c = deletePalette(deletePalette(deletePalette(c, "a"), "b"), "b2");
    expect(c.palettes).toBeUndefined();
  });
});

describe("who uses a palette", () => {
  it("names the saved themes, then the screens that show it (a screen without a palette shows the built-in one)", () => {
    const base = defaultConfig();
    const theme = (name: string, tokens: typeof blue) => ({ id: name, name, description: "", theme: tokens, radius: 0.5, style: {} }) as AppearancePreset;
    const c: DashboardConfig = {
      ...base,
      appearancePresets: [theme("Desk look", blue), theme("Plain", DEFAULT_THEME)],
      profiles: [
        { ...base.profiles[0], id: "s1", name: "Desk", theme: { ...blue } },
        { ...base.profiles[0], id: "s2", name: "Follows" },
        { ...base.profiles[0], id: "s3", name: "Other", theme: { primary: "1 2% 3%" } },
      ],
    };
    expect(paletteUsers(c, blue)).toEqual(["Desk look", "Desk"]);
    expect(paletteUsers(c, DEFAULT_THEME)).toEqual(["Plain", "Follows"]);
    expect(paletteUsers(c, THEME_PRESETS[2].tokens)).toEqual([]);
  });

  it("names tokens by the built-in they equal, else the user's palette, else Custom", () => {
    const saved = [{ id: "a", name: "Desk", tokens: blue }];
    expect(paletteName(DEFAULT_THEME, saved)).toBe("Zinc");
    expect(paletteName(blue, saved)).toBe("Desk");
    expect(paletteName({ ...blue, ring: "0 0% 0%" }, saved)).toBe("Custom");
  });
});
