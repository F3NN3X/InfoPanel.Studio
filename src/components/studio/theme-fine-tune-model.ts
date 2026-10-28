import type { InheritLevel } from "@/lib/inheritance";
import type { DashboardConfig } from "@/lib/layout";
import type { ThemeState } from "@/lib/theme-apply";
import { critKey, QUANTITIES, SECTION_KEYS, warnKey } from "@/lib/theme-model";
import type { ModuleSettings } from "@/modules/types";
import type { ChipState } from "./inherit-chip";
import { cardInherit, cardSet, dataSet, resetCard, withValuesAt, type ThemeAt, type ThemeCard, type ThemeCardId } from "./theme-cards";
import { THEME_EDITOR_SETTINGS } from "./theme-editor-settings";

/**
 * Theme's fine-tune list as data (handoff SPEC §4.3.2, §4.6): each section's chip from the level's theme snapshot,
 * its one-line summary from the values it shows, and Reset to inherited. Pure.
 */

export interface FineTuneChip {
  state: ChipState;
  from?: InheritLevel;
  fromName?: string;
}

/** Whether the theme applied at the level wrote anything of the card. */
const themeWrote = (card: ThemeCard, state: ThemeState): boolean => {
  const written = state.applied?.values ?? {};
  return card.sections.some((sec) => SECTION_KEYS[sec].some((key) => written[key] !== undefined));
};

/**
 * A section's chip: Changed here where the level holds values of its own (`themeState().own`, or the page font),
 * From theme where it shows what the applied theme wrote, else where it inherits from (All screens: Built-in).
 * A page under its screen's lock is Locked.
 */
export function fineTuneChip(config: DashboardConfig, at: ThemeAt, card: ThemeCard, state: ThemeState): FineTuneChip {
  const inherit = cardInherit(config, at, card);
  if (inherit.state === "locked") return { state: "locked", from: inherit.from, fromName: inherit.fromName };
  const own = card.sections.some((sec) => state.own.includes(sec));
  const theme = themeWrote(card, state);
  if (at.level === "page") {
    if (!cardSet(config, at, card)) return { state: "inherited", from: inherit.from, fromName: inherit.fromName };
    return own || !theme ? { state: "custom", from: inherit.from, fromName: inherit.fromName } : { state: "theme" };
  }
  const profile = at.level === "screen" ? config.profiles.find((p) => p.id === at.profileId) : undefined;
  const font = card.data === "font" && dataSet(config, "font", profile);
  if (own || font) return { state: at.level === "all" ? "base" : "custom", from: inherit.from, fromName: inherit.fromName };
  if (theme) return { state: "theme" };
  return at.level === "all" ? { state: "builtin" } : { state: "inherited", from: "all", fromName: inherit.fromName };
}

/** Whether a chip says Changed here. */
export const changedHere = (chip: FineTuneChip): boolean => chip.state === "custom" || chip.state === "base";

/**
 * Reset to inherited: the card back to what the level inherits (see `resetCard`). At All screens or a screen with a
 * theme applied, its values go back to the theme's, so the section reads From theme again.
 */
export function resetFineTune(config: DashboardConfig, at: ThemeAt, card: ThemeCard, state: ThemeState): DashboardConfig {
  const reset = resetCard(config, at, card);
  if (at.level === "page" || !state.applied) return reset;
  const keys = card.sections.flatMap((sec) => SECTION_KEYS[sec]);
  const theirs = Object.fromEntries(keys.flatMap((key) => (state.applied!.values[key] !== undefined ? [[key, state.applied!.values[key]]] : [])));
  return Object.keys(theirs).length > 0 ? withValuesAt(reset, at, (v) => ({ ...v, ...theirs })) : reset;
}

/* ---------------- summaries ---------------- */

/** A select row's option label for a value ("Auto", "Semibold"), else the value. */
function optionLabel(key: string, value: unknown): string {
  const def = THEME_EDITOR_SETTINGS.find((d) => d.key === key);
  return def?.options?.find((o) => o.value === String(value))?.label ?? String(value);
}

const lower = (key: string, value: unknown) => optionLabel(key, value).toLowerCase();

/** "8 px padding", "auto padding". */
const px = (value: unknown, what: string) => (value === "auto" || value === undefined || value === "" ? `auto ${what}` : `${value} px ${what}`);

/** What a section's summary reads besides its values: the palette's name and the page font's. */
export interface SummaryContext {
  paletteName: string;
  fontLabel: string;
}

/** How many rules a custom CSS holds (one per `{`). */
const ruleCount = (css: unknown): number => (typeof css === "string" ? (css.match(/\{/g) ?? []).length : 0);

/** A section's one-line summary from the values the level shows (SPEC §4.3.2's table). */
export function fineTuneSummary(id: ThemeCardId, v: ModuleSettings, ctx: SummaryContext): string {
  switch (id) {
    case "colors":
      return `${ctx.paletteName} · accent ${typeof v.accent === "string" && v.accent ? v.accent.toUpperCase() : "from palette"}`;
    case "type":
      return `${ctx.fontLabel} · ${lower("fontWeight", v.fontWeight ?? "auto")} weight · glow ${lower("numGlow", v.numGlow ?? "auto")}`;
    case "spacing":
      return `${v.scale ?? 100}% size · ${px(v.padding, "padding")}`;
    case "surface": {
      const surface = v.surface === "auto" ? "Skin's card" : optionLabel("surface", v.surface ?? "glass");
      const blur = v.blur === "auto" || v.blur === undefined ? "auto blur" : `blur ${v.blur} px`;
      const opacity = typeof v.surfaceOpacity === "number" && v.surfaceOpacity < 100 ? ` · ${v.surfaceOpacity}% opacity` : "";
      return `${surface} · ${blur}${opacity}`;
    }
    case "format": {
      const decimals = v.decimals === undefined || v.decimals === "auto" ? "auto" : String(v.decimals);
      const clock = v.clock === undefined || v.clock === "auto" ? "locale clock" : optionLabel("clock", v.clock);
      return `${optionLabel("tempUnit", v.tempUnit ?? "c")} · ${decimals} decimals · ${clock}`;
    }
    case "thresholds": {
      const pair = (q: "load" | "temp") => `${v[warnKey(q)] ?? QUANTITIES[q].warn}/${v[critKey(q)] ?? QUANTITIES[q].crit}`;
      return `Load ${pair("load")} · Temp ${pair("temp")} °C`;
    }
    case "motion": {
      const meters = v.meterBallistics === "vu" ? "VU" : String(v.meterBallistics ?? "peak");
      return `${v.smoothing === "smooth" ? "Smooth" : "Stepped"} graphs · ${meters} meters`;
    }
    case "css": {
      const n = ruleCount(v.customCss);
      return n === 0 ? "No rules" : `${n} ${n === 1 ? "rule" : "rules"}`;
    }
  }
}

/** The fine-tune header: "FINE-TUNE · N CHANGES HERE", or just "FINE-TUNE". */
export const fineTuneHeading = (changed: number): string => (changed === 0 ? "Fine-tune" : `Fine-tune · ${changed} ${changed === 1 ? "change" : "changes"} here`);
