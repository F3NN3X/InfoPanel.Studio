import { describe, expect, it } from "vitest";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { TEMPLATE_PRESET_GROUPS } from "@/lib/screen-templates/template-presets";
import { isLightTheme, templateThemeRows, variantName } from "@/lib/screen-templates/template-rows";

const look = (id: string, name: string, style: Record<string, string>): AppearancePreset => ({ id, name, description: "", theme: "zinc", radius: 0.5, style });

describe("template rows", () => {
  it("fold the catalog's identical templates into one row: 22 templates, 55 looks, Meters also Orbit and Ticker", () => {
    const rows = templateThemeRows(TEMPLATE_PRESET_GROUPS);
    expect(rows).toHaveLength(22);
    expect(rows.reduce((n, r) => n + r.presets.length, 0)).toBe(55);
    const meters = rows.find((r) => r.name === "Meters");
    expect(meters?.also).toEqual(["Orbit", "Ticker"]);
    expect(rows.some((r) => r.name === "Orbit" || r.name === "Ticker")).toBe(false);
  });

  it("compare looks by content whatever the key order or name, and keep different ones apart", () => {
    const groups = [
      { id: "a", name: "A", presets: [look("1", "A · Dark", { accent: "#fff", surface: "glass" })] },
      { id: "b", name: "B", presets: [look("2", "B · Night", { surface: "glass", accent: "#fff" })] },
      { id: "c", name: "C", presets: [look("3", "C · Dark", { accent: "#000" })] },
    ];
    expect(templateThemeRows(groups).map((r) => [r.name, r.also])).toEqual([
      ["A", ["B"]],
      ["C", []],
    ]);
  });

  it("name a variant by its own part, and find light themes by their page color", () => {
    expect(variantName({ name: "Terminal · Amber" })).toBe("Amber");
    expect(variantName({ name: "Gaming" })).toBe("Gaming");
    expect(isLightTheme({ theme: "paper" })).toBe(true);
    expect(isLightTheme({ theme: "zinc" })).toBe(false);
  });
});
