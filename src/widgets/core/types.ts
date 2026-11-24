// Shared widget-library types.
import type { ComponentType, CSSProperties, ReactNode } from "react";
import type { PackSlots } from "@/looks/pack";
import type { PackDecorSpec } from "@/looks/pack-frame";
import type { ModuleSettings } from "@/modules/types";
import type { SlabPart, SlabRole, SlabTone } from "@/looks/treatments";

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
  /** A pack Look's T3 values and component slots (`usePack`); unset for every other Look. */
  t3?: Record<string, string | number>;
  slots?: PackSlots;
  /** The pack the T3 values and slots come from: the card wears `data-look` so the pack CSS reaches it. */
  packId?: string;
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
  /** Blur the value until hovered (Hide IP). */
  blur?: boolean;
  /** A glyph drawn left of the value in a 2x2 card (about 40px; 52px of the width is kept for it). */
  lead?: ReactNode;
  kind?: "spark" | "bar" | "ring" | "text" | "value";
  /** Nothing to show (no game running): in a tall zone, a centred icon and this text instead of a dash. */
  idle?: string;
  /** The value's InfoPanel tag (`useIpTag`), on the studio canvas only. */
  ip?: Record<string, string | number>;
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
  /** The layouts it offers (first = the default); unset: one implicit view. */
  views?: WidgetView[];
  /** The stored key of the view (default `"view"`; legacy keys such as `playerLayout` keep theirs). */
  viewKey?: string;
}

/** One layout a widget offers: picked in its View control and listed as its own Add-panel entry. */
export interface WidgetView {
  /** The stored value of the view key. */
  id: string;
  name: string;
  blurb?: string;
  tags?: string;
  defaultSize?: [number, number];
  minSize?: [number, number];
  /** Settings the view sets with it (a preset's bundle, e.g. FpsMonitor trend → sparkline: true). */
  applies?: ModuleSettings;
  /**
   * The view's own data prefixes, for a view that draws a merged-away widget as it did (Weather's forecast view is the
   * Forecast widget): its no-data gate and what its zone subscribes to (`placementReads`); empty = any key. Unset: the
   * widget's.
   */
  prefixes?: string[];
  /** A boolean setting the view's own prefixes wait for: off, the zone keeps the widget's (Weather's `emptyCard`). */
  prefixesWhen?: string;
}

/** The tone slabs a Look draws (`slab-*`): each part's role, the ink on a slab, the info tone, the scan-line texture and the notch. */
export interface SlabSpec {
  roles: Partial<Record<SlabPart, SlabRole>>;
  ink: string;
  info: string;
  texture: boolean;
  /** px. */
  notch: number;
  /** The tone of the current row's slab (`slab-current`). */
  current: SlabTone;
}

/** A Look's readouts (`readout-*`): how much larger a hero value may be drawn (it is fitted to its card), its decimals' size, an under-bar. */
export interface ReadoutSpec {
  scale: number;
  decimals: number;
  bar: boolean;
}

/** Skin token keys; all optional. */
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
  /** Numeral outline width (an em length); with `numGlow` it also strengthens the glow. Applied only from 18px up, where the stroke does not clog the counters. */
  numStroke: string;
  /** Numeral advance relative to a normal sans (1); wide display faces set more so fitted numbers still fit. */
  numWide: number;
  glow: boolean;
  graph: string;
  meter: string;
  header: string;
  /** The header title's fill, a CSS gradient or colour (the Look contract's `header-fill`): Synth's neon gradient. */
  headerFill: string;
  /** The header title's ink (`header-color`): Nixie's brass. */
  headerInk: string;
  ring: number;
  /** A frame the shell draws over the card (`CardFrame`): tui's inset border, hud's corner brackets. */
  frame: "inset" | "corners" | "gradient" | "legend";
  /** Gradient number fill (`num-fill: gradient`), a CSS gradient; it replaces the glow, which would draw over transparent text. */
  numFill: string;
  /** The gradient a ring's value arc is stroked with (`ring-fill`), a CSS gradient; an SVG gradient made from its stops. */
  ringFill: string;
  /** The gradient a graph's line is stroked with (`spark-fill`), a CSS gradient. */
  sparkFill: string;
  /** The gradient a bar's fill is painted with in the `ok` tone (`bar-fill`), a CSS gradient. */
  barFill: string;
  /** The colour of the outline a card draws while a control in it has keyboard focus (`focus-outline`). */
  focusOutline: string;
  /** The labels' colour (`label-color`, the card's `--w-faint`): a text role's variable or a colour. */
  labelColor: string;
  /** `series-fill-alpha`: the alpha of a graph's fill at the top, 70 % down and the end, when it is not Classic's. */
  fillAlpha: [number, number, number];
  /** `motion-fast`, `motion-base` and `ease-standard` as CSS: the time and curve of the existing transitions, when the Look's are not Classic's. */
  motionFast: string;
  motionBase: string;
  ease: string;
  /** The gradient border drawn by `frame: "gradient"` (`border-fill`), a CSS gradient. */
  borderFill: string;
  /** The title sits on the frame's border and the card keeps the boxed padding (tui). */
  boxed: boolean;
  /** Readouts (OSD values) use the skin's numeral face, not the mono default (retro, tui). */
  numReadout: boolean;
  /** SystemOverview keeps its sections in one colour instead of one per section (ink). */
  plainSections: boolean;
  /** `num-effect: chromatic`: two offset colour fringes on the numerals. */
  numChroma: boolean;
  /** `label-glow`: a soft accent glow on all of the card's text. */
  labelGlow: boolean;
  /** `cell-radius: 0`: square grid cells (tui, hud, retro); unset keeps the rounded cells. */
  cellSquare: boolean;
  /** `ring-cap`: the ends of a ring's arc (round is the default). */
  cap: "butt";
  /** `series-stroke`: a graph's stroke width when the skin fixes it, whatever the widget asks (ink: a hairline). */
  strokeFixed: number;
  /** Degrees of every ring's arc (`ring-style: arc270` is 270); a `sweep` a widget passes wins. */
  ringArc: number;
  /** A ring cut into 12 segments or 36 ticks (`ring-style`). */
  ringMark: "segmented" | "ticks";
  /** `meter-zone-style: blend`: a ladder's colours run into each other instead of stepping. */
  zones: "blend";
  /** `meter-hold-style`: the peak-hold mark (the line is the default). `block` is the line with square ends instead of round. */
  hold: "dot" | "block";
  /** `spike-shape`: the last-sample mark of a graph (the dot is the default). */
  spike: "tick" | "bar";
  /** `fader-knob-shape`: the mixer fader's knob (the pill is the default). */
  knob: "bar" | "square" | "notch";
  /** `series-1` to `series-6` as CSS colours ("" for one the Look leaves to the widget): what `seriesColour` draws over a widget's own. */
  series: readonly string[];
  /** `meter-ok`: a level meter's colour when the Look's is not Classic's (`meterColour`), over the theme's OK the level rows follow. */
  meterOk: string;
  /** `icon-color`: the icons' colour when the Look's is not Classic's text colour (the weather glyphs). */
  iconColor: string;
  /** `slab-*`: solid tone slabs on headers, chips, tabs, rows or the card. */
  slab: SlabSpec;
  /** `readout-*`: scaled hero values. */
  readout: ReadoutSpec;
  /** `meter-empty`: the colour of a cell meter's unlit cells (`meter-style: cells`) and a ladder's unlit segments. */
  meterEmpty: string;
  /** `meter-peak: hold`: a cell meter keeps its highest cell lit a moment after the value falls. */
  meterPeak: boolean;
  /** `ring-style: hex`: rings are drawn as hexagons. */
  ringShape: "hex";
  /** `graph-grid`: a dashed 0 / 50 / 100 grid on every graph, or none at all (unset: Classic's, in a roomy box). */
  graphGrid: "dashed" | "none";
  /** `graph-lead: square`: a square on a graph's newest sample. */
  graphLead: "square";
  /** `graph-bars: striped`: bar graphs drawn in stripes, the newest bar bright. */
  graphBars: "striped";
  /** `row-style: ruled`: list rows carry `data-part="row"` and a rule under each; a table's head row a tint. */
  rows: "ruled";
  /** `share-style: gapped`: a bar of parts of a whole (`ShareBar`) draws square parts with a gap between them and the rest of its track dim. */
  share: "gapped";
  /** `avatar-shape: hex`: avatars and initials are drawn on a hexagon. */
  avatar: "hex";
}

/** One icon of a Look's icon set: a single path in a viewBox, painted in `currentColor`. */
export interface IconGlyph {
  viewBox: string;
  d: string;
}

export interface SkinPack {
  name: string;
  description: string;
  /** Font catalog ids (`lib/fonts.ts`), loaded by `ensureSkinFonts`. */
  fonts: string[];
  /** The skin's own card is `skin.surface`, a material in `src/looks/materials.ts`. */
  skin: Partial<SkinTokens>;
}

/** What `useSkin()` returns: the skin's tokens plus the resolved graph / meter and the look's factors. */
export interface SkinContext extends Partial<SkinTokens> {
  skin: string;
  graph: string;
  meter: string;
  /** Graph stroke-width multiplier from the `stroke` look key (1 = as designed). */
  stroke: number;
  /** A pack Look that sets its own `ok` (a colour on the card as `--w-ok`): the ok tone of bars and rings draws it instead of the accent. */
  packOk?: boolean;
  /** The card is light or the theme's: status colours go through the shell's `--w-ok/-warn/-crit` (set only there), not the dark literals. */
  shellStatus?: boolean;
  /** Layout gap override in px from the `gap` look key. */
  gap?: number;
  /** The `smoothing` look key is Smooth: graphs, bars and rings glide between samples. */
  smooth?: boolean;
  /** The Look's icon set by Material Symbols name; a name it lacks draws the Classic (lucide) icon. */
  icons?: Record<string, IconGlyph>;
  /** Drawn in an absolute child of the card when set (at most 10 px, inside the padding: `--wp-pad`). */
  ornament?: ComponentType;
  /** A pack's frame and ornaments, drawn by the shell in click-through layers (`PackDecor`). */
  decor?: PackDecorSpec;
  /** Drawn in an absolute child along the card's top edge when set. */
  tabBand?: ComponentType;
}
