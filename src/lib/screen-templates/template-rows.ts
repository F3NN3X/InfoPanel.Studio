/**
 * Switch theme's template rows (handoff SPEC §6): one row per template, with templates whose looks are the same
 * folded into the first ("Meters", also Orbit and Ticker). Looks compare by content, not by name, so a future
 * duplicate folds in too. Pure; the groups come from `template-presets.ts`.
 */
import { presetTokens, type AppearancePreset } from "../appearance-presets";
import type { TemplatePresetGroup } from "./template-presets";

export interface TemplateThemeRow {
  /** The first template's id and name. */
  id: string;
  name: string;
  /** Its looks, the template as designed first. */
  presets: readonly AppearancePreset[];
  /** The other templates with the same looks, by name. */
  also: readonly string[];
}

/** A value with its object keys sorted, so two looks written in another key order compare equal. */
const sorted = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(sorted);
  if (typeof v !== "object" || v === null) return v;
  const o = v as Record<string, unknown>;
  return Object.fromEntries(Object.keys(o).sort().map((key) => [key, sorted(o[key])]));
};

/** What a look is, as text: its tokens, corners, style, background and what it writes into the widgets. */
export const lookKey = (p: AppearancePreset): string =>
  JSON.stringify(sorted({ tokens: presetTokens(p), radius: p.radius, style: p.style, background: p.background ?? null, zoneLook: p.zoneLook ?? null }));

/** The template rows, in catalog order, a template whose looks all match an earlier one's folded into it. */
export function templateThemeRows(groups: readonly TemplatePresetGroup[]): TemplateThemeRow[] {
  const rows: TemplateThemeRow[] = [];
  const keys: string[] = [];
  for (const g of groups) {
    const key = g.presets.map(lookKey).join("\n");
    const at = keys.indexOf(key);
    if (at >= 0) rows[at] = { ...rows[at], also: [...rows[at].also, g.name] };
    else {
      keys.push(key);
      rows.push({ id: g.id, name: g.name, presets: g.presets, also: [] });
    }
  }
  return rows;
}

/** A variant's own name ("Amber" of "Terminal · Amber"); a template without variants keeps its name. */
export const variantName = (p: Pick<AppearancePreset, "name">): string => p.name.split(" · ")[1] ?? p.name;

/** Whether a theme is light: its page color's lightness over half (the Light filter). */
export function isLightTheme(p: Pick<AppearancePreset, "theme">): boolean {
  const l = Number.parseFloat(presetTokens(p).background.split(" ")[2] ?? "");
  return Number.isFinite(l) && l > 50;
}
