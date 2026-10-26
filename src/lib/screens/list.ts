import { CANVAS_ID, type MonitorProfile, type Placement, type ProfilePage } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";

/**
 * The Screens manager's pure list rules: what a screen is (Studio, InfoPanel or Mixed, from its zones), the
 * entries the page lists (screens and saved Library profiles), and how they are searched, filtered and sorted.
 */

export type ScreenKind = "dashboard" | "infopanel" | "mixed";
/** What an entry is: a screen by its zones, or a saved InfoPanel profile in the Library. */
export type EntryKind = ScreenKind | "saved";

export const KIND_LABEL: Record<EntryKind, string> = {
  dashboard: "Studio",
  infopanel: "InfoPanel",
  mixed: "Mixed",
  saved: "Saved",
};

/** Studio ("dashboard") when no zone is an InfoPanel canvas (an empty screen too), InfoPanel when all are, else Mixed. */
export function screenKind(profile: Pick<MonitorProfile, "pages">): ScreenKind {
  const zones = profile.pages.flatMap((pg) => pg.placements);
  const canvases = zones.filter((z) => z.module === CANVAS_ID).length;
  if (canvases === 0) return "dashboard";
  return canvases === zones.length ? "infopanel" : "mixed";
}

/** A page that is one canvas filling the screen: the editor opens it as a Free page. */
export function freeCanvasOf(profile: Pick<MonitorProfile, "cols" | "rows">, page: Pick<ProfilePage, "placements">): Placement | null {
  const [only, ...rest] = page.placements;
  if (!only || rest.length || only.module !== CANVAS_ID) return null;
  return only.colStart === 1 && only.rowStart === 1 && only.colSpan === profile.cols && only.rowSpan === profile.rows ? only : null;
}

/** Until a screen says who it is made for (phase 3), one whose pages are all Free is made for InfoPanel. */
export const madeForInfoPanel = (profile: Pick<MonitorProfile, "cols" | "rows" | "pages">): boolean =>
  profile.pages.length > 0 && profile.pages.every((page) => freeCanvasOf(profile, page) !== null);

/** One row of the list. `order` is where it sits in the config or the Library (the manual sort). */
export interface ListEntry {
  id: string;
  source: "screen" | "saved";
  name: string;
  kind: EntryKind;
  width: number;
  height: number;
  /** Screens only. */
  pages: number;
  /** ISO time of the last edit; absent on a screen nothing has edited yet. */
  updatedAt?: string;
  order: number;
}

export function screenEntries(profiles: readonly MonitorProfile[]): ListEntry[] {
  return profiles.map((p, order) => ({
    id: p.id,
    source: "screen",
    name: p.name,
    kind: screenKind(p),
    width: p.width,
    height: p.height,
    pages: p.pages.length,
    updatedAt: p.updatedAt,
    order,
  }));
}

export function savedEntries(items: readonly Pick<LibraryItem, "id" | "name" | "meta" | "updatedAt">[]): ListEntry[] {
  return items.map((i, order) => ({
    id: i.id,
    source: "saved",
    name: i.name,
    kind: "saved",
    width: Number(i.meta.width) || 0,
    height: Number(i.meta.height) || 0,
    pages: 0,
    updatedAt: i.updatedAt,
    order,
  }));
}

/** The Show filter (one-editor SPEC §4.2): Studio screens, or InfoPanel profiles (placed and saved in the Library). */
export type ListFilter = "all" | "dashboard" | "infopanel";
export const FILTERS: readonly { id: ListFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "dashboard", label: "Studio" },
  { id: "infopanel", label: "InfoPanel" },
];

/** The words a search looks in: name, kind and size (typed `1920x480` or `1920×480`). */
const haystack = (e: ListEntry) => `${e.name} ${KIND_LABEL[e.kind]} ${e.width}×${e.height}`.toLowerCase();
const normalQuery = (q: string) => q.trim().toLowerCase().replace(/(\d)\s*[x*]\s*(?=\d)/g, "$1×");

/** Entries matching the search (every word) and the filter. A Mixed screen shows under Studio and InfoPanel both; a saved profile under InfoPanel. */
export function filterEntries(entries: readonly ListEntry[], query: string, filter: ListFilter): ListEntry[] {
  const words = normalQuery(query).split(/\s+/).filter(Boolean);
  const inFilter = (e: ListEntry) => {
    if (filter === "all") return true;
    if (e.source === "saved") return filter === "infopanel";
    return e.kind === filter || e.kind === "mixed";
  };
  return entries.filter((e) => inFilter(e) && words.every((w) => haystack(e).includes(w)));
}

export type ListSort = "edited" | "name" | "size" | "manual";
export const SORTS: readonly { id: ListSort; label: string }[] = [
  { id: "edited", label: "Last edited" },
  { id: "name", label: "Name" },
  { id: "size", label: "Size" },
  { id: "manual", label: "Your order" },
];

const time = (e: ListEntry) => (e.updatedAt ? Date.parse(e.updatedAt) || 0 : 0);

/** A sorted copy. Ties keep the manual order; never-edited entries come last under Last edited; Size is largest first. */
export function sortEntries(entries: readonly ListEntry[], sort: ListSort): ListEntry[] {
  const by: Record<ListSort, (a: ListEntry, b: ListEntry) => number> = {
    edited: (a, b) => time(b) - time(a),
    name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    size: (a, b) => b.width * b.height - a.width * a.height,
    manual: () => 0,
  };
  return [...entries].sort((a, b) => by[sort](a, b) || a.order - b.order);
}
