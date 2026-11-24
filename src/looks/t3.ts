// The T3 data-viz contract (investigation 9.4, D11): every name a Look may set, and the Classic Look's value for each.
// Values are literals, numbers, or `{name}` aliases (a T1 name or another T3 name). `""` means the widget's own
// colour. Nothing here ships in a bundle: the generator (tools/looks/generate.mjs) and the coverage test read it.
import { GLIDE_MS, RAMP_BASE, RING_GAP, RING_T, RING_TRACK } from "./data-viz.ts";
import { STATUS } from "./status.ts";
import { SLAB_INFO_DEFAULT, SLAB_INK_DEFAULT } from "./treatments.ts";

export const T3_TOKENS = [
  "num-family", "num-weight", "hero-weight", "num-tracking", "num-stretch", "num-effect", "num-glow-color", "num-fill",
  "unit-color", "label-case", "label-color", "label-glow",
  "header-style", "header-color", "header-fill",
  "series-1", "series-2", "series-3", "series-4", "series-5", "series-6", "series-fill-alpha", "series-stroke", "series-glow",
  "graph-style", "grid-line", "axis-label",
  "status-ok", "status-warn", "status-crit", "info", "idle", "mute", "accent-ink",
  "meter-ok", "meter-warn", "meter-clip", "meter-track", "meter-style", "meter-zone-style", "meter-hold", "meter-hold-style", "meter-segments", "meter-gap",
  "threshold-line", "threshold-style", "threshold-width", "spike-marker", "spike-shape",
  "range-track", "range-fill", "range-highlight", "range-cap", "range-height",
  "fader-track", "fader-fill", "fader-knob", "fader-knob-shape", "fader-knob-glow", "toggle-on", "mute-active", "solo-active", "live-indicator",
  "icon-color", "icon-muted", "icon-stroke",
  "ramp-heat", "ramp-cool",
  "ring-width", "ring-track", "ring-cap", "ring-gap", "ring-style", "border-fill", "ring-fill", "spark-fill", "bar-fill", "focus-outline",
  "cell-radius", "track",
  "motion-fast", "motion-base", "motion-data", "ease-standard",
  "slab-header", "slab-chip", "slab-tab", "slab-row", "slab-card", "slab-ink", "slab-info", "slab-texture", "slab-notch",
  "readout-scale", "readout-decimals", "readout-bar",
  "meter-empty", "meter-peak", "graph-grid", "graph-lead", "graph-bars", "row-style",
] as const;
export type T3Token = (typeof T3_TOKENS)[number];
export type T3Value = string | number;

/** The names a `{alias}` may point at besides T3 tokens: T1 (investigation 9.2) and the shell's own text and material vars. */
export const T3_ALIAS_ROOTS = ["bg", "surface", "surface-2", "fg", "fg-2", "muted", "faint", "border", "border-soft", "accent", "accent-on", "accent-hover", "focus-ring", "ok", "warn", "crit", "radius", "font.body", "mat.fill"] as const;

/** Classic: today's value for every token (D12). Where the contract default is an alias, Classic keeps the alias unless today differs. */
export const CLASSIC_T3: Record<T3Token, T3Value> = {
  "num-family": "{font.body}", "num-weight": 700, "hero-weight": 700, "num-tracking": "normal", "num-stretch": "normal", "num-effect": "none", "num-glow-color": "{accent}", "num-fill": "solid",
  "unit-color": "{muted}", "label-case": "upper", "label-color": "{faint}", "label-glow": "none",
  "header-style": "inline", "header-color": "{muted}", "header-fill": "none",
  "series-1": "", "series-2": "", "series-3": "", "series-4": "", "series-5": "", "series-6": "", "series-fill-alpha": "0.32 > 0.06 > 0", "series-stroke": 1, "series-glow": "none",
  "graph-style": "area", "grid-line": "{faint} / 22%", "axis-label": "{faint}",
  "status-ok": STATUS.ok, "status-warn": "{warn}", "status-crit": "{crit}", info: "{info}", idle: "{faint}", mute: "{crit}", "accent-ink": "{accent}",
  "meter-ok": "{accent}", "meter-warn": "{warn}", "meter-clip": "{crit}", "meter-track": "{track}", "meter-style": "bar", "meter-zone-style": "hard", "meter-hold": "{fg}", "meter-hold-style": "line", "meter-segments": 24, "meter-gap": 2,
  "threshold-line": "{warn}", "threshold-style": "dashed", "threshold-width": 1, "spike-marker": "{crit}", "spike-shape": "dot",
  "range-track": "{track}", "range-fill": "{fg}", "range-highlight": "{accent}", "range-cap": "round", "range-height": 6,
  "fader-track": "{track}", "fader-fill": "{accent}", "fader-knob": "{fg}", "fader-knob-shape": "pill", "fader-knob-glow": "none", "toggle-on": "{accent}", "mute-active": "{crit}", "solo-active": "{warn}", "live-indicator": "{crit}",
  "icon-color": "{fg}", "icon-muted": "{muted}", "icon-stroke": 2,
  "ramp-heat": `{mat.fill} > {accent}`, "ramp-cool": "{mat.fill} > {accent}",
  "ring-width": RING_T, "ring-track": RING_TRACK, "ring-cap": "round", "ring-gap": RING_GAP, "ring-style": "arc", "border-fill": "none", "ring-fill": "none", "spark-fill": "none", "bar-fill": "none", "focus-outline": "none",
  "cell-radius": "{radius}", track: "rgba(255,255,255,.07)",
  "motion-fast": "150ms", "motion-base": "300ms", "motion-data": `${GLIDE_MS}ms`, "ease-standard": "cubic-bezier(.2,0,0,1)",
  // Component treatments (Cyberspec v2, lane K): Classic draws none of them.
  "slab-header": "none", "slab-chip": "none", "slab-tab": "none", "slab-row": "none", "slab-card": "none", "slab-ink": SLAB_INK_DEFAULT, "slab-info": SLAB_INFO_DEFAULT, "slab-texture": "none", "slab-notch": 0,
  "readout-scale": 1, "readout-decimals": 1, "readout-bar": "none",
  "meter-empty": "{track}", "meter-peak": "none", "graph-grid": "auto", "graph-lead": "none", "graph-bars": "solid", "row-style": "none",
};

/** The CSS of a Classic value: an alias becomes the var a widget reads, with the dark-surface fallback. */
export function cssOf(value: T3Value, fallbacks: Record<string, string> = { warn: STATUS.warn, crit: STATUS.crit }): string {
  return String(value).replace(/\{([\w.-]+)\}/g, (_, name: string) =>
    name === "accent" ? "var(--w-accent)" : name === "mat.fill" ? RAMP_BASE : fallbacks[name] ? `var(--w-${name}, ${fallbacks[name]})` : `var(--w-${name})`,
  );
}
