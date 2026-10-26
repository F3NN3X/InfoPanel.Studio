/**
 * My library's page model (spec §3): what an item's meta holds, its auto tags, the sidebar
 * collections, "search everything", sorting, duplicates and the cleanup counts. Pure; the items
 * come from `listLibrary()`.
 */
import { formatBytes } from "@/lib/assets";
import type { AssetType } from "@/lib/infopanel/assets/assets";
import type { DroppedFile } from "@/lib/infopanel/canvas-edit";
import type { Verdict } from "@/lib/infopanel/font-licence";
import type { LibraryItem, LibraryKind } from "@/lib/library";
import { aspectTag, hamming, type PixelStats } from "./analyse";
import { isComponent, isProfileItem } from "./component-meta";
import { BUILTIN_STYLE, BUILTIN_THEME, CONFIG_PREFIXES } from "./config-items";

export type Licence = Verdict;

/** What the Library keeps on a file item's `meta` (written at upload). */
export interface MediaMeta {
  /** The sniffed file type: png, jpeg, gif, webp, avif, bmp, ico, svg, mp4, webm, ttf, otf, woff2 … */
  type?: string;
  /** Bytes. */
  size?: number;
  width?: number;
  height?: number;
  /** Video length, seconds. */
  duration?: number;
  /** Animation frames (GIF, APNG, animated WebP); an image sequence gauge's frame count. */
  frames?: number;
  /** SHA-256 of the bytes (the asset id's hash). */
  hash?: string;
  /** dHash, 16 hex digits. */
  phash?: string;
  stats?: PixelStats;
  /** The auto tags (spec §3), set at upload. */
  tags?: string[];
  /** A video with an audio track. */
  audio?: boolean;
  /** Video playback (detail pane). */
  loop?: boolean;
  muted?: boolean;
  /** Poster frame, seconds into the video. */
  poster?: number;
  /** An SVG template's variables (`--value`, `--percent`). */
  vars?: string[];
  /** Fonts. */
  family?: string;
  faces?: number;
  licence?: Licence;
  embedding?: string;
  origin?: string;
  /** Gauges: "Vector gauge · arc", "Image sequence · 101 frames". */
  gaugeKind?: string;
  /** Panels: the panel's cells. */
  cols?: number;
  rows?: number;
  /** Imported canvases: the item count. */
  items?: number;
  /** Themes: the page, surface and accent colours of the card's thumbnail (CSS colours). */
  swatch?: string[];
}

export const metaOf = (item: Pick<LibraryItem, "meta">): MediaMeta => (item.meta ?? {}) as MediaMeta;

/** The content hash of an item's first file (asset ids are `<sha256>.<ext>`). */
export function hashOf(item: Pick<LibraryItem, "files" | "meta">): string | undefined {
  const m = metaOf(item);
  if (m.hash) return m.hash;
  const id = item.files[0];
  return id && /^[a-f0-9]{64}\./.test(id) ? id.slice(0, 64) : undefined;
}

/** The URL of an item's first file in the asset store. */
export const fileUrl = (item: Pick<LibraryItem, "files">): string | undefined => (item.files[0] ? `/api/assets/${item.files[0]}` : undefined);

/* ---- auto tags ---- */

const MEDIA = new Set<LibraryKind>(["image", "video", "svg"]);

/** A background (wide enough to fill a page) or an icon (small), from the kind and size. */
export function roleOf(kind: LibraryKind, m: MediaMeta): "background" | "icon" | null {
  if (!MEDIA.has(kind)) return null;
  const w = m.width ?? 0;
  const h = m.height ?? 0;
  if (kind !== "svg" && w >= 640 && h >= 240) return "background";
  if (w > 0 && h > 0 && Math.max(w, h) <= 256 && !(m.vars?.length)) return "icon";
  return null;
}

/**
 * The auto tags of a file (spec §3): Dark / Light, one or two hue names, Wide / Tall / Square,
 * Transparent, Animated, Loop, and its role (Background, Icon).
 */
export function autoTags(kind: LibraryKind, m: MediaMeta): string[] {
  const tags: string[] = [];
  const s = m.stats;
  if (s) {
    if (s.luminance < 0.2) tags.push("Dark");
    else if (s.luminance > 0.6) tags.push("Light");
    tags.push(...s.hues);
    if (s.alpha) tags.push("Transparent");
  }
  const shape = m.width && m.height ? aspectTag(m.width, m.height) : null;
  if (shape) tags.push(shape);
  if (kind === "video" || (m.frames ?? 1) > 1) tags.push("Animated");
  if (kind === "video" && (m.loop || m.audio === false)) tags.push("Loop");
  const role = roleOf(kind, m);
  if (role === "background") tags.push("Background");
  if (role === "icon") tags.push("Icon");
  return [...new Set(tags)];
}

export const tagsOf = (item: Pick<LibraryItem, "kind" | "meta">): string[] => metaOf(item).tags ?? autoTags(item.kind, metaOf(item));

/* ---- collections ---- */

export type CollectionId =
  | "all"
  | "recent"
  | "unused"
  | "large"
  | "duplicates"
  | "suggested"
  | "themes"
  | "media"
  | "images"
  | "videos"
  | "backgrounds"
  | "icons"
  | "svg"
  | "fonts"
  | "gauges"
  | "panels"
  | "styles"
  | "canvases"
  | "components";

export interface Collection {
  id: CollectionId;
  label: string;
  section: "Smart" | "Library";
  /** The type collection this one sits under in the sidebar (Media's sub-kinds). */
  parent?: CollectionId;
  /** The hint line under the header (SPEC §10.4); a child shows its parent's. */
  hint?: string;
}

export const COLLECTIONS: Collection[] = [
  { id: "all", label: "All items", section: "Smart" },
  { id: "recent", label: "Recent", section: "Smart" },
  { id: "unused", label: "Unused", section: "Smart" },
  { id: "large", label: "Large files", section: "Smart" },
  { id: "duplicates", label: "Duplicates", section: "Smart" },
  { id: "suggested", label: "Suggested for theme", section: "Smart" },
  { id: "themes", label: "Themes", section: "Library", hint: "A Theme is a whole look. Apply one in Theme at any scope." },
  { id: "styles", label: "Styles", section: "Library", hint: "A Style is one widget’s look. Apply from a widget’s Style tab." },
  { id: "panels", label: "Panels", section: "Library", hint: "Reusable widget groups. Drag onto the canvas from Design › Add." },
  { id: "gauges", label: "Gauges", section: "Library", hint: "Open a gauge to edit it in Gauges." },
  { id: "media", label: "Media", section: "Library", hint: "Images and videos. Use one as a background from Theme › Background." },
  { id: "images", label: "Images", section: "Library", parent: "media" },
  { id: "videos", label: "Videos", section: "Library", parent: "media" },
  { id: "backgrounds", label: "Backgrounds", section: "Library", parent: "media" },
  { id: "icons", label: "Icons", section: "Library", parent: "media" },
  { id: "svg", label: "SVG templates", section: "Library", parent: "media" },
  { id: "fonts", label: "Fonts", section: "Library", hint: "Fonts appear in every Typography picker." },
  { id: "components", label: "Components", section: "Library", hint: "Pieces of an InfoPanel profile. Drag one onto the screen or onto an InfoPanel profile in Edit, or save one from a selection there." },
  { id: "canvases", label: "InfoPanel profiles", section: "Library", hint: "Profiles for the InfoPanel app. Edit opens one in Edit; a new profile can start from one." },
];

/** The hint line of a collection (a sub-kind of Media shows Media's); none for the smart ones. */
export function hintOf(id: CollectionId): string | undefined {
  const c = COLLECTIONS.find((x) => x.id === id);
  return c?.hint ?? (c?.parent ? hintOf(c.parent) : undefined);
}

/** Large: over 1 MB (the profile assets tab also flags files stored bigger than drawn). */
export const LARGE_BYTES = 1024 * 1024;
/** Recent: added or edited within a week. */
export const RECENT_MS = 7 * 24 * 3600 * 1000;

/** Everything the page's collections need, worked out once for a list. */
export interface LibraryIndex {
  items: LibraryItem[];
  /** Duplicate groups (identical bytes, or the same size and a near perceptual hash). */
  duplicates: LibraryItem[][];
  /** Item id → its duplicate group. */
  groupOf: Map<string, LibraryItem[]>;
  /** The theme's top backgrounds, best first, with their reason. */
  suggested: { item: LibraryItem; reason: string }[];
}

const KIND_OF: Partial<Record<CollectionId, LibraryKind>> = {
  themes: "theme",
  images: "image",
  videos: "video",
  svg: "svg",
  fonts: "font",
  gauges: "gauge",
  panels: "panel",
  styles: "style",
};

export function inCollection(item: LibraryItem, id: CollectionId, index: LibraryIndex, now = Date.now()): boolean {
  if (id === "canvases") return isProfileItem(item);
  if (id === "components") return isComponent(item);
  const kind = KIND_OF[id];
  if (kind) return item.kind === kind;
  const m = metaOf(item);
  switch (id) {
    case "all":
      return true;
    case "media":
      return MEDIA.has(item.kind);
    case "recent":
      return now - Date.parse(item.updatedAt || item.createdAt) <= RECENT_MS;
    case "unused":
      return item.copies.length === 0;
    case "large":
      return (m.size ?? 0) > LARGE_BYTES;
    case "duplicates":
      return index.groupOf.has(item.id);
    case "suggested":
      return index.suggested.some((s) => s.item.id === item.id);
    case "backgrounds":
      return tagsOf(item).includes("Background");
    case "icons":
      return tagsOf(item).includes("Icon");
    default:
      return false;
  }
}

export function collectionItems(id: CollectionId, index: LibraryIndex, now = Date.now()): LibraryItem[] {
  if (id === "suggested") return index.suggested.map((s) => s.item);
  return index.items.filter((i) => inCollection(i, id, index, now));
}

export function collectionCounts(index: LibraryIndex, now = Date.now()): Record<CollectionId, number> {
  return Object.fromEntries(COLLECTIONS.map((c) => [c.id, collectionItems(c.id, index, now).length])) as Record<CollectionId, number>;
}

/* ---- duplicates ---- */

/** The largest perceptual hash distance that still "looks identical". */
export const LOOKS_IDENTICAL = 4;

/**
 * Groups of duplicates: identical bytes (SHA-256), or images of the same pixel size whose
 * perceptual hashes are within `LOOKS_IDENTICAL`. Oldest first in each group.
 */
export function duplicateGroups(items: readonly LibraryItem[]): LibraryItem[][] {
  const media = items.filter((i) => MEDIA.has(i.kind) || i.kind === "font");
  const parent = media.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const byHash = new Map<string, number>();
  media.forEach((item, i) => {
    const h = hashOf(item);
    if (!h) return;
    const seen = byHash.get(h);
    if (seen === undefined) byHash.set(h, i);
    else join(i, seen);
  });
  for (let a = 0; a < media.length; a++) {
    const ma = metaOf(media[a]);
    if (!ma.phash || !ma.width) continue;
    for (let b = a + 1; b < media.length; b++) {
      const mb = metaOf(media[b]);
      if (mb.phash && ma.width === mb.width && ma.height === mb.height && hamming(ma.phash, mb.phash) <= LOOKS_IDENTICAL) join(a, b);
    }
  }
  const groups = new Map<number, LibraryItem[]>();
  media.forEach((item, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), item]));
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt)));
}

export function buildIndex(items: LibraryItem[], suggested: LibraryIndex["suggested"] = []): LibraryIndex {
  const duplicates = duplicateGroups(items);
  const groupOf = new Map<string, LibraryItem[]>();
  for (const g of duplicates) for (const i of g) groupOf.set(i.id, g);
  return { items, duplicates, groupOf, suggested };
}

/** The banner and "Needs attention" counts: extra copies, unused items, large files. */
export function cleanupCounts(index: LibraryIndex): { duplicates: number; unused: number; large: number; largeBytes: number } {
  const large = index.items.filter((i) => (metaOf(i).size ?? 0) > LARGE_BYTES);
  return {
    duplicates: index.duplicates.reduce((n, g) => n + g.length - 1, 0),
    unused: index.items.filter((i) => i.copies.length === 0).length,
    large: large.length,
    largeBytes: large.reduce((n, i) => n + (metaOf(i).size ?? 0), 0),
  };
}

/** A card's flag chip. */
export function flagOf(item: LibraryItem, index: LibraryIndex): "Duplicate" | "Unused" | null {
  if (index.groupOf.has(item.id)) return "Duplicate";
  return item.copies.length === 0 ? "Unused" : null;
}

/* ---- search, tags, sort ---- */

export const KIND_LABEL: Record<LibraryKind, string> = {
  image: "Image",
  video: "Video",
  font: "Font",
  svg: "SVG template",
  gauge: "Gauge",
  panel: "Panel",
  style: "Style",
  canvas: "Canvas",
  theme: "Theme",
};

/** Every word a search can match for an item: name, kind, type, pixel size and tags. */
export function searchText(item: LibraryItem): string {
  const m = metaOf(item);
  const size = m.width && m.height ? `${m.width}×${m.height} ${m.width}x${m.height} ${m.width} ${m.height}` : "";
  return [item.name, item.kind, KIND_LABEL[item.kind], m.type, size, m.family, m.gaugeKind, ...tagsOf(item)].filter(Boolean).join(" ").toLowerCase();
}

/** Search everything (spec §3): every word must match, ignoring case. */
export function search(items: readonly LibraryItem[], query: string): LibraryItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  return items.filter((i) => {
    const text = searchText(i);
    return words.every((w) => text.includes(w));
  });
}

/** The most frequent tags of a list (the grid's chips), most frequent first, ties by name. */
export function topTags(items: readonly LibraryItem[], n = 7): string[] {
  const counts = new Map<string, number>();
  for (const i of items) for (const t of tagsOf(i)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([t]) => t);
}

export type SortId = "recent" | "name" | "size" | "used";

export const SORTS: { id: SortId; label: string }[] = [
  { id: "recent", label: "Recently added" },
  { id: "name", label: "Name" },
  { id: "size", label: "File size" },
  { id: "used", label: "Most used" },
];

export function sortItems(items: readonly LibraryItem[], by: SortId): LibraryItem[] {
  const out = [...items];
  const time = (i: LibraryItem) => Date.parse(i.createdAt) || 0;
  switch (by) {
    case "name":
      return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    case "size":
      return out.sort((a, b) => (metaOf(b).size ?? b.dataSize ?? 0) - (metaOf(a).size ?? a.dataSize ?? 0));
    case "used":
      return out.sort((a, b) => b.copies.length - a.copies.length || time(b) - time(a));
    default:
      return out.sort((a, b) => time(b) - time(a));
  }
}

/* ---- display ---- */

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** A card's mono meta line ("1920 × 550 · 1.8 MB", "0:12 · 1920 × 550 · 8.4 MB", "4 faces · 412 KB"). */
export function metaLine(item: LibraryItem): string {
  const m = metaOf(item);
  const px = m.width && m.height ? `${m.width} × ${m.height}` : null;
  const bytes = m.size ? formatBytes(m.size) : null;
  switch (item.kind) {
    case "video":
      return [m.duration ? clock(m.duration) : null, px, bytes].filter(Boolean).join(" · ");
    case "font":
      return [m.faces ? `${m.faces} face${m.faces === 1 ? "" : "s"}` : null, bytes, m.origin].filter(Boolean).join(" · ");
    case "gauge":
      return m.gaugeKind ?? "Gauge";
    case "panel":
      return m.cols && m.rows ? `${m.cols} × ${m.rows} cells` : "Panel";
    case "style":
      return "Style";
    case "theme":
      return "Theme";
    case "canvas":
      if (isComponent(item)) return [px, m.items !== undefined ? `${m.items} items` : null].filter(Boolean).join(" · ") || "Component";
      return [px, m.items !== undefined ? `${m.items} items` : null].filter(Boolean).join(" · ") || "Canvas";
    default:
      return [px, bytes].filter(Boolean).join(" · ");
  }
}

/** An item the config or the app supplies (saved Themes, Styles and Panels, the built-ins): read-only, never removed from here. */
export const isConfigItem = (item: Pick<LibraryItem, "id">): boolean => CONFIG_PREFIXES.some((p) => item.id.startsWith(p));

/** A card's tag: Built-in (muted) for what ships with the app, else what the item is (accent). */
export function cardTag(item: Pick<LibraryItem, "id" | "kind" | "meta">): { text: string; builtin: boolean } {
  if (item.id.startsWith(BUILTIN_THEME) || item.id.startsWith(BUILTIN_STYLE)) return { text: "Built-in", builtin: true };
  const m = metaOf(item);
  switch (item.kind) {
    case "image":
    case "video":
      return { text: KIND_LABEL[item.kind], builtin: false };
    case "svg":
      return { text: roleOf("svg", m) === "icon" ? "Icon" : "SVG template", builtin: false };
    case "font":
      return { text: m.origin ?? "Added", builtin: false };
    case "canvas":
      return { text: isComponent(item) ? "Component" : "Imported", builtin: false };
    default:
      return { text: "Saved", builtin: false };
  }
}

/** The items a screen uses: those with a placed copy in it (the config stand-ins count none). */
export const usedByScreen = (items: readonly LibraryItem[], profileId: string): LibraryItem[] =>
  items.filter((i) => i.copies.some((c) => c.profileId === profileId));

/** "2 copies placed · editing this one changes none of them". */
export function copiesLine(n: number): string {
  if (n === 0) return "Not placed anywhere yet";
  return `${n} ${n === 1 ? "copy" : "copies"} placed · editing this one changes none of them`;
}

/* ---- into a canvas zone ---- */

const STORE_TYPES: Record<string, AssetType> = { png: "png", jpeg: "jpeg", gif: "gif", webp: "webp", bmp: "bmp", ico: "ico", svg: "svg", mp4: "video", webm: "video" };

/** A library item as a file a canvas zone can hold (InfoPanel draws no AVIF). */
export function droppedFileOf(item: LibraryItem): DroppedFile | null {
  const m = metaOf(item);
  const id = item.files[0];
  const type = STORE_TYPES[m.type ?? ""];
  if (!id || !type) return null;
  return { name: item.name, hash: id.slice(0, 64), type, size: m.size ?? 0, ext: id.slice(65), width: m.width, height: m.height };
}
