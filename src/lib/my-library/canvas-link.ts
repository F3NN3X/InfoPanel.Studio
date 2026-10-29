/**
 * InfoPanel profiles in the Library (kind "canvas"): how a stored canvas becomes an item, how an
 * edited profile updates it, and which item a placed profile came from. The link needs no field of
 * its own: a placed profile keeps the `source` (name and import time) it was saved with, and the
 * item records the same two values in its meta (older items have none, and are found by their
 * copies instead). Removing an item never touches this: the Library's remove-with-files guard
 * still scans the live config for every file a placed profile uses.
 */
import { assetUrl } from "../infopanel/canvas.ts";
import type { StoredCanvas } from "../infopanel/import/stored.ts";
import { CANVAS_ID, type DashboardConfig } from "../layout.ts";
import { getLibraryItem, type LibraryItem, type NewLibraryItem } from "../library.ts";
import { findCanvasUse } from "./canvas-use.ts";
import { isProfileItem, type ComponentRoles } from "./component-meta.ts";
import { stampFormat } from "./item-format.ts";

const ASSET_PREFIX = "/api/assets/";

/** Every item in a canvas, inside groups too (the Library card's count). */
export function countItems(items: StoredCanvas["items"]): number {
  return items.reduce((n, i) => n + 1 + ("DisplayItems" in i && Array.isArray(i.DisplayItems) ? countItems(i.DisplayItems) : 0), 0);
}

/** What the Library page filters and sorts a profile by, how a placed copy is told from it, and its format. */
export function canvasMeta(stored: StoredCanvas): Record<string, unknown> {
  return stampFormat({
    width: Number(stored.profile.Width) || 0,
    height: Number(stored.profile.Height) || 0,
    items: countItems(stored.items),
    source: stored.source.origin,
    sourceName: stored.source.name,
    importedAt: stored.source.importedAt,
  });
}

/** The asset store ids a canvas holds: its files and kept screenshot, keeping `previous` ids whose bytes it still uses. */
export function canvasFiles(stored: Pick<StoredCanvas, "assets" | "screenshot">, previous: readonly string[] = []): string[] {
  const ids = stored.assets.flatMap((a) => {
    const url = assetUrl(a.hash, a.type as Parameters<typeof assetUrl>[1]);
    return url ? [url.slice(ASSET_PREFIX.length)] : [];
  });
  const hashes = new Set(stored.assets.map((a) => a.hash));
  const kept = previous.filter((id) => hashes.has(id.slice(0, 64)));
  return [...new Set([...ids, ...kept, ...(stored.screenshot ? [stored.screenshot] : [])])];
}

/** A new Library item for a profile. */
export function canvasItem(stored: StoredCanvas, name: string): NewLibraryItem<StoredCanvas> {
  return { kind: "canvas", name, data: stored, files: canvasFiles(stored), meta: canvasMeta(stored) };
}

/** A new Library item for a component: a canvas flagged in its meta, with the roles its sensors were saved with. */
export function componentItem(stored: StoredCanvas, name: string, roles: ComponentRoles): NewLibraryItem<StoredCanvas> {
  return { ...canvasItem(stored, name), meta: { ...canvasMeta(stored), component: true, roles } };
}

/** The patch that brings an item up to date with an edited profile: its data, files and meta (the name stays the user's). */
export function canvasUpdate(item: Pick<LibraryItem, "files" | "meta">, stored: StoredCanvas): Pick<NewLibraryItem<StoredCanvas>, "data" | "files" | "meta"> {
  return { data: stored, files: canvasFiles(stored, item.files), meta: { ...item.meta, ...canvasMeta(stored) } };
}

const metaSource = (item: Pick<LibraryItem, "meta">) => {
  const m = item.meta as { sourceName?: unknown; importedAt?: unknown };
  return typeof m.sourceName === "string" && typeof m.importedAt === "string" ? { name: m.sourceName, importedAt: m.importedAt } : null;
};

const isSource = (item: Pick<LibraryItem, "meta">, source: StoredCanvas["source"]) => {
  const s = metaSource(item);
  return s !== null && s.name === source.name && s.importedAt === source.importedAt;
};

/** The Library profile a placed one was saved to or came from; undefined when it has no item. */
export function linkedItem(items: readonly LibraryItem[], canvas: Pick<StoredCanvas, "source">, zoneId: string): LibraryItem | undefined {
  const profiles = items.filter(isProfileItem);
  return profiles.find((i) => isSource(i, canvas.source)) ?? profiles.find((i) => i.copies.some((c) => c.zoneId === zoneId));
}

/** The saved profiles with no zone in this dashboard (a copy of one made on another screen counts as placed). */
export function unplacedProfiles(items: readonly LibraryItem[], config: Pick<DashboardConfig, "profiles">): LibraryItem[] {
  const zones = config.profiles.flatMap((p) => p.pages.flatMap((pg) => pg.placements.filter((z) => z.module === CANVAS_ID && z.canvas)));
  return items.filter((i) => {
    if (!isProfileItem(i)) return false;
    const s = metaSource(i);
    if (s && findCanvasUse(config, { source: { ...s, origin: "new" } })) return false;
    return !i.copies.some((c) => zones.some((z) => z.id === c.zoneId));
  });
}

/** A saved profile as a new, independent one: its own name, identity and time, so it isn't taken for the item it copies. */
export function copyOfProfile(stored: StoredCanvas, name: string, now: Date = new Date()): StoredCanvas {
  return {
    ...stored,
    source: { name, origin: "new", importedAt: now.toISOString() },
    profile: { ...stored.profile, Name: name, Guid: crypto.randomUUID() },
  };
}

const loaded = new Map<string, Promise<StoredCanvas | undefined>>();

/** A Library profile's stored canvas: from the list when it came with the item, else fetched once per version of the item. */
export function canvasData(item: Pick<LibraryItem, "id" | "updatedAt" | "data" | "dataSize">): Promise<StoredCanvas | undefined> {
  if (item.data !== undefined) return Promise.resolve(item.data as StoredCanvas);
  const key = `${item.id}:${item.updatedAt}`;
  let p = loaded.get(key);
  if (!p) {
    p = getLibraryItem<StoredCanvas>(item.id).then((full) => full.data);
    p.catch(() => loaded.delete(key));
    loaded.set(key, p);
  }
  return p;
}
