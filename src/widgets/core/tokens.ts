// Low-level colour tokens shared by surfaces, skins and primitives (no React).
import { accentInk } from "@/looks/status";
// Accent colour-mix: mix(30) → color-mix(in oklab, var(--w-accent) 30%, transparent)
export const mix = (p: number, to = "transparent"): string => `color-mix(in oklab, var(--w-accent) ${p}%, ${to})`;
// Accent-derived hue series: hue(70) → the accent rotated 70° in OKLCH (secondary series)
export const hue = (deg: number): string => (deg ? `oklch(from var(--w-accent) l c calc(h + ${deg}))` : "var(--w-accent)");
// The colour accent as a widget variable. `--accent` stays beside `--w-accent` for one release: custom CSS reads it inside a widget,
// but it is also the shadcn HSL triplet, so only widget roots and widget-like scopes set it as a colour.
export const accentVars = (color: string, tone?: string): Record<string, string> => ({ "--w-accent": tone === "light" ? accentInk(color) : color });
