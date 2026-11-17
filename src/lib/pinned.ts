/**
 * The pinned layer (config v20, _docs/redesign/pinned-layer INVESTIGATION §3): widgets a profile pins to an edge of the
 * screen, drawn the same on every page, which a page can hide (`ProfilePage.hidePinned`). "Make room" pads the page area
 * on the item's edge, as the Island's reserve pads the grid; "float" draws over the page. A widget pinned in place
 * (config v21, `at`) keeps its cells of the page grid on every page it shows on, and pages lay out around them. The rail (`rail` slots) is drawn
 * by the PageRail widget (src/widgets/page-rail/, P2); per-widget touch actions (`TouchMap`) are run from P6 on, and a
 * command (`run`) through the action runner from P7 on (ips-server's actions.rs: off by default, approved commands only).
 */
import type { ModuleSettings } from "@/modules/types";
import { normalizeKeys, remapKeyPages } from "./keys";
import type { Placement } from "./layout";

export type PinnedEdge = "left" | "right" | "top" | "bottom";
export const PINNED_EDGES: readonly PinnedEdge[] = ["left", "right", "top", "bottom"];

/**
 * What a touch does (decision 10): a page, the profile picker, the page lock, an existing guarded route, or a command (P7's
 * runner). `confirm` on a command asks for a hold before it runs, unless the gesture was a hold; OBS's go live always does.
 */
export type TouchAction =
  | { op: "page"; to: string }
  | { op: "profile-picker" }
  | { op: "lock" }
  | { op: "audio"; body: Record<string, unknown> }
  | { op: "obs"; body: Record<string, unknown> }
  | { op: "media"; key: MediaKey }
  | { op: "run"; command: string; confirm?: boolean };
export type MediaKey = "play-pause" | "next" | "previous";
const MEDIA_KEYS: readonly MediaKey[] = ["play-pause", "next", "previous"];

export type TouchGesture = "tap" | "hold" | "doubleTap";
const GESTURES: readonly TouchGesture[] = ["tap", "hold", "doubleTap"];
export type TouchMap = Partial<Record<TouchGesture, TouchAction>>;

/** The states a rail slot's badge can follow (a fixed list). */
export type BadgeRule = "agents-waiting" | "alerts" | "obs-live";
const BADGE_RULES: readonly BadgeRule[] = ["agents-waiting", "alerts", "obs-live"];

export type RailGroup = "top" | "pages" | "actions" | "widgets" | "bottom";
const RAIL_GROUPS: readonly RailGroup[] = ["top", "pages", "actions", "widgets", "bottom"];

/** What a rail slot is: a page link, the profile (chip or logo), an action, or a widget with a rail preset. */
export type RailTarget =
  | { kind: "page"; pageId: string }
  | { kind: "profile" }
  | { kind: "action"; action: TouchAction }
  | { kind: "widget"; module: string; settings?: ModuleSettings };

/** A slot's icon: from the icon set, an image in the asset store (`/api/assets` id), an app's icon, or text. */
export type RailIcon =
  | { from: "set"; name: string }
  | { from: "image"; asset: string }
  | { from: "app"; exe: string; asset?: string }
  | { from: "text"; text: string };

export type RailShape = "as-is" | "rounded" | "circle";
const RAIL_SHAPES: readonly RailShape[] = ["as-is", "rounded", "circle"];

/** What sits behind a logo: nothing, the card colour, or the text colour (a light logo on a light Look). Unset: chosen from the image (P5). */
export type RailPlate = "none" | "card" | "contrast";
const RAIL_PLATES: readonly RailPlate[] = ["none", "card", "contrast"];

export interface RailSlot {
  id: string;
  group: RailGroup;
  target: RailTarget;
  icon?: RailIcon;
  shape?: RailShape;
  /** Tint the icon with the Look's accent. */
  tint?: boolean;
  /** Show the slot's name under its icon. */
  label?: boolean;
  /** A screen reader's and the editor's name. */
  name?: string;
  badge?: { when: BadgeRule };
  touch?: TouchMap;
  /** A logo's plate, set by the user; unset = automatic (owner Q8). */
  plate?: RailPlate;
}

/** The widget a pinned item draws: a placement without a box on the grid (the item's edge and thickness are its box). */
export type PinnedPlacement = Omit<Placement, "colStart" | "rowStart" | "colSpan" | "rowSpan" | "px" | "groupId" | "item" | "visible">;

/** The fields every pinned item has, on an edge or in place. */
interface PinnedBase {
  id: string;
  /** The pages it shows on: all, or those listed. */
  show: "all" | { pages: string[] };
  /** False: hidden (Layers' eye), not drawn and makes no room; kept on save. */
  visible: boolean;
  locked?: boolean;
  name?: string;
  placement: PinnedPlacement;
  /** The rail's slots, when the placement is the rail widget (P2). */
  rail?: RailSlot[];
}

/** A widget pinned to an edge of the screen. */
export interface PinnedEdgeItem extends PinnedBase {
  edge: PinnedEdge;
  /** "room": the page lays out in the space left; "float": drawn over the page. */
  mode: "room" | "float";
  /** Its size across the edge, design px (a rail 84). */
  thickness: number;
  /** Its distance from the screen's edge, design px; unset = 0 (flush). */
  inset?: number;
  at?: never;
}

/**
 * Cells of the profile's grid, 1-based as a placement's box. Every page of a profile shares its grid (`cols` and `rows`
 * are the profile's), so the same cells mean the same place on each page; they count in the page area the edge items
 * leave.
 */
export interface PinnedCells {
  colStart: number;
  rowStart: number;
  colSpan: number;
  rowSpan: number;
}

/** A widget pinned in place (config v21): it keeps its cells on every page it shows on, and pages lay out around them. */
export interface PinnedGridItem extends PinnedBase {
  at: PinnedCells;
  edge?: never;
  mode?: never;
  thickness?: never;
  inset?: never;
}

/** A pinned item: on an edge, or in place on the grid (`at`). */
export type PinnedItem = PinnedEdgeItem | PinnedGridItem;

export const isGridPin = (it: PinnedItem): it is PinnedGridItem => it.at !== undefined;
export const isEdgePin = (it: PinnedItem): it is PinnedEdgeItem => it.at === undefined;

/** An item's widget as a placement of one cell: what the kiosk draws in the item's box, and what feeds the Island. */
export const pinnedPlacement = (it: Pick<PinnedItem, "placement">): Placement => ({ ...it.placement, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true });

/** Cells kept inside a grid of `cols` x `rows`: a span no larger than the grid, its start moved back so it ends inside. */
export function clampCells(at: PinnedCells, cols: number, rows: number): PinnedCells {
  const colSpan = Math.max(1, Math.min(at.colSpan, cols));
  const rowSpan = Math.max(1, Math.min(at.rowSpan, rows));
  return { colStart: Math.max(1, Math.min(at.colStart, cols - colSpan + 1)), rowStart: Math.max(1, Math.min(at.rowStart, rows - rowSpan + 1)), colSpan, rowSpan };
}

/** A profile's pinned layer, top first as in Layers. */
export interface PinnedLayer {
  items: PinnedItem[];
}

/** Auto-switch rules (P4): the profile is chosen while one of these programs is in front. */
export interface AutoSwitch {
  exe: string[];
}

/** The largest thickness or inset kept, design px. */
const MAX_PX = 4000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v !== "";
const px = (v: unknown, min: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= min ? Math.min(MAX_PX, Math.round(v)) : undefined;

/** A stored touch action, or undefined for an unknown one (or a page that is gone, when `pages` is given). */
export function normalizeTouchAction(raw: unknown, pages?: ReadonlySet<string>): TouchAction | undefined {
  if (!isRecord(raw)) return undefined;
  switch (raw.op) {
    case "page":
      return text(raw.to) && (raw.to === "next" || raw.to === "prev" || !pages || pages.has(raw.to)) ? { op: "page", to: raw.to } : undefined;
    case "profile-picker":
    case "lock":
      return { op: raw.op };
    case "audio":
    case "obs":
      return isRecord(raw.body) && text(raw.body.op) ? { op: raw.op, body: raw.body } : undefined;
    case "media":
      return MEDIA_KEYS.includes(raw.key as MediaKey) ? { op: "media", key: raw.key as MediaKey } : undefined;
    case "run":
      return text(raw.command) && raw.command.trim() ? { op: "run", command: raw.command, ...(raw.confirm === true ? { confirm: true } : {}) } : undefined;
    default:
      return undefined;
  }
}

/** A stored touch map: its known gestures with a known action; none left = undefined. */
export function normalizeTouchMap(raw: unknown, pages?: ReadonlySet<string>): TouchMap | undefined {
  if (!isRecord(raw)) return undefined;
  const kept = GESTURES.flatMap((g) => {
    const action = normalizeTouchAction(raw[g], pages);
    return action ? [[g, action] as const] : [];
  });
  return kept.length ? Object.fromEntries(kept) : undefined;
}

function normalizeTarget(raw: unknown, pages: ReadonlySet<string>): RailTarget | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.kind === "page") return text(raw.pageId) && pages.has(raw.pageId) ? { kind: "page", pageId: raw.pageId } : undefined;
  if (raw.kind === "profile") return { kind: "profile" };
  if (raw.kind === "action") {
    const action = normalizeTouchAction(raw.action, pages);
    return action && { kind: "action", action };
  }
  if (raw.kind === "widget" && text(raw.module)) return { kind: "widget", module: raw.module, ...(isRecord(raw.settings) ? { settings: raw.settings as ModuleSettings } : {}) };
  return undefined;
}

/** A stored slot or key icon, or undefined for one that isn't (an unknown source, no name). */
export function normalizeRailIcon(raw: unknown): RailIcon | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.from === "set" && text(raw.name)) return { from: "set", name: raw.name };
  if (raw.from === "image" && text(raw.asset)) return { from: "image", asset: raw.asset };
  if (raw.from === "app" && text(raw.exe)) return { from: "app", exe: raw.exe, ...(text(raw.asset) ? { asset: raw.asset } : {}) };
  if (raw.from === "text" && text(raw.text)) return { from: "text", text: raw.text };
  return undefined;
}

/** A stored shape, or undefined for one that isn't. */
export const normalizeRailShape = (raw: unknown): RailShape | undefined => (RAIL_SHAPES.includes(raw as RailShape) ? (raw as RailShape) : undefined);

/** A stored logo plate, or undefined for one that isn't. */
export const normalizeRailPlate = (raw: unknown): RailPlate | undefined => (RAIL_PLATES.includes(raw as RailPlate) ? (raw as RailPlate) : undefined);

/** The fields of a slot the rail's profile chip may override: each guarded as a slot's is (a bad one is dropped, a touch map keeps only its known actions). */
export function normalizeChipFields(raw: unknown, pages?: ReadonlySet<string>): Pick<RailSlot, "icon" | "shape" | "tint" | "label" | "name" | "touch" | "plate"> {
  if (!isRecord(raw)) return {};
  const icon = normalizeRailIcon(raw.icon);
  const shape = normalizeRailShape(raw.shape);
  const plate = normalizeRailPlate(raw.plate);
  const touch = normalizeTouchMap(raw.touch, pages);
  return {
    ...(icon ? { icon } : {}),
    ...(shape ? { shape } : {}),
    ...(typeof raw.tint === "boolean" ? { tint: raw.tint } : {}),
    ...(typeof raw.label === "boolean" ? { label: raw.label } : {}),
    ...(text(raw.name) ? { name: raw.name } : {}),
    ...(touch ? { touch } : {}),
    ...(plate ? { plate } : {}),
  };
}

/** The chip's overrides as a rail's settings hold them (`chipItem`, JSON text), guarded as above; none for text that isn't JSON. */
export function parseChipItem(raw: unknown, pages?: ReadonlySet<string>): ReturnType<typeof normalizeChipFields> {
  if (typeof raw !== "string") return {};
  try {
    return normalizeChipFields(JSON.parse(raw), pages);
  } catch {
    return {};
  }
}

/** A rail's slots: one with no id, a repeated id, an unknown group or a target that is gone (a deleted page, an unknown action) is dropped. */
function normalizeRail(raw: unknown, pages: ReadonlySet<string>): RailSlot[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  return raw.flatMap((s): RailSlot[] => {
    if (!isRecord(s) || !text(s.id) || seen.has(s.id) || !RAIL_GROUPS.includes(s.group as RailGroup)) return [];
    const target = normalizeTarget(s.target, pages);
    if (!target) return [];
    seen.add(s.id);
    const icon = normalizeRailIcon(s.icon);
    const touch = normalizeTouchMap(s.touch, pages);
    const when = isRecord(s.badge) && BADGE_RULES.includes(s.badge.when as BadgeRule) ? (s.badge.when as BadgeRule) : undefined;
    return [
      {
        id: s.id,
        group: s.group as RailGroup,
        target,
        ...(icon ? { icon } : {}),
        ...(normalizeRailShape(s.shape) ? { shape: normalizeRailShape(s.shape) } : {}),
        ...(typeof s.tint === "boolean" ? { tint: s.tint } : {}),
        ...(typeof s.label === "boolean" ? { label: s.label } : {}),
        ...(text(s.name) ? { name: s.name } : {}),
        ...(when ? { badge: { when } } : {}),
        ...(touch ? { touch } : {}),
        ...(normalizeRailPlate(s.plate) ? { plate: normalizeRailPlate(s.plate) } : {}),
      },
    ];
  });
}

/** The grid and item fields a pinned placement never has; a stored one is dropped. */
const OFF_GRID = ["colStart", "rowStart", "colSpan", "rowSpan", "px", "groupId", "item", "visible"] as const;

function normalizePinnedPlacement(raw: unknown, pages: ReadonlySet<string>): PinnedPlacement | undefined {
  if (!isRecord(raw) || !text(raw.id) || !text(raw.module)) return undefined;
  const rest: Record<string, unknown> = { ...raw };
  for (const key of OFF_GRID) delete rest[key];
  const { touch, settings, keys, ...kept } = rest;
  // the rail's chip overrides are guarded like a slot's, so a command or a page that is gone never reaches the rail
  const chip = isRecord(settings) && typeof settings.chipItem === "string" ? parseChipItem(settings.chipItem, pages) : undefined;
  const cleaned = isRecord(settings) && chip ? Object.fromEntries(Object.entries(settings).flatMap(([k, v]) => (k !== "chipItem" ? [[k, v]] : Object.keys(chip).length ? [[k, JSON.stringify(chip)]] : []))) : settings;
  const map = normalizeTouchMap(touch, pages);
  const keyList = normalizeKeys(keys, pages);
  return {
    ...(kept as unknown as PinnedPlacement),
    ...(isRecord(cleaned) ? { settings: cleaned as ModuleSettings } : {}),
    ...(map ? { touch: map } : {}),
    ...(keyList ? { keys: keyList } : {}),
  };
}

/** A stored grid pin's cells: whole numbers from 1, kept inside the grid when it is given; undefined for cells that aren't. */
function normalizeCells(raw: unknown, grid?: { cols: number; rows: number }): PinnedCells | undefined {
  if (!isRecord(raw)) return undefined;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.round(v) : undefined);
  const [colStart, rowStart, colSpan, rowSpan] = [n(raw.colStart), n(raw.rowStart), n(raw.colSpan), n(raw.rowSpan)];
  if (colStart === undefined || rowStart === undefined || colSpan === undefined || rowSpan === undefined) return undefined;
  const at = { colStart, rowStart, colSpan, rowSpan };
  return grid ? clampCells(at, grid.cols, grid.rows) : at;
}

/**
 * A profile's stored pinned layer, guarded against its pages (`pageIds`): an item with no id, a repeated id, an unknown
 * edge, no thickness or no widget is dropped; a page it names that is gone leaves its list, and so does a rail slot or
 * touch action that points at one. An item pinned in place (`at`) is dropped when its cells aren't whole numbers from 1,
 * and kept inside the profile's grid (`grid`) when they run past it. No items left = undefined (no pinned layer).
 */
export function normalizePinned(raw: unknown, pageIds: readonly string[], grid?: { cols: number; rows: number }): PinnedLayer | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return undefined;
  const pages = new Set(pageIds);
  const seen = new Set<string>();
  const items = raw.items.flatMap((it): PinnedItem[] => {
    if (!isRecord(it) || !text(it.id) || seen.has(it.id)) return [];
    const placement = normalizePinnedPlacement(it.placement, pages);
    if (!placement) return [];
    const listed = isRecord(it.show) && Array.isArray(it.show.pages) ? it.show.pages.filter((id): id is string => typeof id === "string" && pages.has(id)) : undefined;
    const rail = normalizeRail(it.rail, pages);
    const common = {
      show: listed ? { pages: [...new Set(listed)] } : ("all" as const),
      visible: it.visible !== false,
      ...(it.locked === true ? { locked: true } : {}),
      ...(text(it.name) ? { name: it.name } : {}),
      placement,
      ...(rail ? { rail } : {}),
    };
    if (it.at !== undefined) {
      const at = normalizeCells(it.at, grid);
      if (!at) return [];
      seen.add(it.id);
      return [{ id: it.id, at, ...common }];
    }
    const thickness = px(it.thickness, 1);
    if (!PINNED_EDGES.includes(it.edge as PinnedEdge) || thickness === undefined) return [];
    seen.add(it.id);
    const inset = px(it.inset, 0);
    return [
      {
        id: it.id,
        edge: it.edge as PinnedEdge,
        mode: it.mode === "float" ? "float" : "room",
        thickness,
        ...(inset ? { inset } : {}),
        ...common,
      },
    ];
  });
  return items.length ? { items } : undefined;
}

/** Auto-switch rules, guarded: the program names, each once; none = undefined. */
export function normalizeAutoSwitch(raw: unknown): AutoSwitch | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.exe)) return undefined;
  const exe = [...new Set(raw.exe.filter(text).map((e) => e.trim()).filter(Boolean))];
  return exe.length ? { exe } : undefined;
}

/** The pinned items drawn on `pageId`: visible, shown on that page, none when the page hides the layer. */
export function pinnedOnPage(layer: PinnedLayer | undefined, pageId: string | undefined, hidden = false): PinnedItem[] {
  if (!layer || hidden) return [];
  return layer.items.filter((it) => it.visible && (it.show === "all" || (pageId !== undefined && it.show.pages.includes(pageId))));
}

export type EdgeRoom = Record<PinnedEdge, number>;

/** The room the "make room" items take on each edge, px: their thickness and inset, summed per edge. A grid pin takes none. */
export function pinnedRoom(items: readonly PinnedItem[]): EdgeRoom {
  const room: EdgeRoom = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const it of items) if (isEdgePin(it) && it.mode === "room") room[it.edge] += it.thickness + (it.inset ?? 0);
  return room;
}


/** An item's box, px from the screen's edges (`left` / `right` / `top` / `bottom`) and its thickness. */
export type PinnedBox = Partial<Record<PinnedEdge, number>> & { width?: number; height?: number };

/**
 * Where an item sits: on its edge after the items of its mode before it there (a float item past the room the others
 * make, so it lies over the page and not over a rail), along the whole edge for a left or right one (kept its inset off
 * the top and bottom too, so a panel off the edge sits like a card: QUESTIONS P3), and between the side items' room plus
 * the page's `padding` for a top or bottom one, so a bar lines up with the zones.
 */
export function pinnedBox(items: readonly PinnedItem[], item: PinnedEdgeItem, padding: number): PinnedBox {
  const room = pinnedRoom(items);
  const same = items.filter(isEdgePin).filter((o) => o.mode === item.mode);
  const before = same.slice(0, same.indexOf(item)).filter((o) => o.edge === item.edge);
  const at = (item.mode === "float" ? room[item.edge] : 0) + before.reduce((n, o) => n + o.thickness + (o.inset ?? 0), 0) + (item.inset ?? 0);
  if (item.edge === "left" || item.edge === "right") return { [item.edge]: at, top: item.inset ?? 0, bottom: item.inset ?? 0, width: item.thickness };
  return { [item.edge]: at, left: room.left + padding, right: room.right + padding, height: item.thickness };
}

const movedAction = (a: TouchAction, ids: ReadonlyMap<string, string>): TouchAction => (a.op === "page" && ids.has(a.to) ? { ...a, to: ids.get(a.to)! } : a);

/** A touch map with its page actions moved to new page ids (a profile copied with fresh ids). */
export function remapTouchPages(touch: TouchMap | undefined, ids: ReadonlyMap<string, string>): TouchMap | undefined {
  if (!touch) return touch;
  return Object.fromEntries(Object.entries(touch).map(([g, a]) => [g, movedAction(a, ids)])) as TouchMap;
}

function movedTarget(t: RailTarget, ids: ReadonlyMap<string, string>): RailTarget {
  if (t.kind === "page") return ids.has(t.pageId) ? { ...t, pageId: ids.get(t.pageId)! } : t;
  return t.kind === "action" ? { ...t, action: movedAction(t.action, ids) } : t;
}

/**
 * The pinned layer with its page references (the pages it shows on, page slots, page actions) moved to new page ids
 * (`ids`: old to new) and each widget given a fresh id by `freshId`, as a profile copied with fresh ids needs.
 */
export function remapPinnedPages(layer: PinnedLayer, ids: ReadonlyMap<string, string>, freshId: (module: string) => string): PinnedLayer {
  return {
    items: layer.items.map((it) => ({
      ...it,
      show: it.show === "all" ? it.show : { pages: it.show.pages.flatMap((id) => (ids.has(id) ? [ids.get(id)!] : [])) },
      placement: {
        ...it.placement,
        id: freshId(it.placement.module),
        ...(it.placement.touch ? { touch: remapTouchPages(it.placement.touch, ids) } : {}),
        ...(it.placement.keys ? { keys: remapKeyPages(it.placement.keys, ids) } : {}),
      },
      ...(it.rail ? { rail: it.rail.map((s) => ({ ...s, target: movedTarget(s.target, ids), ...(s.touch ? { touch: remapTouchPages(s.touch, ids) } : {}) })) } : {}),
    })),
  };
}
