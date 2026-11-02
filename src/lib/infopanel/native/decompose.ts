/**
 * The generic decomposer. The shared primitives, and the modules that draw their own values, tag each node that shows a
 * live value with `data-ip-key` (the Data API key) and `data-ip-kind`:
 *  - value: a number or text, read with its box, font, weight, colour and alignment; `-unit`, `-decimals` and `-mul`
 *    say how it is shown where the text alone can't (the precision and unit are otherwise read from the text);
 *  - bar: a meter, with its track and fill colours and its radius; `-max` is its top;
 *  - ring: the value arc of a ring (the circle itself, so its track stays in the picture), with `-start` and `-sweep`;
 *  - graph: a sparkline;
 *  - meter: a segmented level ladder, with `-segments`, `-zones` and `-colors` (the zones' CSS colours, the unlit one last);
 *  - clock: the time or date, with `-format` (.NET), as a Clock or Calendar;
 *  - image: a picture whose URL is a reading (a plugin's art), as an HttpImage over the box it is drawn in;
 *  - table: a plugin's table, as a TableSensor: its header cells carry `data-ip-col` (the plugin's column) and stay in
 *    the picture, its rows start at the first text under them, and `-rows` says how many are shown.
 * Reading a rendered zone gives each tagged node as a native item at its box. The picture of everything else is taken
 * with the tagged nodes hidden (`hideTagged`, visibility only, so nothing moves), so the live values are never baked in.
 * A text reading (a plugin's "9.4 °C") can come out longer than the widget's own formatting of it, so it grows to the
 * right from where the widget's text starts; a graph without a fixed top scales to its readings, as the widget's does.
 */
import { argb, bound, fontSizeOf, make, type ConvertContext, type Rect } from "./items.ts";
import type { DisplayItem } from "../schema.ts";
import { DEFAULT_GAUGE, normalizeGauge } from "../gauges/vector.ts";

export type TaggedKind = "value" | "bar" | "ring" | "graph" | "clock" | "meter" | "image" | "table";

export interface Tagged {
  key: string;
  kind: TaggedKind;
  /** On the zone, in design px. For text, the box of the text itself (its font's line), not of its element. */
  box: Rect;
  fontSize: number;
  color: string;
  bold: boolean;
  /** The first family of the node's font; empty for a generic one. */
  font?: string;
  align?: "left" | "right" | "center";
  /** The text as drawn, to read the precision and unit from. */
  text?: string;
  unit?: string;
  decimals?: number;
  /** Shown value = reading × mul (MHz shown as GHz: 0.001). */
  mul?: number;
  max?: number;
  /** Bar: track colour and corner radius; ring: track colour, stroke px, start and sweep in degrees, round caps. */
  track?: string;
  radius?: number;
  thickness?: number;
  start?: number;
  sweep?: number;
  round?: boolean;
  /** Clock: the .NET format. */
  format?: string;
  /** Meter: its segments, where its warn and hot zones start (%), its zone colours (ok, warn, hot) and which way it fills. */
  segments?: number;
  zones?: [number, number];
  colors?: [string, string, string];
  vertical?: boolean;
  reverse?: boolean;
  /** Table: the plugin's columns in the order drawn, each with its left edge (from the table's) and width; the rows shown. */
  columns?: { index: number; dx: number; w: number }[];
  rows?: number;
}

const KINDS: readonly string[] = ["value", "bar", "ring", "graph", "clock", "meter", "image", "table"];
const GENERIC = /^(system-ui|ui-sans-serif|sans-serif|serif|monospace|ui-monospace|-apple-system|inherit)$/i;

const num = (v: string | undefined): number | undefined => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);

const rectOf = (r: DOMRect | { left: number; top: number; width: number; height: number }, origin: DOMRect, zoom: number): Rect => ({
  x: (r.left - origin.left) / zoom,
  y: (r.top - origin.top) / zoom,
  w: r.width / zoom,
  h: r.height / zoom,
});

/** The box of an element's text (its glyphs' line, as InfoPanel draws text from its top); the element's own box where there is none. */
function textRect(el: Element): DOMRect {
  const own = el.getBoundingClientRect();
  if (typeof document.createRange !== "function") return own;
  const range = document.createRange();
  range.selectNodeContents(el);
  // A state cue before the text (`data-ip-skip`) is not part of the value's box.
  const cues = el.querySelectorAll(":scope > [data-ip-skip]");
  if (cues.length > 0) range.setStartAfter(cues[cues.length - 1]);
  const r = range.getBoundingClientRect?.();
  return r && r.width > 0 && r.height > 0 ? r : own;
}

/** An element's text without its state cues (`data-ip-skip`: the glyph and screen-reader word of a warn or crit tone). */
function valueText(el: Element): string {
  if (!el.querySelector("[data-ip-skip]")) return el.textContent ?? "";
  const copy = el.cloneNode(true) as Element;
  for (const cue of copy.querySelectorAll("[data-ip-skip]")) cue.remove();
  return copy.textContent ?? "";
}

const firstFamily = (css: string): string | undefined => {
  const f = css.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  return f && !GENERIC.test(f) ? f : undefined;
};

/** How the text sits in its column: by its own text-align, else right when it is pushed to its parent's right edge. */
function alignOf(el: HTMLElement, style: CSSStyleDeclaration): Tagged["align"] {
  const a = style.textAlign;
  if (a === "right" || a === "end") return "right";
  if (a === "center") return "center";
  const parent = el.parentElement?.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return parent && parent.width > 0 && r.left - parent.left > 2 && Math.abs(parent.right - r.right) <= 2 ? "right" : "left";
}

/** The first child (or the node) with a background colour that isn't transparent. */
function fillOf(el: Element): string | undefined {
  for (const n of [el, ...el.querySelectorAll("*")]) {
    const bg = getComputedStyle(n).backgroundColor;
    if (bg && bg !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(bg)) return bg;
  }
  return undefined;
}

/** A CSS colour (a var() or color-mix() included) as "rgba(r, g, b, a)", resolved where `inside` is drawn; undefined without a canvas. */
function resolveColor(css: string, inside: Element): string | undefined {
  const probe = document.createElement("i");
  probe.style.cssText = `position:absolute;width:0;height:0;background:${css}`;
  inside.append(probe);
  const computed = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const g = document.createElement("canvas").getContext?.("2d", { willReadFrequently: true });
  if (!g) return undefined;
  g.clearRect(0, 0, 1, 1);
  g.fillStyle = computed;
  g.fillRect(0, 0, 1, 1);
  const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${gr}, ${b}, ${Math.round((a / 255) * 100) / 100})`;
}

/** Where an image is drawn: a contained `<img>` at its picture's own box inside the element, anything else at its box. */
function imageRect(el: HTMLElement): DOMRect | { left: number; top: number; width: number; height: number } {
  const own = el.getBoundingClientRect();
  if (!(el instanceof HTMLImageElement) || !el.naturalWidth || !el.naturalHeight) return own;
  const style = getComputedStyle(el);
  if (style.objectFit !== "contain" && style.objectFit !== "scale-down") return own;
  const s = Math.min(own.width / el.naturalWidth, own.height / el.naturalHeight, style.objectFit === "scale-down" ? 1 : Infinity);
  const w = el.naturalWidth * s;
  const h = el.naturalHeight * s;
  // object-position as a share of the free space ("0% 50%", "left center") or px.
  const at = (v: string | undefined, free: number) =>
    v === "left" || v === "top" ? 0 : v === "right" || v === "bottom" ? free : v?.endsWith("%") ? (parseFloat(v) / 100) * free : v?.endsWith("px") ? parseFloat(v) : free / 2;
  const [px, py] = style.objectPosition.split(/\s+/);
  return { left: own.left + at(px, own.width - w), top: own.top + at(py, own.height - h), width: w, height: h };
}

/** A table: its columns from the header cells (`data-ip-col`), its rows from the first text under them, in that text's font. */
function readTable(el: HTMLElement, base: Tagged, origin: DOMRect, zoom: number): Tagged | null {
  const heads = [...el.querySelectorAll<HTMLElement>("[data-ip-col]")];
  if (heads.length === 0) return null;
  const own = el.getBoundingClientRect();
  const bottom = Math.max(...heads.map((h) => h.getBoundingClientRect().bottom));
  const first = [...el.querySelectorAll<HTMLElement>("*")].find(
    (n) => !n.closest("[data-ip-col]") && n.childElementCount === 0 && (n.textContent ?? "").trim() !== "" && n.getBoundingClientRect().top >= bottom - 1,
  );
  if (!first) return null;
  const top = textRect(first).top;
  const style = getComputedStyle(first);
  const columns = heads
    .map((h) => {
      const r = h.getBoundingClientRect();
      return { index: Number(h.dataset.ipCol), dx: (r.left - own.left) / zoom, w: r.width / zoom };
    })
    .filter((c) => Number.isInteger(c.index) && c.index >= 0)
    .sort((a, b) => a.dx - b.dx);
  return {
    ...base,
    box: rectOf({ left: own.left, top, width: own.width, height: own.bottom - top }, origin, zoom),
    fontSize: parseFloat(style.fontSize) || base.fontSize,
    color: style.color,
    bold: Number(style.fontWeight) >= 600,
    font: firstFamily(style.fontFamily),
    columns,
    rows: num(el.dataset.ipRows),
  };
}

function readOne(el: HTMLElement, origin: DOMRect, zoom: number): Tagged | null {
  const key = el.dataset.ipKey;
  const kind = el.dataset.ipKind;
  if (!key || !kind || !KINDS.includes(kind)) return null;
  const own = el.getBoundingClientRect();
  if (own.width <= 0 || own.height <= 0) return null;
  const style = getComputedStyle(el);
  const base: Tagged = {
    key,
    kind: kind as TaggedKind,
    box: rectOf(own, origin, zoom),
    fontSize: parseFloat(style.fontSize) || 20,
    color: style.color,
    bold: Number(style.fontWeight) >= 600,
    unit: el.dataset.ipUnit,
    decimals: num(el.dataset.ipDecimals),
    mul: num(el.dataset.ipMul),
    max: num(el.dataset.ipMax),
  };
  switch (base.kind) {
    case "value":
    case "clock":
      return {
        ...base,
        box: rectOf(textRect(el), origin, zoom),
        font: firstFamily(style.fontFamily),
        align: alignOf(el, style),
        text: valueText(el),
        ...(el.dataset.ipFormat ? { format: el.dataset.ipFormat } : {}),
      };
    case "bar": {
      // The track is the meter's own background, the fill its first coloured child.
      const meter = el.firstElementChild ?? el;
      const track = getComputedStyle(meter).backgroundColor;
      const fill = [...meter.querySelectorAll("*")].map((n) => getComputedStyle(n).backgroundColor).find((c) => c && c !== "transparent" && !/,\s*0\)$/.test(c));
      return { ...base, color: fill ?? fillOf(el) ?? base.color, track, radius: Math.min(parseFloat(getComputedStyle(meter).borderTopLeftRadius) || 0, own.height / zoom / 2) };
    }
    case "meter": {
      const zones = (el.dataset.ipZones ?? "").split(",").map(Number);
      let raw: string[] = [];
      try {
        raw = JSON.parse(el.dataset.ipColors ?? "[]") as string[];
      } catch {
        raw = [];
      }
      const [ok, warn, hot, unlit] = raw.map((c) => resolveColor(c, el) ?? c);
      return {
        ...base,
        segments: num(el.dataset.ipSegments) ?? 24,
        zones: zones.length === 2 && zones.every(Number.isFinite) ? [zones[0], zones[1]] : [72, 90],
        colors: [ok ?? base.color, warn ?? base.color, hot ?? base.color],
        ...(unlit ? { track: unlit } : {}),
        vertical: el.dataset.ipVertical !== undefined,
        reverse: el.dataset.ipReverse !== undefined,
      };
    }
    case "graph": {
      // The line, not the area under it (a fill path has no stroke).
      const stroke = [...el.querySelectorAll("path, polyline, line")].map((n) => getComputedStyle(n).stroke).find((c) => c && c !== "none" && !c.startsWith("url("));
      return { ...base, color: stroke ?? base.color };
    }
    case "image":
      return { ...base, box: rectOf(imageRect(el), origin, zoom) };
    case "table":
      return readTable(el, base, origin, zoom);
    case "ring": {
      // The value circle in a 100-unit viewBox: its px stroke is the viewBox's scale times its width.
      const svg = el.closest("svg");
      const drawn = svg?.getBoundingClientRect().width ?? 0;
      const scale = drawn > 0 ? drawn / zoom / 100 : 1;
      const thickness = (Number(el.getAttribute("stroke-width")) || 8) * scale;
      const box = rectOf(own, origin, zoom);
      const grow = thickness / 2;
      const track = el.previousElementSibling?.tagName.toLowerCase() === "circle" ? getComputedStyle(el.previousElementSibling).stroke : undefined;
      return {
        ...base,
        box: { x: box.x - grow, y: box.y - grow, w: box.w + thickness, h: box.h + thickness },
        color: getComputedStyle(el).stroke || base.color,
        thickness,
        start: num(el.dataset.ipStart) ?? 0,
        sweep: num(el.dataset.ipSweep) ?? 360,
        round: el.getAttribute("stroke-linecap") === "round",
        ...(track ? { track } : {}),
      };
    }
  }
}

/** Every tagged node under `root`, its box relative to `root` and divided by `zoom` (the studio canvas's CSS zoom). */
export function readTagged(root: Element, zoom = 1): Tagged[] {
  const origin = root.getBoundingClientRect();
  return [...root.querySelectorAll<HTMLElement>("[data-ip-key]")].flatMap((el) => readOne(el, origin, zoom) ?? []);
}

/** For `onCloneEachNode` of the picture: the tagged nodes keep their box but are not drawn; a table's header stays. */
export function hideTagged(cloned: Node): void {
  if (!(cloned instanceof Element)) return;
  const el = cloned as HTMLElement | SVGElement;
  if (el.dataset?.ipKey) el.style.visibility = "hidden";
  else if (el.dataset?.ipCol !== undefined) el.style.visibility = "visible";
}

/** "rgb(r, g, b)" / "rgba(r, g, b, a)" as `#AARRGGBB`. */
export function cssToArgb(css: string): string {
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(css.trim());
  if (!m) return argb(css);
  const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : Number(m[4]);
  const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${hex(a * 255)}${hex(Number(m[1]))}${hex(Number(m[2]))}${hex(Number(m[3]))}`.toUpperCase();
}

/** A CSS colour as InfoPanel's `#AARRGGBB`, or `fallback` when it isn't one (a "none" stroke, a gradient). */
const ink = (css: string, fallback: string): string => {
  const c = cssToArgb(css);
  return /^#[0-9A-F]{8}$/.test(c) ? c : fallback;
};

/** A CSS colour as the vector spec's `#RRGGBB` (its alpha dropped), or null when it can't be read. */
const rgbHex = (css: string | undefined): string | null => {
  if (!css) return null;
  const c = cssToArgb(css);
  return /^#[0-9A-F]{8}$/.test(c) ? `#${c.slice(3)}` : null;
};

/** The precision and the unit the text shows: "1.87 GHz" → 2 and "GHz"; "63°C" → 0 and "°C". */
export function shownAs(text: string): { decimals?: number; unit?: string; thousands?: boolean } {
  const m = /(-?\d{1,3}(?:,\d{3})+|-?\d+)(?:\.(\d+))?(\s*)(.*)$/.exec(text.trim());
  if (!m) return {};
  // The space before the unit is kept: InfoPanel writes the unit straight after the number.
  const unit = m[4].trim();
  return { decimals: m[2]?.length ?? 0, unit: unit ? m[3].replace(/\s+/, " ") + unit : "", ...(m[1].includes(",") ? { thousands: true } : {}) };
}

/**
 * Room for a text that comes out longer than the one measured: a left-aligned one grows to the right as InfoPanel's
 * text does (no Width); a right-aligned one gets `more` of its width again to the left, a centred one half that each side.
 */
function widen(item: DisplayItem, align: Tagged["align"], more = 0.5): DisplayItem {
  const o = item as DisplayItem & { X: number; Width: number };
  if (align === "right") return { ...o, X: Math.round(o.X - o.Width * more), Width: Math.round(o.Width * (1 + more)) } as DisplayItem;
  if (align === "center") return { ...o, X: Math.round(o.X - (o.Width * more) / 2), Width: Math.round(o.Width * (1 + more)) } as DisplayItem;
  return { ...o, Width: 0 } as DisplayItem;
}

/** The native item of one tagged node, bound to its key. */
export function taggedItem(t: Tagged, origin: Rect, ctx: ConvertContext): DisplayItem {
  const box = { x: origin.x + t.box.x, y: origin.y + t.box.y, w: t.box.w, h: t.box.h };
  const name = t.key;
  const font = {
    FontSize: fontSizeOf(t.fontSize),
    Color: ink(t.color, ctx.look.Color),
    Bold: t.bold,
    ...(t.font ? { Font: t.font } : {}),
    Wrap: false,
    Ellipsis: false,
    ...(t.align === "right" ? { RightAlign: true } : t.align === "center" ? { CenterAlign: true } : {}),
  };
  switch (t.kind) {
    case "value": {
      // A text reading (a plugin's "9.4 °C") is shown as InfoPanel has it: no precision or unit to add.
      const text = ctx.sensors[t.key] !== undefined && typeof ctx.sensors[t.key].value !== "number";
      const read = t.text !== undefined && !text ? shownAs(t.text) : {};
      const decimals = text ? undefined : (t.decimals ?? read.decimals);
      const unit = text ? undefined : (t.unit ?? read.unit);
      const item = make("Sensor", ctx, box, name, {
        ...font,
        ...(decimals !== undefined ? { OverridePrecision: true, Precision: decimals } : {}),
        ...(unit ? { OverrideUnit: true, Unit: unit, ShowUnit: true } : { ShowUnit: false }),
        ...(read.thousands ? { ShowThousandsSeparator: true } : {}),
        ...(t.mul !== undefined && t.mul !== 1 ? { MultiplicationModifier: t.mul } : {}),
      });
      // A plugin's text can run longer than the widget's own formatting of it: right-aligned, it grows to the right from
      // where the widget's text starts (into the gap after it, not over the icon or label before it).
      if (text && t.align === "right") return bound({ ...item, RightAlign: false, Width: 0 } as DisplayItem, t.key, ctx);
      return bound(widen(item, t.align, text ? 1.5 : 0.5), t.key, ctx);
    }
    case "clock": {
      const date = t.key === "date";
      return widen(make(date ? "Calendar" : "Clock", ctx, box, date ? "Date" : "Time", { ...font, Uppercase: false, ...(t.format ? { Format: t.format } : {}) }), t.align);
    }
    case "bar":
      return bound(
        make("Bar", ctx, box, name, {
          MinValue: 0,
          MaxValue: t.max ?? 100,
          Color: ink(t.color, ctx.palette.accent1),
          ...(t.track && ink(t.track, "") ? { Background: true, BackgroundColor: ink(t.track, "") } : {}),
          CornerRadius: Math.round(t.radius ?? 0),
          Gradient: false,
          Frame: false,
        }),
        t.key,
        ctx,
      );
    case "ring": {
      const fill = rgbHex(t.color) ?? DEFAULT_GAUGE.fill.color;
      const w = Math.max(1, Math.round(box.w));
      const h = Math.max(1, Math.round(box.h));
      // The ring's track is in the picture under it, so the gauge draws the arc alone.
      const vector = normalizeGauge({ ...DEFAULT_GAUGE, width: w, height: h, start: t.start ?? 0, sweep: t.sweep ?? 360, thickness: Math.max(1, Math.round(t.thickness ?? 8)), rounded: t.round ?? true, track: null, fill: { ...DEFAULT_GAUGE.fill, mode: "solid", color: fill } });
      return bound({ ...make("Gauge", ctx, box, name, { MaxValue: t.max ?? 100 }), vector } as unknown as DisplayItem, t.key, ctx);
    }
    case "meter": {
      const [ok, warn, hot] = (t.colors ?? []).map((c) => rgbHex(c) ?? DEFAULT_GAUGE.fill.color);
      const [warnAt, hotAt] = t.zones ?? [72, 90];
      const track = rgbHex(t.track);
      const alpha = t.track ? Number(/,\s*([\d.]+)\)$/.exec(t.track)?.[1] ?? 1) : 1;
      const w = Math.max(1, Math.round(box.w));
      const h = Math.max(1, Math.round(box.h));
      // The whole ladder, unlit segments included, is redrawn: they go from the picture with it.
      const vector = normalizeGauge({
        ...DEFAULT_GAUGE,
        shape: "bar",
        width: w,
        height: h,
        orientation: t.vertical ? "vertical" : "horizontal",
        thickness: t.vertical ? w : h,
        rounded: false,
        radius: 2,
        segments: t.segments ?? 24,
        gap: 2,
        reverse: t.reverse ?? false,
        track,
        ...(track && alpha < 1 ? { trackOpacity: alpha } : {}),
        fill: { ...DEFAULT_GAUGE.fill, mode: "zones", color: ok ?? DEFAULT_GAUGE.fill.color, stops: [{ at: 0, color: ok }, { at: warnAt, color: warn }, { at: hotAt, color: hot }] },
      });
      return bound({ ...make("Gauge", ctx, box, name, { MaxValue: t.max ?? 100 }), vector } as unknown as DisplayItem, t.key, ctx);
    }
    case "graph":
      return bound(
        make("Graph", ctx, box, name, { MinValue: 0, MaxValue: t.max ?? 100, ...(t.max === undefined ? { AutoValue: true } : {}), Color: ink(t.color, ctx.palette.accent1), Background: false, Fill: false }),
        t.key,
        ctx,
      );
    case "image":
      return bound(make("HttpImage", ctx, box, name), t.key, ctx);
    case "table": {
      // InfoPanel puts 10 px between columns: each one's width runs to the next one's left edge.
      const cols = t.columns ?? [];
      const format = cols.map((c, i) => `${c.index}:${Math.max(1, Math.round(i + 1 < cols.length ? cols[i + 1].dx - c.dx - 10 : c.w))}`).join("|");
      return bound(make("TableSensor", ctx, box, name, { ...font, TableFormat: format, ShowHeader: false, MaxRows: t.rows ?? 10, Ellipsis: true }), t.key, ctx);
    }
  }
}

/** The native items of a rendered zone: one per tagged node, in document order, placed on the screen at `origin`. */
export function decompose(root: Element, origin: Rect, ctx: ConvertContext, zoom = 1): DisplayItem[] {
  return readTagged(root, zoom).map((t) => taggedItem(t, origin, ctx));
}
