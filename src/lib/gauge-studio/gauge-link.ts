/**
 * The library item a profile gauge is linked to (spec §6): the gauge item whose placed copies include this
 * gauge's profile, zone and (a canvas Gauge item) item path. Saving updates it; an unlinked gauge's first
 * save creates the item and records that copy.
 */
import type { LibraryCopy, LibraryItem } from "@/lib/library";
import type { GaugeSource } from "./model";

/** Where a profile gauge lives, as a copy record. */
export type GaugeLink = Pick<LibraryCopy, "profileId" | "pageId"> & { zoneId: string; itemPath?: string };

/** The link of a profile gauge (null for a preset or library source). */
export function linkOf(profile: { profileId: string; pageId?: string }, source: GaugeSource): GaugeLink | null {
  if (source.kind !== "canvas" && source.kind !== "widget") return null;
  return {
    profileId: profile.profileId,
    ...(profile.pageId ? { pageId: profile.pageId } : {}),
    zoneId: source.zoneId,
    ...(source.kind === "canvas" ? { itemPath: source.path } : {}),
  };
}

/** Whether `copy` is the copy placed at `link`. */
export const isLinkCopy = (c: LibraryCopy, link: GaugeLink): boolean => c.profileId === link.profileId && c.zoneId === link.zoneId && c.itemPath === link.itemPath;

/** When the latest copy of `item` at `link` was recorded (else the item's own update time). */
const linkedAt = (item: LibraryItem, link: GaugeLink): string =>
  item.copies.filter((c) => isLinkCopy(c, link)).reduce((latest, c) => ((c.at ?? "") > latest ? (c.at ?? "") : latest), "") || item.updatedAt || item.createdAt;

/**
 * The gauge item with a copy placed at `link`; of several, the one linked most recently (whatever the list order).
 * A canvas gauge's link is its item index path, so deleting or reordering canvas items can move a link to another gauge.
 */
export function linkedItem(items: readonly LibraryItem[], link: GaugeLink): LibraryItem | undefined {
  const linked = items.filter((i) => i.kind === "gauge" && i.copies.some((c) => isLinkCopy(c, link)));
  return linked.reduce<LibraryItem | undefined>((best, i) => (!best || linkedAt(i, link) > linkedAt(best, link) ? i : best), undefined);
}
