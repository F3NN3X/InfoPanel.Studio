// Draws a validated recipe: the root card is the widget shell (`Widget`, so the theme, the material, the pack's T3 tokens
// and slots apply as for a built-in widget) and each block is a core primitive. Colours come from the theme only: its accent,
// its series (a pack's `series-n`, else the theme's palette role) or the status colours by thresholds. Text is sized from the
// zone (`metrics.ts`) and never drawn under 11 px. A Repeat over places draws the server's weather for each place (Weather by
// place, `weather.ts`) with the provider's credit under the card's blocks, where no block can reach it; in the builder's Sample it
// draws the recipe's sample items and says so instead. Format 2's style keys (Phase E) are enums on the theme's own tokens: a text's
// weight and case, an opacity step (a text never under 4.5:1 on its card, `opacity.ts`), a nested card's surface and padding, the root's
// spacing, a gauge's sweep and a bar's height; each unset draws as before. Phase F: a Repeat over the drives, cores, fans, adapters
// or GPUs the readings name (`sources.ts`), and a grid whose cells are its blocks and its Repeat's items. Builder plan Phase 5 and 6
// (format 2): a grid's tracks and its blocks' areas in them (a later block over an earlier one), background layers under a container's
// blocks, a block's part of its column's width or its row's height, a condition on a reading, and a motion (a fade in, a pulse while
// critical), which the app's reduced-motion rules turn off.
import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useElementSize } from "@/hooks/use-element-size";
import { weatherKind } from "@/lib/weather-icons";
import type { ModuleSettings } from "@/modules/types";
import { Bar, Empty, fmt, get, heat, hue, hw, num, Num, pretty, Ring, shell, shortLabel, Spark, TONES, tone, useHistory, Widget, WeatherGlyph, type ShellProps, type Tone } from "../kit";
import { convertValue, readingUnit, type ConvertUnit } from "./convert";
import { cellsOf, TEXT_FLOOR, textPx } from "./metrics";
import { followed, oneOf, wholeIn } from "./follow";
import { drawnStep } from "./opacity";
import { expandKey } from "./reads";
import { DEVICE_ITEMS_MAX, deviceItems, isDeviceSource } from "./sources";
import { keyOf } from "./store";
import type { BackgroundLayer, Binding, Block, CardBlock, Cells, Condition, GridBlock, OpacityStep, Place, Recipe, RecipeColour, RepeatBlock, RepeatDirection, TextColour, TextWeight, Thresholds, WeatherUnits } from "./types";
import { placesOf, sizeHolds } from "./validate";
import { ATTRIBUTION, HOURS_DEFAULT, HOURS_MAX, inUnits, type Item, LICENCE, liveItem, placeState } from "./weather";

export interface RecipeViewProps extends ShellProps {
  look?: ModuleSettings;
  recipe: Recipe;
  /** The placement's stored values (its options among them). */
  saved?: ModuleSettings;
  /** Draw the recipe's sample readings instead of the live ones (the builder's Sample, tests). */
  sample?: boolean;
  /** Pictures by package path that the server has not got yet (a builder draft's, as object URLs). */
  images?: Readonly<Record<string, string>>;
}

interface Ctx {
  recipe: Recipe;
  data: ShellProps["data"];
  names?: Record<string, string>;
  values: Record<string, unknown>;
  item?: Item;
  /** The card's content box: every text size is taken from it. */
  w: number;
  h: number;
  /** The card's size in nominal cells, for size conditions (undefined until measured: they hold). */
  cells?: Cells;
  t3?: Record<string, string | number>;
  saved?: ModuleSettings;
  /** The recipe's sample data is drawn (the builder's Sample, tests), not the live readings. */
  sample?: boolean;
  images?: Readonly<Record<string, string>>;
}

const RecipeCtx = createContext<Ctx | null>(null);
const useCtx = (): Ctx => useContext(RecipeCtx)!;

/** The option values of a placement: each option's default under the stored value (a place list is stored as JSON text). */
export function optionValues(recipe: Recipe, saved: ModuleSettings | undefined): Record<string, unknown> {
  return Object.fromEntries(recipe.options.map((o) => {
    const v = saved?.[o.key];
    const stored = o.type === "place-list" ? placesOf(v) : v;
    return [o.key, stored === undefined || (o.type === "place-list" && !Array.isArray(stored)) ? o.default : stored];
  }));
}

/** What a binding reads: the raw value, its number, its unit, the sensor key it came from (if any) and the device a key named. */
interface Reading {
  raw: unknown;
  value: number;
  unit: string;
  key?: string;
  device?: string;
}

function read(b: Binding | undefined, ctx: Ctx): Reading {
  let raw: unknown;
  let key: string | undefined;
  let device: string | undefined;
  if (!b) raw = undefined;
  else if ("sensor" in b) {
    ({ key, device } = b.sensor.includes("{") ? expandKey(ctx.recipe, b.sensor, ctx.values, ctx.data) : { key: b.sensor });
    raw = key ? get(ctx.data, key, "") : "";
  }
  else if ("option" in b) {
    const v = ctx.values[b.option];
    const sensorOption = ctx.recipe.options.find((o) => o.key === b.option)?.type === "sensor";
    [raw, key] = sensorOption ? [get(ctx.data, String(v ?? ""), ""), String(v ?? "")] : [v, undefined];
  } else raw = ctx.item?.[b.field];
  const value = typeof raw === "number" ? raw : num(raw);
  const unit = typeof raw === "string" ? readingUnit(key, raw) : "";
  return { raw, value, unit, key, device };
}

/** A reading shown in another unit of its family ("Show in", `convert.ts`); as it is read when it has no number or is of another family. */
function inUnit(r: Reading, to: ConvertUnit | undefined): Reading {
  const v = to && Number.isFinite(r.value) ? convertValue(r.value, r.unit, to) : undefined;
  return v === undefined ? r : { ...r, raw: v, value: v, unit: to! };
}

/**
 * Whether a block shows: its option part holds for the placement's values, its size part for the card's size, and its reading part
 * (`number`: what a binding reads now) for the reading; a reading with no number never holds. Without `number` the reading part holds.
 */
export const holds = (when: Condition | undefined, values: Record<string, unknown>, cells: Cells | undefined, number?: (b: Binding) => number): boolean =>
  !when ||
  ((when.option === undefined || ((when.is === undefined || values[when.option] === when.is) && (when.not === undefined || values[when.option] !== when.not))) &&
    (!cells || sizeHolds(when, cells)) &&
    (!when.reading || !number || readingHolds(when.reading, number(when.reading.bind))));

/** A reading condition against the number read: over `above`, under `below`, at `equals`; never without a number. */
export const readingHolds = (r: NonNullable<Condition["reading"]>, v: number): boolean =>
  Number.isFinite(v) && (r.equals === undefined || v === r.equals) && (r.above === undefined || v > r.above) && (r.below === undefined || v < r.below);

/** A series colour: the pack's `series-n`, else the theme's palette role (`s<n>`), else the accent turned round the wheel. */
function seriesInk(n: number, ctx: Ctx): string {
  const own = ctx.t3?.[`series-${n}`] || ctx.saved?.[`s${n}`];
  return typeof own === "string" && own ? own : hue((n - 1) * 60);
}

/** The level a value is at: from the warning and critical levels up, or with `low` from them down (a battery, free space). */
function level(value: number, t: Thresholds | undefined): Tone {
  if (!t?.low) return tone(value, t?.warn, t?.crit);
  return Number.isFinite(value) && value <= t.crit ? "crit" : Number.isFinite(value) && value <= t.warn ? "warn" : "ok";
}

/** The theme's text colours (a Value's number, a ring's centre value): `fg` is the number as the theme draws it (a skin's fill too), as unset. */
const TEXT_INK: Record<TextColour, string | undefined> = { fg: undefined, muted: "var(--w-muted)" };

/** A block's colour: `color` for a stroke or fill when it names one, `t` the tone (thresholds) otherwise. */
function inkOf(c: RecipeColour | TextColour | undefined, value: number, thresholds: Thresholds | undefined, ctx: Ctx): { color?: string; t: Tone } {
  if (c === "thresholds") return { t: level(value, thresholds) };
  if (c?.startsWith("series-")) return { color: seriesInk(Number(c.slice(7)), ctx), t: "ok" };
  return { t: "ok" };
}

/** A card's sub-title: the reading's name, else the device a key named (a device option), else the value itself. */
function subtitleOf(b: Binding | undefined, ctx: Ctx): string | undefined {
  const sub = b ? read(b, ctx) : undefined;
  const found = sub?.key ? hw({ [sub.key]: "" }) : undefined;
  const device = sub?.device ?? found?.cpu ?? found?.gpu;
  const named = sub?.key && ctx.names?.[sub.key] ? ctx.names[sub.key] : device ? pretty(device) : undefined;
  return named ? shortLabel(named).model || named : sub && sub.raw !== "" && sub.raw !== undefined ? String(sub.raw) : undefined;
}

const decimalsOf = (v: number, own: number | undefined): number => own ?? (Math.abs(v) < 10 ? 1 : 0);
const shown = (r: Reading, decimals?: number): string => (Number.isFinite(r.value) && (typeof r.raw === "number" || /^-?\d/.test(String(r.raw).trim())) ? fmt(r.value, decimalsOf(r.value, decimals)) : r.raw === undefined || r.raw === "" ? "–" : String(r.raw));

/** A text's weight (unset: the theme's regular, or a number's own). */
const WEIGHT: Record<TextWeight, number> = { medium: 500, semibold: 600 };

/**
 * A text faded to an opacity step: drawn at the lowest step from it that keeps 4.5:1 on the card under it, on the Look and surface it
 * is drawn on (`drawnStep`), measured after every render, before paint. The step drawn is written on the element for the builder.
 * `inside` picks the text within `ref` (a ring's centre value).
 */
function useReadable(ref: RefObject<HTMLElement | null>, want: OpacityStep | undefined, inside?: string): void {
  useLayoutEffect(() => {
    const el = inside ? ref.current?.querySelector<HTMLElement>(inside) : ref.current;
    if (!el) return;
    const step = want ? drawnStep(el, want) : 100;
    el.style.opacity = step === 100 ? "" : String(step / 100);
    if (want) el.dataset.recipeOpacity = String(step);
    else delete el.dataset.recipeOpacity;
  });
}

/** A mark at its opacity step, as it is (a whole element; a ring's arc only, so its track and centre value stay). */
const FADE: Record<OpacityStep, string> = { 80: "opacity-80", 60: "opacity-60", 40: "opacity-40" };
const ARC_FADE: Record<OpacityStep, string> = { 80: "[&_[data-wp-ring]]:opacity-80", 60: "[&_[data-wp-ring]]:opacity-60", 40: "[&_[data-wp-ring]]:opacity-40" };
const FILL_FADE: Record<OpacityStep, string> = { 80: "[&>*]:opacity-80", 60: "[&>*]:opacity-60", 40: "[&>*]:opacity-40" };

/** A bar's height: S, M (unset, as before) or L. */
const BAR_HEIGHT = { s: "h-1", m: "h-2", l: "h-3.5" } as const;
/** The root card's and a grid's room between their blocks (px): normal is 6, as before. */
const SPACING = { tight: 2, normal: 6, roomy: 12 } as const;
/** A nested card's padding (px); unset is M, its `p-2` (8 px) as before. */
const PADDING = { none: 0, s: 4, l: 12 } as const;

/**
 * A nested card's ground from the theme's text colour: the track tint (unset, as before), none, or raised: a stronger tint (in srgb, so
 * the opacity clamp can read it), an edge of the text colour and the design system's shade under it, so it reads lifted off the card on
 * a dark card (lighter) and on a light one (an edge and a shadow).
 */
function surfaceOf(surface: CardBlock["surface"]): { className: string; style: CSSProperties } {
  if (surface === "none") return { className: "", style: {} };
  if (surface === "raised") return { className: "shadow-md ring-1 ring-inset ring-[color:var(--w-fg)]/15", style: { background: "color-mix(in srgb, var(--w-fg) 11%, transparent)" } };
  return { className: "", style: { background: "var(--w-track)" } };
}

/** The blocks whose height is their text's or glyph's, not a share of a column's (B16). */
const ONE_LINE = new Set<Block["type"]>(["label", "value", "weather-icon"]);

/**
 * The share a child takes of its row. A weather icon keeps its glyph's width (its size is the text scale's, not the cell's); every
 * other block shrinks to its cell. In a column, a line of text (a label, a value, a weather icon) takes its own height unless it is
 * given a share, so a column of lines stays together (B16: "City and condition" was spread over the card's height, each line at
 * the top of an equal share); the column centres the lines in the room they leave.
 */
const grow = (b: Block, direction: "row" | "column"): CSSProperties =>
  ownLine(b, direction) ? { flex: "0 0 auto", minWidth: 0 } : { flex: `${b.grow ?? 1} 1 0`, minWidth: b.type === "weather-icon" ? "auto" : 0, minHeight: 0 };

/** A line of text in a column with no share given: it takes its own height, not a share (B16; the builder's share handles skip it). */
export const ownLine = (b: Block, direction: "row" | "column"): boolean => direction === "column" && b.grow === undefined && ONE_LINE.has(b.type);

/** A block's place in the tree, its child indices from the root card's ("0.1"): the builder finds a block's box by it. */
const at = (path: string, k: number): string => (path ? `${path}.${k}` : String(k));

/** A block's part of its column's width or its row's height (`fill`), at the start, centre or end of what is left (`place`). */
const PLACE = { start: "flex-start", center: "center", end: "flex-end" } as const;
const fillOf = (b: Block, direction: "row" | "column"): CSSProperties | undefined =>
  b.fill === undefined ? undefined : { [direction === "column" ? "width" : "height"]: `${Math.round(b.fill * 1000) / 10}%`, alignSelf: PLACE[b.place ?? "start"] };

/** The blocks whose reading has warning levels (a pulse follows them). */
const LEVELLED = new Set<Block["type"]>(["value", "ring", "gauge", "bar", "sparkline"]);

/** A block's motion as a class: a fade in as it shows, a pulse while its reading is critical (both `index.css`, off with reduced motion). */
function motionOf(b: Block, ctx: Ctx): string {
  if (b.motion === "fade-in") return "recipe-fade-in";
  if (b.motion !== "pulse" || !LEVELLED.has(b.type) || !("bind" in b)) return "";
  const t = (b as { thresholds?: Thresholds }).thresholds;
  const r = inUnit(read(b.bind, ctx), (b as { convert?: ConvertUnit }).convert);
  return t && level(r.value, t) === "crit" ? "recipe-pulse" : "";
}

/** A container's blocks that show now, by kind: its background layers and its content, each with its index. */
function shownOf(blocks: Block[], ctx: Ctx): { layers: (readonly [Block, number])[]; content: (readonly [Block, number])[] } {
  const shown = blocks.map((b, k) => [b, k] as const).filter(([b]) => holds(b.when, ctx.values, ctx.cells, (bind) => read(bind, ctx).value));
  return { layers: shown.filter(([b]) => b.background), content: shown.filter(([b]) => !b.background) };
}

/** A picture background's fit as an image's `object-fit`. */
const OBJECT_FIT: Record<NonNullable<BackgroundLayer["fit"]>, CSSProperties["objectFit"]> = { cover: "cover", contain: "contain", stretch: "fill", center: "none" };

/**
 * A container's content over its background layers (builder plan Phase 5 A): each layer fills the container less its inset, at its
 * opacity (and a picture's blur), in its order, under every block of the content. With no layer the content is drawn as before.
 */
function Layered({ layers, path, children }: { layers: (readonly [Block, number])[]; path: string; children: ReactNode }) {
  const ctx = useCtx();
  if (!layers.length) return children;
  return (
    <div className="relative h-full w-full min-h-0 min-w-0">
      {layers.map(([b, k]) => {
        const bg = b.background!;
        return (
          <div key={k} data-recipe-block={b.type} data-recipe-path={at(path, k)} data-recipe-layer="background" className={`absolute flex min-h-0 min-w-0 overflow-hidden ${motionOf(b, ctx)}`.trim()} style={{ inset: bg.inset ?? 0, opacity: bg.opacity ? bg.opacity / 100 : undefined, filter: bg.blur ? `blur(${bg.blur}px)` : undefined }}>
            <BlockView b={b} path={at(path, k)} />
          </div>
        );
      })}
      {/* the content stays clickable where it draws; between its blocks a click reaches the layers under it */}
      <div className="pointer-events-none relative h-full w-full min-h-0 min-w-0 [&_[data-recipe-path]]:pointer-events-auto">{children}</div>
    </div>
  );
}

function Blocks({ blocks, path, direction = "column", gap = 6, align }: { blocks: Block[]; path: string; direction?: "row" | "column"; gap?: number; align?: string }) {
  const ctx = useCtx();
  const { layers, content: shownBlocks } = shownOf(blocks, ctx);
  // Each block's cell stretches across the row, so a block that fills its cell (a column of labels, a sparkline) has a definite
  // size; `align` places the block inside its cell instead.
  const place = align === "center" ? "center" : align === "end" ? "flex-end" : align === "start" ? "flex-start" : undefined;
  const cell: CSSProperties | undefined = place && (direction === "row" ? { alignItems: place } : { justifyContent: place });
  return (
    <Layered layers={layers} path={path}>
      <div className="flex h-full w-full min-h-0 min-w-0" style={{ flexDirection: direction, gap, justifyContent: direction === "column" ? "safe center" : undefined }}>
        {shownBlocks.map(([b, k]) => (
          <div key={k} data-recipe-block={b.type} data-recipe-path={at(path, k)} className={`flex min-h-0 min-w-0 ${motionOf(b, ctx)}`.trim()} style={{ ...grow(b, direction), ...cell, ...fillOf(b, direction) }}>
            <BlockView b={b} path={at(path, k)} />
          </div>
        ))}
      </div>
    </Layered>
  );
}

function BlockView({ b, path }: { b: Block; path: string }): ReactNode {
  switch (b.type) {
    case "card":
      return <NestedCard b={b} path={path} />;
    case "row":
      return <Blocks blocks={b.children} path={path} direction={b.direction ?? "row"} gap={b.gap} align={b.align} />;
    case "repeat":
      return <RepeatView b={b} path={path} />;
    case "grid":
      return <GridView b={b} path={path} />;
    case "ring":
    case "gauge":
      return <RingView b={b} />;
    case "bar":
      return <BarView b={b} />;
    case "sparkline":
      return <SparkView b={b} />;
    case "value":
      return <ValueView b={b} />;
    case "label":
      return <LabelView b={b} />;
    case "weather-icon":
      return <WeatherView b={b} />;
    case "image":
      return <ImageView b={b} />;
    case "heatmap":
      return <HeatmapView b={b} />;
  }
}

function NestedCard({ b, path }: { b: Extract<Block, { type: "card" }>; path: string }) {
  const ctx = useCtx();
  const subtitle = subtitleOf(b.subtitle, ctx);
  const surface = surfaceOf(b.surface);
  return (
    <div className={`flex h-full w-full min-h-0 flex-col gap-1 rounded-lg ${b.padding ? "" : "p-2"} ${surface.className}`.trim()} style={{ ...surface.style, ...(b.padding ? { padding: PADDING[b.padding] } : null) }}>
      {(b.title || subtitle) && (
        <span className="flex min-w-0 items-baseline gap-[0.4em] text-[color:var(--w-muted)]" style={{ fontSize: textPx(0.85, ctx.w, ctx.h) }}>
          {b.title && <span className="shrink-0 truncate">{b.title}</span>}
          {subtitle && <span data-recipe-subtitle="" className="min-w-0 truncate text-[color:var(--w-faint)]">{subtitle}</span>}
        </span>
      )}
      <div className="min-h-0 flex-1">
        <Blocks blocks={b.children} path={path} />
      </div>
    </div>
  );
}

function RingView({ b }: { b: Extract<Block, { type: "ring" | "gauge" }> }) {
  const ctx = useCtx();
  const r = inUnit(read(b.bind, ctx), b.convert);
  const min = b.min ?? 0;
  const max = b.max ?? 100;
  const ink = inkOf(b.color, r.value, b.thresholds, ctx);
  const px = textPx(b.scale ?? 1.6, ctx.w, ctx.h);
  const box = useRef<HTMLDivElement>(null);
  // the centre value is a text, kept readable; the arc is a mark, at its step as it is
  useReadable(box, b.opacity, "[data-part='num']");
  return (
    <div ref={box} className="flex h-full w-full items-center justify-center">
      <Ring value={r.value - min} max={max - min} t={ink.t} color={ink.color} thickness={b.thickness} sweep={b.type === "gauge" ? (b.sweep ?? 270) : undefined} className={`h-full max-w-full ${b.opacity ? ARC_FADE[b.opacity] : ""}`}>
        {b.center !== false && (
          <Num className="font-semibold leading-none" style={{ fontSize: px, color: b.tone && TEXT_INK[b.tone] }}>
            {shown(r, b.decimals ?? 0)}
            <span style={{ fontSize: Math.max(11, px * 0.4) }}>{b.unit ?? r.unit}</span>
          </Num>
        )}
      </Ring>
    </div>
  );
}

function BarView({ b }: { b: Extract<Block, { type: "bar" }> }) {
  const ctx = useCtx();
  const r = read(b.bind, ctx);
  const min = b.min ?? 0;
  const max = b.max ?? 100;
  const ink = inkOf(b.color, r.value, b.thresholds, ctx);
  return (
    <div className="flex w-full items-center">
      <Bar value={r.value - min} max={max - min} t={ink.t} color={ink.color} style={b.style ?? "bar"} className={`${BAR_HEIGHT[b.height ?? "m"]} ${b.opacity ? FILL_FADE[b.opacity] : ""}`.trim()} />
    </div>
  );
}

function SparkView({ b }: { b: Extract<Block, { type: "sparkline" }> }) {
  const ctx = useCtx();
  const r = read(b.bind, ctx);
  // the readings a live value keeps (about one a second): the block's window, or the option it follows
  const window = followed(b.window, ctx.values, wholeIn(10, 600), 60);
  const history = useHistory(Array.isArray(r.raw) ? Number.NaN : r.value, window);
  const values = Array.isArray(r.raw) ? (r.raw as number[]) : history;
  const ink = inkOf(b.color, r.value, b.thresholds, ctx);
  return <Spark values={values} min={b.min} max={b.max} color={ink.color ?? (ink.t !== "ok" ? TONES[ink.t] : undefined)} graph={b.style ?? "area"} fill={b.style !== "line"} grid={false} className={`h-full min-h-[12px] w-full ${b.opacity ? FADE[b.opacity] : ""}`.trim()} />;
}

function ValueView({ b }: { b: Extract<Block, { type: "value" }> }) {
  const ctx = useCtx();
  const r = inUnit(read(b.bind, ctx), b.convert);
  const px = textPx(b.scale ?? 1, ctx.w, ctx.h);
  const ink = inkOf(b.color, r.value, b.thresholds, ctx);
  // unset is the text colour (the shell's); an Accent picked is the accent (B19)
  const color = b.color === "fg" || b.color === "muted" ? TEXT_INK[b.color] : b.color === "accent" ? TONES.ok : (ink.color ?? (ink.t !== "ok" ? TONES[ink.t] : undefined));
  // unset: the label at the start and the value at the end; aligned, the two together
  const justify = b.align === "center" ? "center" : b.align === "end" ? "flex-end" : undefined;
  const line = useRef<HTMLDivElement>(null);
  useReadable(line, b.opacity);
  return (
    <div ref={line} className="flex w-full min-w-0 items-baseline gap-[0.6em] whitespace-nowrap leading-none" style={{ fontSize: px, justifyContent: justify, fontWeight: b.weight && WEIGHT[b.weight] }}>
      {b.label && <span className="min-w-0 truncate text-[color:var(--w-muted)]" style={b.case === "upper" ? { textTransform: "uppercase" } : undefined}>{b.label}</span>}
      <Num className={b.label && !b.align ? "ml-auto shrink-0" : "shrink-0"} style={color ? { color } : undefined} weight={b.weight && WEIGHT[b.weight]}>
        {shown(r, b.decimals)}
        {(b.unit ?? r.unit) && <span className="ml-[0.2em] text-[color:var(--w-muted)]" style={{ fontSize: Math.max(11, px * 0.6) }}>{b.unit ?? r.unit}</span>}
      </Num>
    </div>
  );
}

/** A label's size: its scale's, shrunk to fit its line where it would be cut ("Partly cloudy" in a narrow place column), never under
 * the floor; under it the line is cut with an ellipsis as before. */
function useFitPx(want: number, text: unknown) {
  const ref = useRef<HTMLSpanElement>(null);
  const [px, setPx] = useState(want);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = `${want}px`;
    const over = el.clientWidth > 0 && el.scrollWidth > el.clientWidth;
    const next = over ? Math.max(TEXT_FLOOR, Math.floor(((want * el.clientWidth) / el.scrollWidth) * 10) / 10) : want;
    el.style.fontSize = `${next}px`;
    setPx(next);
  }, [want, text]);
  return [ref, px] as const;
}

/** A label's line: its parts in order (a reading with its decimals and its unit, else the reading's), else its text, else its reading. */
function labelText(b: Extract<Block, { type: "label" }>, read1: (bind: Binding) => Reading): string {
  if (b.parts)
    return b.parts
      .map((p) => {
        if ("text" in p) return p.text;
        const r = read1(p.bind);
        const value = shown(r, p.decimals);
        return value === "–" ? value : `${value}${p.unit ?? r.unit}`;
      })
      .join("");
  return b.text ?? (b.bind ? shown(read1(b.bind)) : "–");
}

function LabelView({ b }: { b: Extract<Block, { type: "label" }> }) {
  const ctx = useCtx();
  const text = labelText(b, (bind) => read(bind, ctx));
  const color = b.tone === "muted" ? "var(--w-muted)" : b.tone === "accent" ? "var(--w-accent)" : "var(--w-fg)";
  const [ref, px] = useFitPx(textPx(b.scale ?? 0.85, ctx.w, ctx.h), text);
  useReadable(ref, b.opacity);
  return (
    <span ref={ref} className="block w-full truncate leading-tight" style={{ fontSize: px, color, textAlign: b.align, fontWeight: b.weight && WEIGHT[b.weight], textTransform: b.case === "upper" ? "uppercase" : undefined }}>
      {text}
    </span>
  );
}

function WeatherView({ b }: { b: Extract<Block, { type: "weather-icon" }> }) {
  const ctx = useCtx();
  const r = read(b.bind, ctx);
  const text = typeof r.raw === "string" ? r.raw : undefined;
  return (
    <div className="flex h-full items-center">
      <WeatherGlyph {...weatherKind(text, text)} size={textPx(b.scale ?? 2, ctx.w, ctx.h)} />
    </div>
  );
}

function ImageView({ b }: { b: Extract<Block, { type: "image" }> }) {
  const ctx = useCtx();
  // as a background, its layer's fit (unset: cover) and position (unset: centre)
  const bg = b.background;
  return <img src={ctx.images?.[b.file] ?? `/api/widgets/${keyOf(ctx.recipe.id)}/${b.file}`} alt={b.alt ?? ""} className="h-full w-full min-h-0" style={{ objectFit: bg ? OBJECT_FIT[bg.fit ?? "cover"] : (b.fit ?? "contain"), objectPosition: bg?.position }} />;
}

function HeatmapView({ b }: { b: Extract<Block, { type: "heatmap" }> }) {
  const ctx = useCtx();
  // a field of numbers draws a cell each, a single reading one cell (B25: a number's `map` threw)
  const bound = b.cells ? undefined : read(b.bind, ctx);
  const list = b.cells ? b.cells.map((c) => read(c, ctx).value) : Array.isArray(bound?.raw) ? bound.raw.map(Number) : bound?.raw === undefined || bound.raw === "" ? [] : [bound.value];
  const lo = b.min ?? Math.min(...list.filter(Number.isFinite), 0);
  const hi = b.max ?? Math.max(...list.filter(Number.isFinite), 1);
  const columns = b.columns ?? list.length;
  return (
    <div className={`grid h-full w-full gap-[2px] ${b.opacity ? FADE[b.opacity] : ""}`.trim()} style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))` }}>
      {list.map((v, k) => (
        <span key={k} className="min-h-[6px] rounded-[2px]" style={{ background: Number.isFinite(v) ? (b.color?.startsWith("series-") ? seriesInk(Number(b.color.slice(7)), ctx) : heat(((v - lo) / (hi - lo || 1)) * 100)) : "var(--w-track)", opacity: b.color?.startsWith("series-") ? 0.35 + 0.65 * ((v - lo) / (hi - lo || 1)) : undefined }} />
      ))}
    </div>
  );
}

/** How a Repeat draws its items for a placement: its direction, most shown, forecast hours and units (each fixed or following an option). */
export function repeatShape(b: RepeatBlock, values: Record<string, unknown>): { direction: RepeatDirection; max: number; hours: number; units: WeatherUnits } {
  return {
    direction: followed(b.direction, values, oneOf<RepeatDirection>(["rows", "columns", "grid"]), "rows"),
    // places up to 12 (a place list's cap), devices up to 32; unset shows all of them
    max: isDeviceSource(b.source) ? followed(b.max, values, wholeIn(1, DEVICE_ITEMS_MAX), DEVICE_ITEMS_MAX) : followed(b.max, values, wholeIn(1, 12), 12),
    hours: followed(b.hours, values, wholeIn(1, HOURS_MAX), HOURS_DEFAULT),
    units: followed(b.units, values, oneOf<WeatherUnits>(["metric", "imperial"]), "metric"),
  };
}

/** The places of a Repeat's list option for a placement. */
const placesIn = (over: string, values: Record<string, unknown>): Place[] => (Array.isArray(values[over]) ? values[over] : []) as Place[];

/**
 * A Repeat's items: one per place of its list option. With `live` data, each place's fields from the server's readings; without,
 * the sample fields of its place (by name, else by place). Either way in the units and hours asked for.
 */
export function itemsOf(recipe: Recipe, over: string, values: Record<string, unknown>, how: { live?: ShellProps["data"]; hours?: number; units?: WeatherUnits } = {}): Item[] {
  const places = placesIn(over, values);
  const hours = how.hours ?? HOURS_DEFAULT;
  const units = how.units ?? "metric";
  if (how.live) return places.map((p) => liveItem(how.live, p, hours, units));
  const sample = recipe.sample.items?.[over] ?? [];
  return places.map((p, k) => inUnits({ ...(sample.find((s) => s.name === p.name) ?? sample[k] ?? {}), name: p.name }, hours, units));
}

/**
 * The items a Repeat draws for a placement, cut to its most shown: a device source's from the readings (live, or the recipe's sample
 * readings in the Sample), Weather by place's from its places.
 */
function repeatItems(b: RepeatBlock, ctx: Ctx): Item[] {
  const shape = repeatShape(b, ctx.values);
  const items = isDeviceSource(b.source) ? deviceItems(b.source, ctx.data, ctx.names) : itemsOf(ctx.recipe, b.over ?? "", ctx.values, { live: ctx.sample ? undefined : (ctx.data ?? {}), hours: shape.hours, units: shape.units });
  return items.slice(0, shape.max);
}

/** A Repeat item's blocks: a row across a list's item, a centred column as a grid's cell (a tile). */
function ItemBlocks({ b, path, item, tile }: { b: RepeatBlock; path: string; item: Item; tile?: boolean }) {
  const ctx = useCtx();
  return (
    <RecipeCtx.Provider value={{ ...ctx, item }}>
      <Blocks blocks={b.children} path={path} direction={tile ? "column" : "row"} gap={tile ? 2 : 8} align="center" />
    </RecipeCtx.Provider>
  );
}

function RepeatView({ b, path }: { b: RepeatBlock; path: string }) {
  const ctx = useCtx();
  const shape = repeatShape(b, ctx.values);
  const items = repeatItems(b, ctx);
  const dir = shape.direction;
  const cols = dir === "grid" ? Math.ceil(Math.sqrt(items.length)) : dir === "columns" ? items.length : 1;
  return (
    <div className="grid h-full w-full min-h-0" style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))`, gridAutoRows: "minmax(0, 1fr)" }}>
      {items.map((item, k) => (
        <div key={k} data-recipe-item="" className="min-h-0 min-w-0 px-1 py-1" style={b.dividers && k > 0 ? (dir === "columns" ? { borderLeft: "1px solid var(--w-track)" } : { borderTop: "1px solid var(--w-track)" }) : undefined}>
          <ItemBlocks b={b} path={path} item={item} />
        </div>
      ))}
    </div>
  );
}

/** Columns for `n` cells in a box of `w` × `h`: the count that makes the cells closest to square, 1 to `n`. */
export const autoColumns = (n: number, w: number, h: number): number => (n < 1 ? 1 : Math.max(1, Math.min(n, Math.round(Math.sqrt((n * Math.max(w, 1)) / Math.max(h, 1))))));

/**
 * A grid (Phase F): each child a cell, and each item of a Repeat child a cell of its own (a tile: its blocks in a centred column), so a
 * Repeat over cores fills the grid with a tile per core. Columns are fixed, or as many as make the cells closest to square in the
 * grid's own box (the card's until it is measured). A Repeat's direction and dividers are its list's, not a grid's.
 */
function GridView({ b, path }: { b: GridBlock; path: string }) {
  const ctx = useCtx();
  const box = useElementSize();
  const { layers, content: kids } = shownOf(b.children, ctx);
  const cells = kids.map(([c]) => (c.type === "repeat" ? repeatItems(c, ctx) : undefined));
  const n = cells.reduce((sum, items) => sum + (items ? items.length : 1), 0);
  const cols = b.columns ?? autoColumns(n, box.w || ctx.w, box.h || ctx.h);
  // tracks (Phase 5): each column and row its share; a block with an area spans its tracks, one without takes the next free cell
  const t = b.tracks;
  const tracks = (list: number[]) => list.map((f) => `minmax(0, ${f}fr)`).join(" ");
  const areaOf = (c: Block): CSSProperties | undefined => (t && c.area ? { gridColumn: `${c.area[0]} / span ${c.area[2]}`, gridRow: `${c.area[1]} / span ${c.area[3]}` } : undefined);
  return (
    <Layered layers={layers} path={path}>
    <div ref={box.ref} data-recipe-grid={path} className="grid h-full w-full min-h-0 min-w-0" style={{ gridTemplateColumns: t ? tracks(t.cols) : `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: t ? tracks(t.rows) : undefined, gridAutoRows: "minmax(0, 1fr)", gap: SPACING[b.spacing ?? "normal"] }}>
      {kids.map(([c, k], i) => {
        const items = cells[i];
        return items ? (
          <div key={k} data-recipe-block="repeat" data-recipe-path={at(path, k)} className="contents">
            {items.map((item, j) => (
              <div key={j} data-recipe-item="" className="flex min-h-0 min-w-0">
                <ItemBlocks b={c as RepeatBlock} path={at(path, k)} item={item} tile />
              </div>
            ))}
          </div>
        ) : (
          <div key={k} data-recipe-block={c.type} data-recipe-path={at(path, k)} data-recipe-area={t && c.area ? c.area.join(" ") : undefined} className={`flex min-h-0 min-w-0 ${motionOf(c, ctx)}`.trim()} style={areaOf(c)}>
            <BlockView b={c} path={at(path, k)} />
          </div>
        );
      })}
    </div>
    </Layered>
  );
}

/** The Repeats over places a placement shows: those whose own and every ancestor's condition holds. */
export function weatherShown(root: Block, values: Record<string, unknown>, cells: Cells | undefined): RepeatBlock[] {
  if (!holds(root.when, values, cells)) return [];
  if (root.type === "repeat") return root.source === "weather-by-place" ? [root] : [];
  return "children" in root ? root.children.flatMap((c) => weatherShown(c, values, cells)) : [];
}

/**
 * The line under the blocks while weather by place is shown: the provider's credit (CC BY 4.0) for live data, with how old the
 * oldest answer is when it is late; "Sample weather" for the recipe's sample. Drawn by the renderer outside the block tree, so no
 * block, condition or option of a recipe can hide it; it wraps rather than cuts off.
 */
function WeatherFooter({ repeats }: { repeats: RepeatBlock[] }) {
  const ctx = useCtx();
  if (!repeats.length) return null;
  if (ctx.sample)
    return (
      <span data-recipe-sample="" className="block shrink-0 text-right leading-tight text-[color:var(--w-faint)]" style={{ fontSize: 11 }}>
        Sample weather
      </span>
    );
  const states = repeats.flatMap((b) => placesIn(b.over ?? "", ctx.values).slice(0, repeatShape(b, ctx.values).max)).map((p) => placeState(ctx.data, p));
  const late = Math.max(0, ...states.filter((s) => s.status === "stale" && Number.isFinite(s.age)).map((s) => s.age));
  const none = states.length > 0 && states.every((s) => s.status === "" || s.status === "waiting" || s.status === "error");
  return (
    <span data-recipe-attribution="" className="block shrink-0 text-right leading-tight text-[color:var(--w-muted)]" style={{ fontSize: 11 }}>
      {ATTRIBUTION} · {LICENCE}
      {none ? " · no weather data yet" : late > 0 ? ` · ${late} min old` : ""}
    </span>
  );
}

/** The recipe drawn in the widget shell. */
export default function RecipeView(p: RecipeViewProps) {
  const { recipe } = p;
  const data = p.sample ? Object.fromEntries(Object.entries(recipe.sample.sensors).map(([k, v]) => [k, String(v)])) : p.data;
  const values = optionValues(recipe, p.saved);
  const root = recipe.root;
  const base: Omit<Ctx, "w" | "h"> = { recipe, data, names: p.names, values, t3: p.t3, saved: p.saved, sample: p.sample, images: p.images };
  const subtitle = subtitleOf(root.subtitle, { ...base, w: 0, h: 0 });
  return (
    <Widget {...shell(p)} title={p.title ?? root.title ?? recipe.name} icon={root.icon ?? recipe.icon ?? "dashboard"} design={null} right={subtitle ? <span className="truncate text-[color:var(--w-muted)]">{subtitle}</span> : undefined}>
      {({ w, h, outerW, outerH }) =>
        root.children.length ? (
          <RecipeCtx.Provider value={{ ...base, w, h, cells: cellsOf(outerW, outerH) }}>
            <div data-recipe={recipe.id} className="flex h-full w-full min-h-0 flex-col">
              <div className="min-h-0 flex-1">
                <Blocks blocks={root.children} path="" gap={SPACING[root.spacing ?? "normal"]} />
              </div>
              <WeatherFooter repeats={weatherShown(root, values, cellsOf(outerW, outerH))} />
            </div>
          </RecipeCtx.Provider>
        ) : (
          <Empty icon="dashboard" label="Empty recipe" large />
        )
      }
    </Widget>
  );
}
