import { describe, expect, it } from "vitest";
import { saveCopyOfPreset } from "@/lib/appearance-preset-apply";
import { invalidStyleKeys, isBuiltinPreset, normalizeAppearancePresets } from "@/lib/appearance-presets";
import { SCREEN_TEMPLATES } from "@/lib/screen-templates/catalog";
import { templatePresetId } from "@/lib/screen-templates/looks";
import { TEMPLATE_PRESETS, TEMPLATE_PRESET_GROUPS } from "@/lib/screen-templates/template-presets";
import { defaultConfig } from "@/lib/layout";

describe("template presets", () => {
  it("has one preset per template and palette, with unique built-in ids", () => {
    const expected = SCREEN_TEMPLATES.reduce((n, t) => n + (t.variants?.length ?? 1), 0);
    expect(TEMPLATE_PRESETS).toHaveLength(expected);
    expect(TEMPLATE_PRESET_GROUPS).toHaveLength(SCREEN_TEMPLATES.length);
    const ids = TEMPLATE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(isBuiltinPreset)).toBe(true);
  });

  it("keeps the ids saved screens may name", () => {
    const graphite = SCREEN_TEMPLATES.find((t) => t.id === "graphite")!;
    expect(templatePresetId(graphite)).toBe("builtin:tpl-graphite-amber");
    expect(templatePresetId(graphite, graphite.variants![1])).toBe("builtin:tpl-graphite-teal");
    expect(TEMPLATE_PRESETS.find((p) => p.name === "Graphite · Teal")?.style.accent).toBe("#2dd4bf");
    const plain = SCREEN_TEMPLATES.find((t) => !t.variants?.length)!;
    expect(templatePresetId(plain)).toBe(`builtin:tpl-${plain.id}`);
  });

  it("holds only valid look values", () => {
    for (const p of TEMPLATE_PRESETS) expect(invalidStyleKeys(p.style), p.id).toEqual([]);
  });

  it("round-trips as a saved Theme once copied", () => {
    const preset = TEMPLATE_PRESETS.find((p) => p.id === "builtin:tpl-neon-toxic")!;
    const config = saveCopyOfPreset(defaultConfig(), preset, "look-1");
    const [copy] = normalizeAppearancePresets(config.appearancePresets)!;
    expect(copy).toMatchObject({ id: "look-1", name: "Neon · Toxic copy", radius: preset.radius, style: preset.style, background: preset.background });
    expect(copy.theme).toEqual(preset.theme);
  });
});
