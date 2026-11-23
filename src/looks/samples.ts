// The sample themes (P3b) as Looks of the registry (L32): built from their data and cards, in the chunk `loadLook`
// imports, so neither the kiosk nor the studio entry carries them. Level 1 only: T1, one T2 card, fonts and corners.
import type { PageBackground } from "@/lib/appearance";
import type { Look, LookMode, T1Entry, T1Name } from "./look";
import { SAMPLE_MATERIALS } from "./sample-materials";
import { SAMPLE_THEMES, type SampleTheme } from "./sample-themes";
import { STATUS_MODE } from "./status";

const pageColour = (page: PageBackground): string =>
  page.type === "color" && page.color ? page.color : page.type === "gradient" && page.gradient ? page.gradient.from : "#000000";

/** A sample theme as a Look: its card's tone is its one mode; its status colours are the mockup's, else the mode's own (L33). */
export function sampleLook(t: SampleTheme): Look {
  const card = SAMPLE_MATERIALS[`look-${t.id}`];
  const mode: LookMode = card.tone === "light" ? "light" : "dark";
  const status = { ...STATUS_MODE[mode], ...t.status };
  const v = (value: string): T1Entry => ({ value });
  const t1: Record<T1Name, T1Entry> = {
    bg: v(pageColour(t.page)),
    surface: v(t.colours.card),
    "surface-2": v(t.colours.line),
    fg: v(t.text ?? t.colours.fg),
    "fg-2": v("{fg}"),
    muted: v(t.muted ?? t.colours.sub),
    border: v(t.colours.line),
    "border-soft": v("{border}"),
    accent: v(t.accent),
    "accent-on": v(t.accentOn ?? "{bg}"),
    "accent-hover": v("{accent}"),
    "focus-ring": v("{accent}"),
    ok: v(status.ok),
    warn: v(status.warn),
    crit: v(status.crit),
    info: v(t.status?.info ?? "{accent}"),
  };
  return {
    schema: 1,
    id: t.id,
    name: t.name,
    description: t.blurb,
    tags: ["sample", mode],
    modes: { supported: [mode], stance: "A level 1 sample: one mode, its card's tone." },
    fonts: { body: t.font },
    radius: `${t.radius}rem`,
    t1: { [mode]: t1 },
    t2: { default: card.id, materials: { [card.id]: { kind: card.kind, tone: card.tone, export: card.export ?? null } } },
    ext: {},
    ...(t.variants ? { variants: t.variants } : null),
  };
}

/** The sample Looks by id. */
export const SAMPLE_LOOKS: Record<string, Look> = Object.fromEntries(SAMPLE_THEMES.map((t) => [t.id, sampleLook(t)]));
