/**
 * The studio's responsive layout: where the inspector lives, picked from the
 * studio's width (docked beside the canvas, floating over it, or a bottom
 * sheet on a phone), and the zoom that fits the page. Pure, so the shell
 * only measures and renders.
 */

/** Docked: a right column. Floating: a card over the canvas, opened on demand. Sheet: a bottom sheet. */
export type InspectorMode = "docked" | "floating" | "sheet";

/** Below this viewport width the Library's and Gauges' detail panes become bottom sheets (the Gauges editor stacks). */
export const NARROW_PAGE_WIDTH = 900;

/** The window width from which the inspector docks beside the canvas (SPEC §3.5: narrow is below 960 px). */
export const DOCKED_MIN_WIDTH = 960;
/** The window width from which it floats over the canvas (a bottom sheet on a phone, below 600 px). */
export const FLOATING_MIN_WIDTH = 600;

/** The inspector's mode for the window's width; an unmeasured window (0) docks. */
export function inspectorMode(width: number): InspectorMode {
  if (width <= 0 || width >= DOCKED_MIN_WIDTH) return "docked";
  return width >= FLOATING_MIN_WIDTH ? "floating" : "sheet";
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2;
/** The lowest zoom Fit goes to: a phone's canvas is narrower than a 1920 px page at the lowest stop. */
export const FIT_MIN = 0.1;
/** The zoom buttons' stops. */
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * The next zoom stop in `dir`: the first one above `zoom` going in, the last one
 * below it going out (a fitted zoom is rarely on a stop), clamped to the range.
 */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const eps = 1e-6;
  const next =
    dir > 0 ? ZOOM_STEPS.find((s) => s > zoom + eps) : [...ZOOM_STEPS].reverse().find((s) => s < zoom - eps);
  return next ?? (dir > 0 ? ZOOM_MAX : ZOOM_MIN);
}

/**
 * The scroll area's padding around the page (unscaled, 64 / 40 / 96 px): room for the
 * selection chip above, the ruler labels beside and the zoom bar below.
 */
export const CANVAS_PAD_X = 80;
export const CANVAS_PAD_Y = 160;

/** The floating inspector card's width and its inset from the canvas edges (SPEC §3.5). */
export const FLOAT_WIDTH = 280;
export const FLOAT_MARGIN = 10;
/** The width the open floating inspector takes from the canvas (the card, its margin and a gap). */
export const FLOAT_INSET = FLOAT_WIDTH + FLOAT_MARGIN + 10;
/** Extra room over the page for the quick bar (12 + 46 px at the top of the canvas, below the page tabs) and the selection chip under it: about 16 px between them at a height-filling fit. */
export const QUICK_BAR_INSET = 36;

interface Size {
  width: number;
  height: number;
}

/** The profile's page (its design size, the screen): `height` is 0 only when the profile has none. */
export interface PageSize extends Size {
  /** A scroll profile's grid height at its natural size, when known. */
  naturalHeight?: number;
}

/** Extra room over the canvas the page keeps clear of (px, on top of the scroll padding). */
export interface CanvasInset {
  top?: number;
  right?: number;
  bottom?: number;
}

/** The bottom sheet's resting heights. */
export type SheetSnap = "peek" | "half" | "full";
export const SHEET_SNAPS: readonly SheetSnap[] = ["peek", "half", "full"];
/** The lowest a dragged sheet goes. */
export const SHEET_MIN = 70;

/** A snap's height for a canvas area `h` px tall; the peek is shorter with nothing selected. */
export function sheetHeight(snap: SheetSnap, h: number, selected: boolean): number {
  if (snap === "peek") return selected ? 150 : 96;
  if (snap === "half") return Math.min(h - 8, Math.max(320, Math.round(h * 0.56)));
  return Math.max(0, h - 8);
}

/** The snap nearest a dragged height. */
export function nearestSnap(height: number, h: number, selected: boolean): SheetSnap {
  return SHEET_SNAPS.reduce((best, snap) =>
    Math.abs(sheetHeight(snap, h, selected) - height) < Math.abs(sheetHeight(best, h, selected) - height) ? snap : best
  );
}

export interface LayoutInput {
  /** The studio body (below the top bar). */
  body: Size;
  page: PageSize;
  /** Width of the rail. */
  rail: number;
  /** Width of the open left panel (beside the canvas). */
  drawer?: number;
  /** Width of the docked inspector. */
  inspector: number;
  /** The docked inspector is collapsed (its column is gone). */
  collapsed?: boolean;
  /** The floating inspector is open over the canvas. */
  floatOpen?: boolean;
  /** The window's width, which picks the mode; the body's when unknown. */
  windowWidth?: number;
  /** The quick bar is on (docked or floating): the page keeps clear of it. */
  quickBar?: boolean;
  /** The bottom sheet's height (sheet mode): the page keeps clear of it up to the half snap. */
  sheet?: number;
}

export interface StudioLayout {
  mode: InspectorMode;
  /** The canvas scroll box. */
  canvasWidth: number;
  canvasHeight: number;
  /** What the page keeps clear of inside that box. */
  inset: CanvasInset;
  fitZoom: number;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/**
 * The largest zoom at which the page and its padding fit a canvas box, kept
 * clear of `inset`. A page without a height (scroll profile) is fitted to
 * the width only.
 */
export function fitZoomFor(box: Size, page: Size, inset: CanvasInset = {}): number {
  const limits: number[] = [];
  if (page.width > 0) limits.push((box.width - CANVAS_PAD_X - (inset.right ?? 0)) / page.width);
  if (page.height > 0) limits.push((box.height - CANVAS_PAD_Y - (inset.top ?? 0) - (inset.bottom ?? 0)) / page.height);
  if (limits.length === 0) return 1;
  const z = Math.min(...limits);
  if (!(z > 0)) return FIT_MIN;
  // Floor to 1% so the page never overshoots the box.
  return clamp(Math.floor(z * 100) / 100, FIT_MIN, ZOOM_MAX);
}

/** The scroll padding under the page (the zoom bar's room), already part of `CANVAS_PAD_Y`. */
const PAD_BOTTOM = 96;
/** The zoom bar and its gap, which sit on top of the sheet. */
const ZOOM_BAR_ROOM = 48;

/** The narrowest canvas the studio keeps (the shell's `main` min width). */
export const MIN_CANVAS = 420;

/**
 * Whether the open left panel fits beside the canvas (and a docked
 * inspector). When it does not, the shell lays it over the canvas instead of
 * squeezing the canvas below its minimum and scrolling the studio sideways.
 * An unmeasured body (width 0) counts as fitting. `widths.inspector` is 0
 * while the docked inspector is collapsed.
 */
export function leftPanelFits(
  bodyWidth: number,
  mode: InspectorMode,
  widths: { rail: number; drawer: number; inspector: number }
): boolean {
  if (bodyWidth <= 0 || widths.drawer <= 0) return true;
  const need = widths.rail + widths.drawer + MIN_CANVAS + (mode === "docked" ? widths.inspector : 0);
  return bodyWidth >= need;
}

/** The inspector's mode, the canvas box, what the page keeps clear of, and the fit zoom. */
export function computeLayout(input: LayoutInput): StudioLayout {
  const { body, page, rail, drawer = 0, inspector, collapsed, floatOpen, quickBar, sheet = 0 } = input;
  const mode = inspectorMode(input.windowWidth ?? body.width);
  const column = mode === "docked" && !collapsed ? inspector : 0;
  const box = { width: Math.max(0, body.width - rail - drawer - column), height: Math.max(0, body.height) };
  const inset: CanvasInset = {
    ...(mode === "floating" && floatOpen ? { right: FLOAT_INSET } : {}),
    // Reserved whenever the bar is on, not only while something is selected: selecting must not refit the page.
    ...(quickBar && mode !== "sheet" ? { top: QUICK_BAR_INSET } : {}),
    // The preview stays above the sheet (and the zoom bar on it) at peek and half; a full sheet covers it anyway.
    ...(mode === "sheet"
      ? { bottom: Math.max(0, Math.min(sheet, sheetHeight("half", body.height, true)) + 14 + ZOOM_BAR_ROOM - PAD_BOTTOM) }
      : {}),
  };
  return { mode, canvasWidth: box.width, canvasHeight: box.height, inset, fitZoom: fitZoomFor(box, page, inset) };
}
