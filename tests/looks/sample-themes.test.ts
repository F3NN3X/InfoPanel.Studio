import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { upgradeConfig } from "@/lib/config-upgrade";
import { applyThemeToLevel } from "@/lib/theme-apply";
import { invalidStyleKeys, isBuiltinPreset, isValidStyleValue, normalizeAppearancePresets } from "@/lib/appearance-presets";
import { saveCopyOfPreset } from "@/lib/appearance-preset-apply";
import { defaultConfig } from "@/lib/layout";
import { SAMPLE_PRESET_GROUPS, samplePreset } from "@/lib/screen-templates/sample-presets";
import { THEME_LIST_GROUPS } from "@/lib/screen-templates/template-presets";
import { exportOf, MATERIALS, materialVars, resolveMaterial } from "@/looks/materials";
import { usesSampleCards } from "@/looks/sample-cards";
import { registerSampleCards, SAMPLE_MATERIALS } from "@/looks/sample-materials";
import { SAMPLE_THEMES } from "@/looks/sample-themes";
import { chromeOf, STANDARD_DEFAULTS, STANDARD_SETTINGS } from "@/modules/standard-settings";
import { resolveSurface, TEXT_VARS } from "@/widgets/core/theme";
import { pageOf } from "@/lib/pages";
import { STATUS } from "@/looks/status";

type RGB = [number, number, number];

const rgbOf = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const lum = ([r, g, b]: RGB): number => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a: RGB, b: RGB): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (c: RGB, a: number, back: RGB): RGB => c.map((v, i) => Math.round(v * a + back[i] * (1 - a))) as RGB;

/** The pages a card may sit over: the theme's own, mid grey, and the two that are worst for light and for dark text. */
const BACKDROPS = (page: RGB): RGB[] => [page, [128, 128, 128], [255, 255, 255], [0, 0, 0]];
const FLOOR = 0.9; // BLUR_FALLBACK_ALPHA: D10, a glass card is at least this opaque where its blur is off

/** The colours a card's text is read on: its flat colour, or each tint layer of a glass card at 0.90 over each backdrop. */
function faces(id: string, page: RGB): RGB[] {
  const mat = SAMPLE_MATERIALS[`look-${id}`];
  const flat = rgbOf(exportOf(mat)!);
  if (mat.kind !== "glass") return [flat];
  const tints = [...String(mat.s.background).matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/g)].map((m) => ({ c: [+m[1], +m[2], +m[3]] as RGB, a: Math.max(+m[4], FLOOR) }));
  return tints.flatMap((t) => BACKDROPS(page).map((b) => over(t.c, t.a, b)));
}

/** A contrast the sample themes are known to miss: `<id>:<role>`, with the reason (and the ledger row in progress.md). */
const KNOWN_GAPS: Record<string, string> = {};

describe("sample themes: the cards", () => {
  registerSampleCards();

  it("has one card and one preset per theme, under a name no stored surface uses", () => {
    expect(Object.keys(SAMPLE_MATERIALS)).toEqual(SAMPLE_THEMES.map((t) => `look-${t.id}`));
    expect(Object.keys(SAMPLE_MATERIALS).filter((id) => id in MATERIALS)).toEqual([]);
    expect(SAMPLE_THEMES).toHaveLength(13);
    expect(new Set(SAMPLE_THEMES.map((t) => t.id)).size).toBe(13);
  });

  it("resolves by its stored name and is not the default card", () => {
    for (const id of Object.keys(SAMPLE_MATERIALS)) expect(resolveSurface(id, undefined), id).toBe(SAMPLE_MATERIALS[id]);
    expect(resolveSurface("look-nope", undefined).id).toBe("glass");
  });

  it("loads with the config that names one, and only then", () => {
    expect(usesSampleCards(JSON.parse(JSON.stringify(applyThemeToLevel(defaultConfig(), samplePreset(SAMPLE_THEMES[0]), { kind: "profile", profileId: defaultConfig().profiles[0].id }))))).toBe(true);
    expect(usesSampleCards(defaultConfig())).toBe(false);
    // A level that names a sample Look and stores none of its values (L40) loads them too.
    expect(usesSampleCards({ profiles: [{ widgetTheme: { values: { lookId: "paper" } } }] })).toBe(true);
    expect(usesSampleCards({ profiles: [{ widgetTheme: { values: { lookId: "hud" } } }] })).toBe(false);
  });

  it("is a valid theme value, and the Surface row and its default stay as they were", () => {
    for (const id of Object.keys(SAMPLE_MATERIALS)) expect(isValidStyleValue("surface", id), id).toBe(true);
    expect(isValidStyleValue("surface", "lava")).toBe(false);
    expect(STANDARD_SETTINGS.find((s) => s.key === "surface")!.options!.some((o) => o.value.startsWith("look-"))).toBe(false);
    expect(STANDARD_DEFAULTS.surface).toBe("glass");
  });

  describe.each(Object.entries(SAMPLE_MATERIALS))("%s", (_id, mat) => {
    const lite = resolveMaterial(mat, chromeOf({ ...STANDARD_DEFAULTS, blur: "0" }));
    const r = resolveMaterial(mat);

    it("resolves to every card variable and a flat export colour", () => {
      const vars = materialVars(r) as Record<string, string>;
      for (const name of ["--w-mat-bg", "--w-mat-shadow", "--w-mat-blur", "--w-mat-export", "--w-fill"]) expect(vars[name], name).toBeTruthy();
      expect(vars["--w-mat-export"]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(vars["--w-fill"]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(r.className).toBe("");
    });

    it("keeps its blur and glow inside the caps", () => {
      const px = [...String(r.box.backdropFilter ?? "").matchAll(/min\((\d+)px, var\(--wp-blur-cap, \1px\)\)/g)].map((m) => +m[1]);
      expect(String(r.box.backdropFilter ?? "none").replace(/min\(\d+px, var\(--wp-blur-cap, \d+px\)\)/, "")).toMatch(/^(none|blur\(\))$/);
      for (const n of px) expect(n).toBeLessThanOrEqual(24);
      // Limit blur (the cap var) is the card's own min(); blur 0 in the look turns it off.
      expect(lite.box.backdropFilter ?? "none").toBe("none");
      // A soft glow is 12 px at most and no shadow blurs past 24 (D10 caps): the zero-offset, coloured inset shadows are the glow.
      for (const s of String(mat.s.boxShadow ?? "").split(/,(?![^(]*\))/)) {
        const [, x, y, blurPx] = s.trim().match(/^(?:inset )?(-?[\d.]+)(?:px)? (-?[\d.]+)(?:px)? ([\d.]+)px/) ?? [];
        if (blurPx === undefined) continue;
        expect(+blurPx, s).toBeLessThanOrEqual(24);
        if (+x === 0 && +y === 0) expect(+blurPx, s).toBeLessThanOrEqual(12);
      }
    });

    it("has the tone of its flattened fill", () => {
      expect(mat.tone).toBe(lum(rgbOf(exportOf(mat)!)) > 0.4 ? "light" : "dark");
      expect(r.fill).toBe(exportOf(mat));
    });

    it("keeps the blur fallback to a card that blurs", () => {
      expect(Boolean(r.fallback)).toBe(Boolean(mat.s.backdropFilter) && mat.kind === "glass");
    });
  });
});

describe("sample themes: contrast (D13)", () => {
  const rows = SAMPLE_THEMES.flatMap((t) => {
    const mat = SAMPLE_MATERIALS[`look-${t.id}`];
    const style = samplePreset(t).style;
    const faint = TEXT_VARS[mat.tone]["--w-faint"];
    return [
      ["fg", style.textColor, 4.5],
      ["muted", style.mutedColor, 4.5],
      ["axis-label", faint, 4.5],
      // The status colours are the tone's own (no theme sets them yet); `ok` is the accent (L5).
      ["ok", style.accent, 3],
      ["warn", TEXT_VARS[mat.tone]["--w-warn"] ?? STATUS.warn, 3],
      ["crit", TEXT_VARS[mat.tone]["--w-crit"] ?? STATUS.crit, 3],
    ].map(([role, color, min]) => ({ id: t.id, role: role as string, color: color as string, min: min as number, page: rgbOf(t.page.color ?? t.page.gradient!.from) }));
  });

  it.each(rows)("$id $role reads on the card", ({ id, role, color, min, page }) => {
    const worst = Math.min(...faces(id, page).map((face) => ratio(rgbOf(color), face)));
    if (KNOWN_GAPS[`${id}:${role}`]) expect(worst, KNOWN_GAPS[`${id}:${role}`]).toBeLessThan(min);
    else expect(worst).toBeGreaterThanOrEqual(min);
  });

  it("lists no gap that now passes", () => {
    for (const key of Object.keys(KNOWN_GAPS)) expect(rows.some((r) => `${r.id}:${r.role}` === key), key).toBe(true);
  });
});

describe("sample themes: presets", () => {
  const presets = SAMPLE_PRESET_GROUPS.flatMap((g) => g.presets);

  it("are built-in, listed after the template looks, and hold valid look values", () => {
    expect(presets).toHaveLength(13);
    expect(presets.every((p) => isBuiltinPreset(p.id))).toBe(true);
    expect(THEME_LIST_GROUPS.slice(-13)).toEqual(SAMPLE_PRESET_GROUPS);
    expect(new Set(THEME_LIST_GROUPS.flatMap((g) => g.presets.map((p) => p.id))).size).toBe(THEME_LIST_GROUPS.flatMap((g) => g.presets).length);
    for (const p of presets) expect(invalidStyleKeys(p.style), p.id).toEqual([]);
  });

  it.each(presets)("$name applies, saves and reloads as the same look", (preset) => {
    const config = defaultConfig();
    const profileId = config.profiles[0].id;
    const applied = upgradeConfig(JSON.parse(JSON.stringify(applyThemeToLevel(config, preset, { kind: "profile", profileId }))));
    const profile = applied.profiles.find((p) => p.id === profileId)!;
    expect(profile.widgetTheme?.values).toMatchObject(preset.style);
    expect(profile.appliedTheme?.id).toBe(preset.id);
    expect(pageOf(profile)).toBeDefined();
    // The saved copy keeps the card by name, and the stored config is stable under another load.
    const [copy] = normalizeAppearancePresets(saveCopyOfPreset(config, preset, "mine").appearancePresets)!;
    expect(copy.style.surface).toBe(preset.style.surface);
    expect(copy.theme).toEqual(preset.theme);
    expect(upgradeConfig(JSON.parse(JSON.stringify(applied)))).toEqual(JSON.parse(JSON.stringify(applied)));
  });
});

describe("sample themes: box identity (G2)", () => {
  it("the overflow check runs every card against the default boxes", () => {
    const map = JSON.parse(readFileSync("tests/feature-map.json", "utf8")) as { checks: Record<string, { cmd: string }> };
    const named = /--same-boxes (\S+)/.exec(map.checks.overflow.cmd)?.[1].split(",");
    expect(named).toEqual(Object.keys(SAMPLE_MATERIALS));
  });
});
