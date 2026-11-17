/**
 * The Keys widget's keys (pinned layer P7, decision 4, owner Q2): Studio's own key grid, a built-in beside the Elgato Stream
 * Deck widget, which stays as it is. A key is a name, an icon (as a rail slot's: the icon set, an image, an app's icon or
 * text) and a touch map: its tap, hold and double tap each run an action, a command included (the action runner). A folder
 * key holds keys of its own, one level deep, and its tap opens it. The keys are stored on the placement (`Placement.keys`,
 * config v20), not in its settings, which are scalars (as the rail's slots are on the pinned item).
 */
import { normalizeRailIcon, normalizeTouchMap, remapTouchPages, type RailIcon, type TouchAction, type TouchMap } from "./pinned";

export interface KeySlot {
  id: string;
  name: string;
  icon?: RailIcon;
  /** The glyph's series colour (1–6); unset = the text colour. */
  series?: number;
  touch?: TouchMap;
  /** A folder: the keys it opens (no folder inside a folder). */
  keys?: KeySlot[];
}

/** The most keys kept on one level. */
export const MAX_KEYS = 48;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function normalizeLevel(raw: unknown, pages: ReadonlySet<string> | undefined, folders: boolean): KeySlot[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((k): KeySlot[] => {
    if (!isRecord(k) || !text(k.id) || seen.has(k.id) || typeof k.name !== "string") return [];
    seen.add(k.id);
    const icon = normalizeRailIcon(k.icon);
    const touch = normalizeTouchMap(k.touch, pages);
    const series = typeof k.series === "number" && Number.isInteger(k.series) && k.series >= 1 && k.series <= 6 ? k.series : undefined;
    const inner = folders && Array.isArray(k.keys) ? normalizeLevel(k.keys, pages, false) : undefined;
    return [{ id: k.id, name: k.name, ...(icon ? { icon } : {}), ...(series ? { series } : {}), ...(touch ? { touch } : {}), ...(inner ? { keys: inner } : {}) }];
  }).slice(0, MAX_KEYS);
}

/**
 * A placement's stored keys, guarded: a key with no id, a repeated id or no name is dropped, an unknown icon or action goes
 * (a page action whose page is gone too, when `pages` is given), a folder inside a folder is dropped, and at most
 * `MAX_KEYS` stay on a level. Not a list = undefined (no keys stored).
 */
export function normalizeKeys(raw: unknown, pages?: ReadonlySet<string>): KeySlot[] | undefined {
  return Array.isArray(raw) ? normalizeLevel(raw, pages, true) : undefined;
}

/** Keys with their page actions moved to new page ids (a profile copied with fresh ids). */
export function remapKeyPages(keys: readonly KeySlot[], ids: ReadonlyMap<string, string>): KeySlot[] {
  return keys.map((k) => ({ ...k, ...(k.touch ? { touch: remapTouchPages(k.touch, ids) } : {}), ...(k.keys ? { keys: remapKeyPages(k.keys, ids) } : {}) }));
}

/** The grid a level's keys are laid out on in a `w` × `h` box: about square keys, as few rows as fit them all. */
export function keyGrid(count: number, w: number, h: number, cols?: number): { cols: number; rows: number } {
  const n = Math.max(1, count);
  const c = cols && cols > 0 ? Math.min(cols, n) : Math.max(1, Math.min(n, Math.ceil(Math.sqrt((n * Math.max(1, w)) / Math.max(1, h)))));
  return { cols: c, rows: Math.ceil(n / c) };
}

/** What a key's tap does: its folder opens, else its tap action (none: nothing). */
export const keyTap = (k: KeySlot): TouchAction | "folder" | undefined => (k.keys ? "folder" : k.touch?.tap);

/** The corner mark a key carries: a hold (one dot) or a double tap (two); both set shows two. */
export const keyMark = (k: KeySlot): "hold" | "double" | undefined => (k.touch?.doubleTap ? "double" : k.touch?.hold ? "hold" : undefined);

/** The words a screen reader adds for a key's other gestures and its folder. */
export function keyMore(k: KeySlot): string {
  return [k.keys ? "opens a folder" : "", k.touch?.hold ? "hold for more" : "", k.touch?.doubleTap ? "double tap for more" : ""].filter(Boolean).join(", ");
}

/** Every key of a list, a folder's included. */
export const allKeys = (keys: readonly KeySlot[]): KeySlot[] => keys.flatMap((k) => [k, ...(k.keys ?? [])]);
