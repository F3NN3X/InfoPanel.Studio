/**
 * Edit's changes to the pinned layer (P3, _docs/redesign/pinned-layer): each takes the stored profile (or config) and
 * returns the next one, so a change is one `updateStored` call and one undo step. Pure: the studio's pinned chunk and the
 * tests read it, the kiosk never does.
 */
import type { ModuleSettings } from "@/modules/types";
import type { IslandConfig } from "./island/config";
import { ITEM_ID, SCROLL_ROW_H, uid, type DashboardConfig, type MonitorProfile, type Placement } from "./layout";
import { pinBlocked } from "./pin-blocked";
import { profileGap, profilePadding, trackSize } from "./profile-grid";
import {
  clampCells,
  isEdgePin,
  isGridPin,
  normalizePinned,
  pinnedOnPage,
  remapPinnedPages,
  type MediaKey,
  type PinnedCells,
  type PinnedEdge,
  type PinnedEdgeItem,
  type PinnedGridItem,
  type PinnedItem,
  type RailGroup,
  type RailSlot,
  type TouchAction,
} from "./pinned";
import { CHIP_FIELDS, chipSlot, RAIL_MODULE, RAIL_THICKNESS, railNeed, railSlots, type RailPage, type RailParts } from "./rail";

/** What Add offers for the pinned layer: the rail and the widgets the fixtures pin, each on its usual edge and size. */
export interface PinKind {
  id: string;
  name: string;
  module: string;
  edge: PinnedEdge;
  thickness: number;
  inset?: number;
  settings?: ModuleSettings;
}

export const PIN_KINDS: readonly PinKind[] = [
  { id: "rail", name: "Page rail", module: RAIL_MODULE, edge: "left", thickness: RAIL_THICKNESS },
  { id: "now-playing", name: "Now playing bar", module: "NowPlaying", edge: "bottom", thickness: 84, inset: 12, settings: { showHeader: false } },
  { id: "agents", name: "Agents panel", module: "CodingAgents", edge: "right", thickness: 300, inset: 12 },
  { id: "status", name: "Status bar", module: "StatusBar", edge: "top", thickness: 48 },
];

/** A new item of `kind`: on all pages, making room, visible. */
export function newPinnedItem(kind: PinKind): PinnedEdgeItem {
  return {
    id: uid("pin"),
    edge: kind.edge,
    mode: "room",
    thickness: kind.thickness,
    ...(kind.inset ? { inset: kind.inset } : {}),
    show: "all",
    visible: true,
    name: kind.name,
    placement: { id: uid(kind.module), module: kind.module, ...(kind.settings ? { settings: kind.settings } : {}) },
  };
}

/** The size the pinned inspector's control allows across the edge, px: 24 up to half the screen's width (a side) or height. */
export const PIN_MIN_THICKNESS = 24;
export const pinnedThicknessMax = (edge: PinnedEdge, profile: Pick<MonitorProfile, "width" | "height">): number =>
  Math.max(PIN_MIN_THICKNESS, Math.round((edge === "left" || edge === "right" ? profile.width : profile.height) / 2));

export { pinBlocked };

/** Why a pinned item can't go back to a page (null: it can): a rail on an edge stays; one pinned in place came from a page. */
export const unpinBlocked = (it: PinnedItem): string | null => (isEdgePin(it) && it.placement.module === RAIL_MODULE ? "The page rail stays in the pinned layer" : null);

/** A page widget's size on the profile's grid, px: its cells and the gaps between them. */
function pageSpanPx(length: number, count: number, span: number, gap: number): number {
  return Math.round(span * trackSize(length, count, gap) + (span - 1) * gap);
}

/**
 * A page's widget moved to the pinned layer on `edge`, as one change: it keeps its module and settings, is dropped from
 * the page and goes last in the list on all pages, making room. Its thickness is its height (top, bottom) or width (left,
 * right) on the grid, clamped to what the inspector's size allows. The profile as it was when nothing can be pinned.
 */
export function pinPlacement(p: MonitorProfile, pageId: string, placementId: string, edge: PinnedEdge, opts: { id?: string; name?: string } = {}): MonitorProfile {
  const page = p.pages.find((pg) => pg.id === pageId);
  const placement = page?.placements.find((x) => x.id === placementId);
  if (!page || !placement || pinBlocked(placement)) return p;
  const { colStart: _c, rowStart: _r, colSpan, rowSpan, px: _px, groupId: _g, item: _i, visible: _v, locked, ...rest } = placement;
  const side = edge === "left" || edge === "right";
  const pad = profilePadding(p, true);
  const gap = profileGap(p);
  const rowH = p.fit === "fill" ? trackSize(p.height - 2 * pad, p.rows, gap) : SCROLL_ROW_H;
  const size = side ? pageSpanPx(p.width - 2 * pad, p.cols, colSpan, gap) : Math.round(rowSpan * rowH + (rowSpan - 1) * gap);
  const item: PinnedEdgeItem = {
    id: opts.id ?? uid("pin"),
    edge,
    mode: "room",
    thickness: Math.min(pinnedThicknessMax(edge, p), Math.max(PIN_MIN_THICKNESS, size)),
    show: "all",
    visible: true,
    ...(locked ? { locked: true } : {}),
    name: opts.name ?? placement.name ?? placement.module,
    placement: rest,
  };
  const moved = { ...p, pages: p.pages.map((pg) => (pg === page ? { ...pg, placements: pg.placements.filter((x) => x.id !== placementId) } : pg)) };
  return addPinnedItem(moved, item);
}

/** A placement's cells. */
const cellsOf = (z: Pick<Placement, "colStart" | "rowStart" | "colSpan" | "rowSpan">): PinnedCells => ({ colStart: z.colStart, rowStart: z.rowStart, colSpan: z.colSpan, rowSpan: z.rowSpan });

const overlaps = (a: PinnedCells, b: PinnedCells): boolean =>
  a.colStart < b.colStart + b.colSpan && b.colStart < a.colStart + a.colSpan && a.rowStart < b.rowStart + b.rowSpan && b.rowStart < a.rowStart + a.rowSpan;

/**
 * Pin here (owner feedback after P8, "Reserve the cells"): a page's widgets moved into the pinned layer in place, as one
 * change. Each keeps its module, settings and cells, is dropped from the page and goes last in the list, on all pages.
 * `opts.ids` and `opts.names` name each new item, in the order of `placementIds`. A widget that can't be pinned, or one
 * placed freely in px, stays on the page; the profile as it was when none can be pinned.
 */
export function pinInPlace(p: MonitorProfile, pageId: string, placementIds: readonly string[], opts: { ids?: readonly string[]; names?: readonly string[] } = {}): MonitorProfile {
  const page = p.pages.find((pg) => pg.id === pageId);
  if (!page) return p;
  const items = placementIds.flatMap((id, i): PinnedGridItem[] => {
    const placement = page.placements.find((x) => x.id === id);
    if (!placement || pinBlocked(placement) || placement.px) return [];
    const { colStart: _c, rowStart: _r, colSpan: _cs, rowSpan: _rs, px: _px, groupId: _g, item: _i, visible, locked, ...rest } = placement;
    return [
      {
        id: opts.ids?.[i] ?? uid("pin"),
        at: clampCells(cellsOf(placement), p.cols, p.rows),
        show: "all",
        visible,
        ...(locked ? { locked: true } : {}),
        name: opts.names?.[i] ?? placement.name ?? placement.module,
        placement: rest,
      },
    ];
  });
  if (!items.length) return p;
  const gone = new Set(items.map((it) => it.placement.id));
  const moved = { ...p, pages: p.pages.map((pg) => (pg === page ? { ...pg, placements: pg.placements.filter((x) => !gone.has(x.id)) } : pg)) };
  return withPinnedItems(moved, (list) => [...list, ...items]);
}

/** A page widget an item pinned in place covers: on a page it shows on, under its cells. */
export interface PinConflict {
  pageId: string;
  placementId: string;
}

/**
 * The page widgets a grid pin covers (owner: "never hidden silently"): on each page it is drawn on (visible, shown there,
 * the page not hiding the layer), the visible widgets on the grid whose cells meet its own. None for an edge item.
 */
export function pinConflicts(p: MonitorProfile, item: PinnedItem): PinConflict[] {
  if (!isGridPin(item)) return [];
  const at = clampCells(item.at, p.cols, p.rows);
  return p.pages.flatMap((pg) =>
    pinnedOnPage({ items: [item] }, pg.id, pg.hidePinned).length
      ? pg.placements.filter((z) => z.visible && z.module !== ITEM_ID && !z.px && overlaps(at, cellsOf(z))).map((z) => ({ pageId: pg.id, placementId: z.id }))
      : []
  );
}

/** Every conflict of the profile's grid pins, with the pin that makes it. */
export const allPinConflicts = (p: MonitorProfile): (PinConflict & { pinId: string })[] =>
  (p.pinned?.items ?? []).flatMap((it) => pinConflicts(p, it).map((c) => ({ ...c, pinId: it.id })));

/** A page widget moved to `rect` (a free spot the caller found): a conflict's Move fix. */
export function moveZoneTo(p: MonitorProfile, pageId: string, placementId: string, rect: { col: number; row: number; cols: number; rows: number }): MonitorProfile {
  return {
    ...p,
    pages: p.pages.map((pg) =>
      pg.id === pageId ? { ...pg, placements: pg.placements.map((z) => (z.id === placementId ? { ...z, colStart: rect.col, rowStart: rect.row, colSpan: rect.cols, rowSpan: rect.rows } : z)) } : pg
    ),
  };
}

/** A grid pin moved or resized to `at`, kept inside the grid; an edge item stays as it is. */
export const withCells = (p: MonitorProfile, id: string, at: PinnedCells): MonitorProfile =>
  updatePinnedItem(p, id, (it) => (isGridPin(it) ? { ...it, at: clampCells(at, p.cols, p.rows) } : it));

/** "cols 1–3, rows 2–2" as the pinned list and inspector say it. */
export const cellsText = (at: PinnedCells): string => `cols ${at.colStart}–${at.colStart + at.colSpan - 1}, rows ${at.rowStart}–${at.rowStart + at.rowSpan - 1}`;

/** A pinned item moved onto a page's grid at `rect` (a free spot the caller found), as one change; the profile as it was when it can't go. */
export function unpinToPage(p: MonitorProfile, itemId: string, pageId: string, rect: { col: number; row: number; cols: number; rows: number }): MonitorProfile {
  const item = p.pinned?.items.find((it) => it.id === itemId);
  if (!item || unpinBlocked(item) || !p.pages.some((pg) => pg.id === pageId)) return p;
  const placement: Placement = { ...item.placement, colStart: rect.col, rowStart: rect.row, colSpan: rect.cols, rowSpan: rect.rows, visible: true, ...(item.locked ? { locked: true } : {}) };
  const placed = { ...p, pages: p.pages.map((pg) => (pg.id === pageId ? { ...pg, placements: [...pg.placements, placement] } : pg)) };
  return removePinnedItem(placed, itemId);
}

/** The profile with its pinned items changed by `fn`; none left drops the layer (unset = no pinned layer). */
export function withPinnedItems(p: MonitorProfile, fn: (items: PinnedItem[]) => PinnedItem[]): MonitorProfile {
  const items = fn(p.pinned?.items ?? []);
  if (items.length) return { ...p, pinned: { items } };
  const { pinned: _gone, ...rest } = p;
  return rest;
}

export const addPinnedItem = (p: MonitorProfile, item: PinnedItem): MonitorProfile => withPinnedItems(p, (items) => [...items, item]);

export const updatePinnedItem = (p: MonitorProfile, id: string, fn: (it: PinnedItem) => PinnedItem): MonitorProfile =>
  withPinnedItems(p, (items) => items.map((it) => (it.id === id ? fn(it) : it)));

export const removePinnedItem = (p: MonitorProfile, id: string): MonitorProfile => withPinnedItems(p, (items) => items.filter((it) => it.id !== id));

/** One step up (`-1`, towards the top of the list, which is the outer edge) or down; past an end it stays. */
export function moveInList<T extends { id: string }>(list: readonly T[], id: string, by: -1 | 1): T[] {
  const at = list.findIndex((x) => x.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

export const movePinnedItem = (p: MonitorProfile, id: string, by: -1 | 1): MonitorProfile => withPinnedItems(p, (items) => moveInList(items, id, by));

/** The Show on choice: all pages, this page alone, or a list. */
export type ShowChoice = "this" | "some" | "all";

export function showChoice(item: Pick<PinnedItem, "show">, pageId: string): ShowChoice {
  if (item.show === "all") return "all";
  return item.show.pages.length === 1 && item.show.pages[0] === pageId ? "this" : "some";
}

/** The item shown on `choice`: "some" keeps a list it has (else starts from this page), "this" is the page alone. */
export function withShow(item: PinnedItem, choice: ShowChoice, pageId: string): PinnedItem {
  if (choice === "all") return { ...item, show: "all" };
  if (choice === "some" && item.show !== "all") return item;
  return { ...item, show: { pages: [pageId] } };
}

/** One page ticked on or off in the item's list, in the profile's page order. */
export function withShownPage(item: PinnedItem, pageId: string, on: boolean, order: readonly string[]): PinnedItem {
  const now = new Set(item.show === "all" ? order : item.show.pages);
  if (on) now.add(pageId);
  else now.delete(pageId);
  return { ...item, show: { pages: order.filter((id) => now.has(id)) } };
}

/** A page's "Hide the pinned layer" on or off (`ProfilePage.hidePinned`, stored only when on). */
export function withHidePinned(p: MonitorProfile, pageId: string, hide: boolean): MonitorProfile {
  return {
    ...p,
    pages: p.pages.map((pg) => {
      if (pg.id !== pageId) return pg;
      if (hide) return { ...pg, hidePinned: true };
      const { hidePinned: _off, ...rest } = pg;
      return rest;
    }),
  };
}

/** The Island's edge: its own, else the top (a pack's default edge is not known here). */
const islandEdge = (island: IslandConfig): PinnedEdge => island.edge ?? "top";

/**
 * Whether a top or bottom item meets the Island: an Island on, on the same edge. The Island draws over the item there,
 * and with "Reserve space" the page starts under both (QUESTIONS P1 5).
 */
export function islandClash(island: IslandConfig | undefined, item: Pick<PinnedItem, "edge" | "visible">): boolean {
  return !!island?.enabled && item.visible && (item.edge === "top" || item.edge === "bottom") && islandEdge(island) === item.edge;
}

/** The other profiles a "Use on every profile of this size" reaches: the same width and height. */
export const sameSizeProfiles = (config: DashboardConfig, from: MonitorProfile): MonitorProfile[] =>
  config.profiles.filter((p) => p.id !== from.id && p.width === from.width && p.height === from.height);

/**
 * Decision 6: the profile's pinned layer copied to every other profile of its size, replacing theirs. Profiles have their
 * own pages, so a page the layer names goes to the page in the same place there (the first to the first); one past
 * their last page is dropped (`normalizePinned`). Each widget gets a fresh id. One undo step.
 */
export function copyPinnedToSameSize(config: DashboardConfig, fromId: string): { config: DashboardConfig; count: number } {
  const from = config.profiles.find((p) => p.id === fromId);
  if (!from?.pinned) return { config, count: 0 };
  const targets = new Set(sameSizeProfiles(config, from).map((p) => p.id));
  if (!targets.size) return { config, count: 0 };
  const profiles = config.profiles.map((p) => {
    if (!targets.has(p.id)) return p;
    const ids = new Map(from.pages.flatMap((pg, i) => (p.pages[i] ? [[pg.id, p.pages[i].id] as const] : [])));
    const layer = normalizePinned(remapPinnedPages(from.pinned!, ids, (module) => uid(module)), p.pages.map((pg) => pg.id), { cols: p.cols, rows: p.rows });
    return withPinnedItems(p, () => layer?.items ?? []);
  });
  return { config: { ...config, profiles }, count: targets.size };
}

/** A pinned item's height on a profile, px: a side item runs the height less its inset at each end. */
export const pinnedHeight = (item: Pick<PinnedEdgeItem, "edge" | "thickness" | "inset">, profileHeight: number): number =>
  item.edge === "left" || item.edge === "right" ? profileHeight - 2 * (item.inset ?? 0) : item.thickness;

/** The rail's parts as its settings say (each on unless set off). */
export const railParts = (settings: ModuleSettings | undefined, rotates: boolean): RailParts => ({
  chip: settings?.chip !== false,
  pageLock: settings?.pageLock !== false,
  clock: settings?.clock !== false,
  rotates,
});

/** Owner Q9: the height the rail's items need against the height it has, when they don't fit; null when they do. */
export function railOverflow(item: PinnedEdgeItem, profile: Pick<MonitorProfile, "height" | "pages" | "rotate">): { need: number; have: number } | null {
  const have = pinnedHeight(item, profile.height);
  const need = railNeed(railSlots(item.rail, profile.pages), railParts(item.placement.settings, profile.rotate?.enabled === true && profile.pages.length > 1), have);
  return need > have ? { need: Math.round(need), have } : null;
}

/**
 * The rail's profile chip changed by `fn`, as the slot inspector edits it: what differs from the chip as drawn by default is
 * stored beside it in the rail's settings (`chipItem`), and none left drops the key, so a rail with no overrides is as it was.
 */
export function withChipItem(item: PinnedItem, fn: (s: RailSlot) => RailSlot): PinnedItem {
  const settings = item.placement.settings;
  const next = fn(chipSlot(settings));
  const base = chipSlot(undefined);
  const own = Object.fromEntries(CHIP_FIELDS.flatMap((k) => (next[k] !== undefined && JSON.stringify(next[k]) !== JSON.stringify(base[k]) ? [[k, next[k]]] : [])));
  const { chipItem: _old, ...rest } = settings ?? {};
  const kept = Object.keys(own).length ? { ...rest, chipItem: JSON.stringify(own) } : rest;
  const { settings: _s, ...placement } = item.placement;
  return { ...item, placement: Object.keys(kept).length ? { ...placement, settings: kept } : placement };
}

/** The chip shown on the rail or not (its setting, on unless set off). */
export function withChipShown(item: PinnedItem, on: boolean): PinnedItem {
  const { chip: _old, ...rest } = item.placement.settings ?? {};
  const kept = on ? rest : { ...rest, chip: false };
  const { settings: _s, ...placement } = item.placement;
  return { ...item, placement: Object.keys(kept).length ? { ...placement, settings: kept } : placement };
}

/** The rail's slots changed by `fn`, from the ones it draws: with none stored, its one slot per page are stored first. */
export function withRailSlots(item: PinnedItem, pages: readonly RailPage[], fn: (slots: RailSlot[]) => RailSlot[]): PinnedItem {
  return { ...item, rail: fn(railSlots(item.rail, pages)) };
}

/** What Add item makes: a page (the first one the rail lacks), an action (next page), the profile, or a widget slot. */
export type NewSlotKind = "page" | "action" | "profile" | "widget";

export function newRailSlot(kind: NewSlotKind, slots: readonly RailSlot[], pages: readonly RailPage[], widget?: { module: string; settings?: ModuleSettings; name?: string }): RailSlot {
  const id = uid("slot");
  if (kind === "page") {
    const shown = new Set(slots.flatMap((s) => (s.target.kind === "page" ? [s.target.pageId] : [])));
    const page = pages.find((p) => !shown.has(p.id)) ?? pages[0];
    return { id, group: "pages", target: { kind: "page", pageId: page.id }, ...(page.icon ? { icon: { from: "set", name: page.icon } } : {}) };
  }
  if (kind === "action") return { id, group: "actions", target: { kind: "action", action: { op: "page", to: "next" } }, icon: { from: "set", name: "play" } };
  if (kind === "profile") return { id, group: "top", target: { kind: "profile" }, icon: { from: "text", text: "P" } };
  return { id, group: "widgets", target: { kind: "widget", module: widget?.module ?? "Clock", ...(widget?.settings ? { settings: widget.settings } : {}) }, ...(widget?.name ? { name: widget.name } : {}) };
}

/** A rail slot one step up or down among the slots of its group (the other groups' slots keep their places). */
export function moveRailSlot(all: readonly RailSlot[], id: string, by: -1 | 1): RailSlot[] {
  const slot = all.find((s) => s.id === id);
  if (!slot) return [...all];
  const moved = moveInList(all.filter((s) => s.group === slot.group), id, by);
  let k = 0;
  return all.map((s) => (s.group === slot.group ? moved[k++] : s));
}

/** The groups as the editor lists them, top to bottom (the rail's order). */
export const RAIL_GROUP_NAMES: readonly [RailGroup, string][] = [
  ["top", "Top"],
  ["pages", "Pages"],
  ["actions", "Actions"],
  ["widgets", "Widgets"],
  ["bottom", "Bottom"],
];

/** What the audio and OBS actions can name now: this PC's devices (the audio stream) and OBS's scenes (the extras). */
export interface TouchSources {
  outputs: readonly { id: string; name: string }[];
  inputs: readonly { id: string; name: string }[];
  scenes: readonly { id: string; name: string }[];
}

export const NO_TOUCH_SOURCES: TouchSources = { outputs: [], inputs: [], scenes: [] };

/** A touch action as the editor lists it: its value in the list, its label and the group it is listed under. */
export interface TouchChoice {
  value: string;
  label: string;
  group: "Panel" | "Media" | "Audio" | "OBS";
  action: TouchAction;
}

const MEDIA_CHOICES: readonly [MediaKey, string][] = [
  ["play-pause", "Play or pause"],
  ["next", "Next track"],
  ["previous", "Previous track"],
];

const mute = (kind: "output" | "input", id: string): TouchAction => ({ op: "audio", body: { target: "windows", op: "mute", kind, id } });

/**
 * The touch actions the editor offers, P6's safe set, each through a route the kiosk already guards: a page, next,
 * previous, the page lock and the profile picker; the media keys; muting one of this PC's devices; an OBS scene and the
 * OBS mic. Running a command is P7's.
 */
export function touchChoices(pages: readonly RailPage[], sources: TouchSources = NO_TOUCH_SOURCES): TouchChoice[] {
  return [
    ...pages.map((p): TouchChoice => ({ value: `page:${p.id}`, label: `Open page: ${p.name}`, group: "Panel", action: { op: "page", to: p.id } })),
    { value: "page:next", label: "Next page", group: "Panel", action: { op: "page", to: "next" } },
    { value: "page:prev", label: "Previous page", group: "Panel", action: { op: "page", to: "prev" } },
    { value: "lock", label: "Page lock: rotate or stay", group: "Panel", action: { op: "lock" } },
    { value: "profile-picker", label: "Profiles", group: "Panel", action: { op: "profile-picker" } },
    ...MEDIA_CHOICES.map(([key, label]): TouchChoice => ({ value: `media:${key}`, label: `Media: ${label.toLowerCase()}`, group: "Media", action: { op: "media", key } })),
    ...sources.inputs.map((d): TouchChoice => ({ value: `mute:input:${d.id}`, label: `Mute or unmute: ${d.name}`, group: "Audio", action: mute("input", d.id) })),
    ...sources.outputs.map((d): TouchChoice => ({ value: `mute:output:${d.id}`, label: `Mute or unmute: ${d.name}`, group: "Audio", action: mute("output", d.id) })),
    ...sources.scenes.map((sc): TouchChoice => ({ value: `obs:scene:${sc.id}`, label: `OBS scene: ${sc.name}`, group: "OBS", action: { op: "obs", body: { op: "scene", id: sc.id } } })),
    { value: "obs:mic", label: "OBS: mute or unmute the mic", group: "OBS", action: { op: "obs", body: { op: "mic" } } },
  ];
}

/**
 * The value a stored action reads as in `touchChoices` ("" for none). One the editor doesn't offer (a command, an audio
 * or OBS action of another shape) is `other` and kept as stored.
 */
export function touchValue(action: TouchAction | undefined): string {
  if (!action) return "";
  switch (action.op) {
    case "page":
      return `page:${action.to}`;
    case "lock":
    case "profile-picker":
      return action.op;
    case "media":
      return `media:${action.key}`;
    case "audio": {
      const b = action.body;
      const plain = b.target === "windows" && b.op === "mute" && (b.kind === "input" || b.kind === "output") && typeof b.id === "string" && b.muted === undefined;
      return plain ? `mute:${String(b.kind)}:${String(b.id)}` : "other";
    }
    case "obs": {
      const b = action.body;
      if (b.op === "mic") return "obs:mic";
      return b.op === "scene" && typeof b.id === "string" ? `obs:scene:${b.id}` : "other";
    }
    default:
      return "other";
  }
}

/** The name of a stored action the list doesn't hold now (a device not connected, a scene OBS doesn't list, a command). */
export function keptLabel(action: TouchAction): string {
  if (action.op === "audio" && touchValue(action) !== "other") return "Mute or unmute a device not connected now";
  if (action.op === "obs" && touchValue(action) !== "other") return "An OBS scene OBS doesn't list now";
  return "Set in the config (kept)";
}
