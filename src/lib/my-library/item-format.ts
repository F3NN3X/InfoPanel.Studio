/**
 * The format a Library item's own data is saved in. Profiles, components and gauges carry `meta.formatVersion`; an
 * item without one (saved before it existed) or with a lower one counts as older. An older item still opens and
 * places as it is, read through today's readers; Update rewrites it in today's format, after keeping a backup copy
 * of it (`meta.backupOf`, never counted as older itself). Files, and items kept in the config, have no format.
 */
import { gaugeDataOf } from "../gauge-studio/model.ts";
import { readStored } from "../infopanel/import/stored.ts";
import type { LibraryItem, NewLibraryItem } from "../library.ts";

/** Raise when a kind's data changes shape, with the step that brings older data up in `upgradedData`. */
export const ITEM_FORMAT = 1;

const FORMATTED: ReadonlySet<LibraryItem["kind"]> = new Set(["canvas", "gauge"]);
/** The config's and the built-in items (`config-items.ts`), and a gauge dragged from a screen: never on the server. */
const NOT_STORED = /^(cfg|builtin)-/;

/** `meta` stamped with today's format. */
export const stampFormat = (meta: Record<string, unknown> = {}): Record<string, unknown> => ({ ...meta, formatVersion: ITEM_FORMAT });

/** A backup Update kept: the item it was taken from, or undefined. */
export const backupOf = (item: Pick<LibraryItem, "meta">): string | undefined => {
  const id = item.meta?.backupOf;
  return typeof id === "string" ? id : undefined;
};

/** The item was saved by an older version and can be updated. */
export function isOlderItem(item: Pick<LibraryItem, "id" | "kind" | "meta">): boolean {
  if (!FORMATTED.has(item.kind) || NOT_STORED.test(item.id) || backupOf(item) !== undefined) return false;
  const v = item.meta?.formatVersion;
  return !(typeof v === "number" && v >= ITEM_FORMAT);
}

/** An item's data in today's format; throws when it can't be read. */
export function upgradedData(kind: LibraryItem["kind"], data: unknown): unknown {
  if (kind === "canvas") return readStored(data).stored;
  if (kind === "gauge") {
    const gauge = gaugeDataOf(data);
    if (!gauge) throw new Error("it has no gauge to read");
    return gauge;
  }
  return data;
}

export interface FormatStore {
  get: (id: string) => Promise<LibraryItem>;
  create: (item: NewLibraryItem) => Promise<LibraryItem>;
  update: (id: string, patch: Partial<NewLibraryItem>) => Promise<LibraryItem>;
}

export interface UpdatedItem {
  item: LibraryItem;
  backup: LibraryItem;
}

/**
 * `item` rewritten in today's format: its data is read first (an unreadable item is left as it was), then a backup
 * copy with the data as it was is saved, and only then the item itself. Its id, name, files and copies stay.
 */
export async function updateItemFormat(item: LibraryItem, store: FormatStore): Promise<UpdatedItem> {
  const full = item.data !== undefined || !item.dataSize ? item : await store.get(item.id);
  const data = upgradedData(full.kind, full.data);
  const backup = await store.create({
    kind: full.kind,
    name: `${full.name} (before update)`,
    files: full.files,
    meta: { ...full.meta, backupOf: full.id },
    ...(full.data !== undefined ? { data: full.data } : {}),
  });
  const updated = await store.update(full.id, { data, meta: stampFormat(full.meta) });
  return { item: updated, backup };
}
