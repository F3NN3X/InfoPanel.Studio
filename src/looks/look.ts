// The Look file (investigation 9.6, D5): a Look is T0 to T3 values with modes, tags, fonts and corners, written as
// `src/looks/<id>/look.json` against `look.schema.json`. The built-in Studio Look also carries the `studio` block its
// `ui-*` chrome tokens are generated from (D1). Types and the alias resolver only: nothing here reads the DOM.

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
