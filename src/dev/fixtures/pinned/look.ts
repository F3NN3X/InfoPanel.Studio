import type { CSSProperties } from "react";
import { CLASSIC, loadLook } from "@/looks";
import { resolveT1, type Look, type LookMode } from "@/looks/look";
import { hue } from "@/widgets/core/tokens";

/*
 * The two Looks every pinned-layer fixture is drawn on (brief §2): Classic, dark, and Paper, a light pack Look. The stage
 * takes its page colour and the chrome tokens the design-only parts read (`--w-fg`, `--w-muted`, `--w-accent`, the status and
 * series colours) from the Look's own T1 and T3 values, so nothing here names a colour.
 */

export const FIXTURE_LOOKS = { classic: "dark", paper: "light" } as const satisfies Record<string, LookMode>;
export type FixtureLook = keyof typeof FIXTURE_LOOKS;
export const isFixtureLook = (v: string | null): v is FixtureLook => !!v && Object.hasOwn(FIXTURE_LOOKS, v);

/** The two panel sizes (brief §2): the 1024 × 600 touch panel and the 1920 × 550 bar. */
export const FIXTURE_SIZES = { "1024x600": { w: 1024, h: 600 }, "1920x550": { w: 1920, h: 550 } } as const;
export type FixtureSize = keyof typeof FIXTURE_SIZES;
export const isFixtureSize = (v: string | null): v is FixtureSize => !!v && Object.hasOwn(FIXTURE_SIZES, v);

/** A Look's data: Classic is in the bundle, Paper loads with its chunk. */
export const fixtureLook = async (id: FixtureLook): Promise<Look> => (id === "classic" ? CLASSIC : ((await loadLook(id)) ?? CLASSIC));

/** The series colours: the Look's T3 `series-n` where it sets one, else the accent turned round the hue circle (as `hue()` draws a second series). */
const SERIES_TURNS = [0, 60, 200, 290, 140, 30];

/** The stage's tokens for a Look in its mode: what the rail, keys and sheets read, and the page colour under everything. */
export function stageVars(look: Look, mode: LookMode): CSSProperties {
  const t1 = resolveT1(look, mode);
  const series = Object.fromEntries(SERIES_TURNS.map((deg, i) => [`--w-series-${i + 1}`, String(look.t3?.[`series-${i + 1}`] || hue(deg))]));
  return {
    "--w-page": t1.bg,
    "--w-card": t1.surface,
    "--w-card-2": t1["surface-2"],
    "--w-fg": t1.fg,
    "--w-muted": t1.muted,
    "--w-faint": `color-mix(in oklab, ${t1.muted} 55%, transparent)`,
    "--w-edge": t1.border,
    "--w-accent": t1.accent,
    "--w-accent-on": t1["accent-on"],
    "--w-focus": t1["focus-ring"],
    "--w-ok": t1.ok,
    "--w-warn": t1.warn,
    "--w-crit": t1.crit,
    ...series,
    background: t1.bg,
    color: t1.fg,
    colorScheme: mode,
  } as CSSProperties;
}
