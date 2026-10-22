// Shared widget-library types (docs/redesign/widgets/docs/CLAUDE_CODE.md §6).
import type { CSSProperties, ReactNode } from "react";

export type Data = Record<string, string | { value: string }>;
export type Tier = "xs" | "sm" | "md" | "lg";
export type Shape = "tile" | "strip" | "column" | "box";
export type Tone = "ok" | "warn" | "crit";

export interface ShellProps {
  data: Data;
  /** The sensors' display names by key (`SensorValue.name`); read through `sensorLabel`. */
  names?: Record<string, string>;
  accent?: string;
  surface?: string;
  radius?: number;
  skin?: string;
  graph?: string;
  meter?: string;
  variant?: "default" | "studio";
  size?: Tier | "auto";
  compactView?: "auto" | "off" | "on";
  title?: string;
  showHeader?: boolean;
  className?: string;
  style?: CSSProperties;
}

export interface Compact {
  label?: string;
  value?: string | number;
  unit?: string;
  d?: number;
  sub?: string;
  icon?: string;
  t?: Tone;
  /** Ring / graph colour; replaces the tone's. */
  color?: string;
  pct?: number;
  hist?: number[];
  min?: number;
  max?: number;
  img?: string;
  viz?: (heightClass: string) => ReactNode;
  kind?: "spark" | "bar" | "ring" | "text" | "value";
}

export interface Studio extends Compact {
  live?: boolean;
  right?: ReactNode;
  rows?: { n: string; v: string; pct?: number; dot?: boolean }[];
  meters?: { n: string; v: number }[];
  cells?: number[];
  progress?: { a?: string; b?: string; pct?: number };
}

export interface WidgetMeta {
  id: string;
  name: string;
  category: string;
  icon: string;
  prefixes: string[];
  defaultSize: [number, number];
  minSize: [number, number];
  /** The Add list's one line (≤ 44 characters, sentence case, no full stop); unset: the description's first sentence. */
  blurb?: string;
  /** Space-separated lower-case search synonyms for the Add list; never shown. */
  tags?: string;
  description: string;
}

/** Skin token keys (CLAUDE_CODE §5); all optional. */
export interface SkinTokens {
  surface: string;
  radius: number;
  accent: string;
  font: string;
  num: string;
  numWeight: number;
  numStretch: string;
  numUp: boolean;
  numGlow: boolean;
  /** Numeral advance relative to a normal sans (1); wide display faces set more so fitted numbers still fit. */
  numWide: number;
  glow: boolean;
  graph: string;
  meter: string;
  header: string;
  ring: number;
}

/** A surface as a skin pack declares it: Tailwind classes + inline style. */
export interface SurfaceSpec {
  c: string;
  s: CSSProperties;
}

export interface SkinPack {
  name: string;
  description: string;
  /** Font catalog ids (`lib/fonts.ts`), loaded by `ensureSkinFonts`. */
  fonts: string[];
  skin: Partial<SkinTokens>;
  surfaces: Record<string, SurfaceSpec>;
}

/** What `useSkin()` returns: the skin's tokens plus the resolved graph / meter and the look's factors. */
export interface SkinContext extends Partial<SkinTokens> {
  skin: string;
  graph: string;
  meter: string;
  /** Graph stroke-width multiplier from the `stroke` look key (1 = as designed). */
  stroke: number;
  /** Layout gap override in px from the `gap` look key. */
  gap?: number;
  /** The `smoothing` look key is Smooth: graphs, bars and rings glide between samples. */
  smooth?: boolean;
}
