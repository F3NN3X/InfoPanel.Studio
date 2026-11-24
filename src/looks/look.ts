// The Look file (investigation 9.6, D5): a Look is T0 to T3 values with modes, tags, fonts and corners, written as
// `src/looks/<id>/look.json` against `look.schema.json`. The built-in Studio Look also carries the `studio` block its
// `ui-*` chrome tokens are generated from (D1). Types and the alias resolver only: nothing here reads the DOM.
import { cssColour, toOklch } from "./colour";

/** The T1 semantic names (investigation 9.2): every Look defines or aliases each one, per mode it supports. */
export const T1_NAMES = [
  "bg", "surface", "surface-2", "fg", "fg-2", "muted", "border", "border-soft",
  "accent", "accent-on", "accent-hover", "focus-ring", "ok", "warn", "crit", "info",
] as const;
export type T1Name = (typeof T1_NAMES)[number];

export type LookMode = "dark" | "light";

/** A T1 value: a literal or a `{name}` alias of a T0 or T1 name, and what it is for. */
export interface T1Entry {
  value: string;
  usage?: string;
}

/** A material as a Look names it (T2, investigation 9.3): its recipe kind, text tone and flat export colour. */
export interface LookMaterial {
  kind: "solid" | "gradient" | "glass" | "lcd";
  tone?: "dark" | "light" | "theme" | "auto";
  fill?: string;
  "fill-alpha"?: number;
  "fill-2"?: string;
  "fill-angle"?: string;
  blur?: string;
  "blur-fallback-alpha"?: number;
  border?: string;
  export?: string | null;
}

/** A `ui-*` token of the Studio Look: a literal or a `{t1}` alias, and the `--color-s-*` names that alias it (D2). */
export interface StudioEntry {
  value: string;
  s?: string[];
  usage?: string;
}

/**
 * A named variation of a Look (the Variant knob, D15; theme packs spec `variants`), for example Night and Dusk: a few
 * widget-style values over the Look (accent, surface, radius, padding, gap). Picking it writes them at the level. Every
 * variant of a Look should set the same keys, so one replaces the other.
 */
export interface LookVariant {
  id: string;
  name: string;
  values: Record<string, string | VariantDerive>;
}

/** The keys a variant may set besides the card's: the colours the Look's roles reach (text, secondary text, status, line and glow). */
export const VARIANT_COLOURS = ["accent", "textColor", "mutedColor", "ok", "warn", "crit", "borderColor", "glowColor", "numGlowColor"] as const;
/** The colour keys whose value may carry an alpha (lines and glows are laid over the card, text is not). */
export const VARIANT_ALPHA: readonly string[] = ["borderColor", "glowColor", "numGlowColor"];

/**
 * A colour a variant derives from its accent in OKLCH, so one rule serves every accent (the kit's ink, mute and line colours):
 * the accent with its lightness set (`l`) or raised to at least `lMin`, its chroma set (`c`), scaled (`cMul`) or capped (`cMax`),
 * and an `alpha`. App code resolves it to a real colour before anything reads it, so contrast stays checkable.
 */
export interface VariantDerive {
  from: "accent";
  l?: number;
  lMin?: number;
  c?: number;
  cMul?: number;
  cMax?: number;
  alpha?: number;
}

/** A variant as the knob stores it: every value a colour or number string. */
export interface ResolvedVariant {
  id: string;
  name: string;
  values: Record<string, string>;
}

export interface Look {
  schema: 1;
  id: string;
  name: string;
  description: string;
  tags: string[];
  modes: { supported: LookMode[]; stance?: string };
  fonts: { body: string; mono?: string; display?: string };
  /** The corner radius (CSS length). */
  radius: string;
  t0?: Record<string, string>;
  /** One block per supported mode. */
  t1: Partial<Record<LookMode, Record<T1Name, T1Entry>>>;
  t2?: {
    default: string;
    tones?: Record<string, Record<string, string>>;
    materials?: Record<string, LookMaterial>;
  };
  t3?: Record<string, string | number>;
  export?: { notExported: string[] };
  ext?: Record<string, unknown>;
  /** Its variants (the Variant knob draws only for a Look that has some). */
  variants?: LookVariant[];
  /**
   * The layout variant it draws per widget kind and for the app's alerts and island (`"Calendar": "grid-nav"`, `"alert": "slab"`),
   * one of those `src/widgets/layouts.ts` lists; a kind it does not name draws its standard layout. Read from a pack's Look.
   */
  layouts?: Record<string, string>;
  /** Only the built-in Studio Look: its chrome tokens by group (`shared` also feeds Settings and Help). */
  studio?: Record<string, Record<string, StudioEntry>>;
}

const ALIAS = /^\{([\w.-]+)\}$/;

/** A Look's T1 values for a mode (else its first) with every alias resolved (through T0 and T1; a cycle or a missing name throws). */
export function resolveT1(look: Pick<Look, "t0" | "t1">, mode: LookMode = "dark"): Record<T1Name, string> {
  const block = look.t1[mode] ?? Object.values(look.t1)[0];
  if (!block) throw new Error("a Look needs a t1 block");
  const resolve = (value: string, seen: readonly string[]): string => {
    const name = ALIAS.exec(value)?.[1];
    if (!name) return value;
    if (seen.includes(name)) throw new Error(`alias cycle: ${[...seen, name].join(" > ")}`);
    const next = (block as Record<string, T1Entry | undefined>)[name]?.value ?? look.t0?.[name];
    if (next === undefined) throw new Error(`unknown alias {${name}}`);
    return resolve(next, [...seen, name]);
  };
  return Object.fromEntries(T1_NAMES.map((name) => [name, resolve(block[name].value, [name])])) as Record<T1Name, string>;
}

/** A Studio Look token's CSS value: a `{t1}` alias resolved, a literal as written. */
export const studioValue = (entry: StudioEntry, t1: Record<T1Name, string>): string =>
  entry.value.replace(/^\{([\w-]+)\}$/, (whole, name: string) => (name in t1 ? t1[name as T1Name] : whole));

/** The colour a derive gives from `base` (`#rrggbb`): `#rrggbb`, or `#rrggbbaa` with an alpha; undefined when `base` is not a literal. */
export function deriveColour(base: string, d: VariantDerive): string | undefined {
  const own = toOklch(base);
  if (!own) return undefined;
  const l = Math.max(d.l ?? own.l, d.lMin ?? 0);
  const c = Math.min(d.c ?? own.c * (d.cMul ?? 1), d.cMax ?? Number.POSITIVE_INFINITY);
  const alpha = d.alpha !== undefined && d.alpha < 1 ? ` / ${d.alpha}` : "";
  return cssColour(`oklch(${l.toFixed(4)} ${c.toFixed(4)} ${own.h.toFixed(2)}${alpha})`);
}

/**
 * A variant's values as the Variant knob writes them: an alias read through the Look, an `oklch()` as its `#rrggbb`, and a derived
 * colour worked out from the variant's own accent (else the Look's, in `mode`). A derive that cannot be worked out is left out.
 */
export function resolveVariant(look: Pick<Look, "t0" | "t1" | "modes">, variant: LookVariant, mode: LookMode = look.modes.supported[0]): ResolvedVariant {
  let t1: Partial<Record<string, string>> = {};
  try {
    t1 = resolveT1(look, mode);
  } catch {
    t1 = {};
  }
  const plain = (value: string, depth = 0): string => {
    const name = ALIAS.exec(value)?.[1];
    const next = name === undefined ? undefined : (t1[name] ?? look.t0?.[name]);
    return next === undefined || depth > 4 ? cssColour(value) : plain(next, depth + 1);
  };
  const values: Record<string, string> = {};
  const accent = typeof variant.values.accent === "string" ? plain(variant.values.accent) : t1.accent;
  for (const [key, value] of Object.entries(variant.values)) {
    const out = typeof value === "string" ? plain(value) : accent === undefined ? undefined : deriveColour(accent, value);
    if (out !== undefined) values[key] = out;
  }
  return { id: variant.id, name: variant.name, values };
}

/** A Look's variants as the knob writes them, resolved in its first mode. */
export const resolveVariants = (look: Pick<Look, "t0" | "t1" | "modes" | "variants">): ResolvedVariant[] => (look.variants ?? []).map((v) => resolveVariant(look, v));
