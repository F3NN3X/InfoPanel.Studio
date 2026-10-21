import { describe, expect, it } from "vitest";
import { styleRows, themeUsedBy } from "@/components/library/preset-summary";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { defaultConfig, type DashboardConfig } from "@/lib/layout";
import { DEFAULT_THEME } from "@/lib/theme";

const glass: AppearancePreset = { id: "g", name: "Glass", description: "", theme: { ...DEFAULT_THEME, primary: "1 2% 3%" }, radius: 1, style: { surface: "glass" } };

const config = (): DashboardConfig => {
  const base = defaultConfig();
  const [first] = base.profiles;
  return {
    ...base,
    profiles: [
      { ...first, id: "a", name: "Desk", theme: { primary: "1 2% 3%" }, radius: 1, widgetTheme: { values: { surface: "glass" } } },
      { ...first, id: "b", name: "Wall" },
    ],
  };
};

describe("themeUsedBy", () => {
  it("names the screens whose resolved look is the Theme", () => {
    expect(themeUsedBy(config(), glass)).toEqual(["Desk"]);
  });

  it("counts a screen that inherits the look from All screens", () => {
    const all = { ...config(), theme: glass.theme as DashboardConfig["theme"], radius: 1, style: { surface: "glass" } };
    expect(themeUsedBy(all, glass)).toEqual(["Desk", "Wall"]);
  });

  it("names none when no screen shows it", () => {
    expect(themeUsedBy(config(), { ...glass, radius: 0.1 })).toEqual([]);
  });
});

describe("styleRows", () => {
  it("reads keys by their setting's label and an option by its label", () => {
    const rows = styleRows({ surface: "glass", madeUp: 3 });
    expect(rows[0].value.toLowerCase()).toContain("glass");
    expect(rows[0].label).not.toBe("surface");
    expect(rows[1]).toEqual({ label: "madeUp", value: "3" });
  });
});
