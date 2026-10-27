import {
  ITEM_ID,
  clonePlacement,
  uid,
  type MonitorProfile,
  type PageRotate,
  type Placement,
  type ProfilePage,
  type ProfileView,
} from "./layout";
import { fitFreePages } from "./free-pages";

/**
 * Profile pages — a profile holds one or more pages, each with its own
 * zones. The studio and the kiosk work on one page at a time through a
 * `ProfileView`; these helpers move between the stored profile and a view.
 */

/** Id of the page a legacy profile's zones migrate into. */
export const MAIN_PAGE_ID = "main";

const ROTATE_DEFAULT_SECONDS = 15;
const ROTATE_MIN_SECONDS = 3;
const ROTATE_MAX_SECONDS = 3600;

export function mainPage(placements: Placement[] = []): ProfilePage {
  return { id: MAIN_PAGE_ID, name: "Main", placements };
}

/** The page with this id, else the first. */
export function pageOf(profile: MonitorProfile, pageId?: string): ProfilePage {
  return profile.pages.find((p) => p.id === pageId) ?? profile.pages[0];
}

/**
 * One page of a profile as a `ProfileView` (the profile minus `pages`). Its zones are the grid's: the page's item
 * placements (`ITEM_ID`, v15) aren't zones, so the grid editor and the kiosk grid never see them; `applyView` keeps them.
 */
export function profileWithPage(profile: MonitorProfile, pageId?: string): ProfileView {
  const { pages: _pages, ...rest } = profile;
  const page = pageOf(profile, pageId);
  const zones = page.placements.some(isItem) ? page.placements.filter((p) => !isItem(p)) : page.placements;
  return { ...rest, placements: zones, pageId: page.id, ...(page.widgetTheme ? { pageTheme: page.widgetTheme } : {}) };
}

const isItem = (p: Placement) => p.module === ITEM_ID;

/**
 * A page's zones replaced by `zones`, its item placements kept: each stays just above the zone it was above (the
 * nearest one before it that is still there), so the z-order holds.
 */
export function withZones(stored: readonly Placement[], zones: Placement[]): Placement[] {
  if (!stored.some(isItem)) return zones;
  const kept = new Set(zones.map((z) => z.id));
  const after = new Map<string | null, Placement[]>();
  let anchor: string | null = null;
  for (const p of stored) {
    if (!isItem(p)) {
      if (kept.has(p.id)) anchor = p.id;
      continue;
    }
    after.set(anchor, [...(after.get(anchor) ?? []), p]);
  }
  return [...(after.get(null) ?? []), ...zones.flatMap((z) => [z, ...(after.get(z.id) ?? [])])];
}

/**
 * The view's profile fields back on the profile, its zones and page theme into its page (its item placements kept,
 * `withZones`). A change to the screen's size or grid carries over to its Free pages (`fitFreePages`), so they stay Free.
 */
export function applyView(profile: MonitorProfile, view: ProfileView): MonitorProfile {
  const { placements, pageId, pageTheme, ...rest } = view;
  const target = pageOf(profile, pageId).id;
  const onto = (p: ProfilePage): ProfilePage => {
    const { widgetTheme: _old, ...page } = p;
    return { ...page, placements: withZones(p.placements, placements), ...(pageTheme ? { widgetTheme: pageTheme } : {}) };
  };
  return fitFreePages(profile, {
    ...rest,
    pages: profile.pages.map((p) => (p.id === target ? onto(p) : p)),
  });
}

/**
 * Lift an edit of one page's view to the stored profile. Returns the same
 * profile when `fn` changes nothing (undo history relies on identity).
 */
export function onPage(
  pageId: string | undefined,
  fn: (v: ProfileView) => ProfileView
): (p: MonitorProfile) => MonitorProfile {
  return (p) => {
    const view = profileWithPage(p, pageId);
    const next = fn(view);
    return next === view ? p : applyView(p, next);
  };
}

/** Every zone of every page, in page order. */
export function allPlacements(profile: MonitorProfile): Placement[] {
  return profile.pages.flatMap((p) => p.placements);
}

export function zoneCount(profile: MonitorProfile): number {
  return profile.pages.reduce((n, p) => n + p.placements.length, 0);
}

/** Map every zone of every page; the same profile when nothing changed. */
export function mapPlacements(
  profile: MonitorProfile,
  fn: (pl: Placement) => Placement
): MonitorProfile {
  let changed = false;
  const pages = profile.pages.map((page) => {
    const placements = page.placements.map(fn);
    if (placements.every((pl, i) => pl === page.placements[i])) return page;
    changed = true;
    return { ...page, placements };
  });
  return changed ? { ...profile, pages } : profile;
}

export function addPage(
  profile: MonitorProfile,
  name?: string
): { profile: MonitorProfile; pageId: string } {
  const page: ProfilePage = {
    id: uid("page"),
    name: name ?? `Page ${profile.pages.length + 1}`,
    placements: [],
  };
  return { profile: { ...profile, pages: [...profile.pages, page] }, pageId: page.id };
}

/** Removes a page; the last page stays (the profile is returned unchanged). */
export function removePage(profile: MonitorProfile, id: string): MonitorProfile {
  if (profile.pages.length <= 1 || !profile.pages.some((p) => p.id === id)) return profile;
  return { ...profile, pages: profile.pages.filter((p) => p.id !== id) };
}

export function movePage(profile: MonitorProfile, id: string, toIndex: number): MonitorProfile {
  const from = profile.pages.findIndex((p) => p.id === id);
  if (from < 0) return profile;
  const to = Math.max(0, Math.min(profile.pages.length - 1, toIndex));
  if (to === from) return profile;
  const pages = profile.pages.filter((p) => p.id !== id);
  pages.splice(to, 0, profile.pages[from]);
  return { ...profile, pages };
}

function updatePage(
  profile: MonitorProfile,
  id: string,
  patch: Partial<ProfilePage>
): MonitorProfile {
  return {
    ...profile,
    pages: profile.pages.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  };
}

export function renamePage(profile: MonitorProfile, id: string, name: string): MonitorProfile {
  return updatePage(profile, id, { name });
}

/** Set a page's lucide icon; `undefined` clears it. */
export function setPageIcon(
  profile: MonitorProfile,
  id: string,
  icon: string | undefined
): MonitorProfile {
  return updatePage(profile, id, { icon });
}

/** Copy a page after its source, with fresh zone ids. */
export function duplicatePage(
  profile: MonitorProfile,
  id: string
): { profile: MonitorProfile; pageId: string } {
  const at = profile.pages.findIndex((p) => p.id === id);
  if (at < 0) return { profile, pageId: id };
  const src = profile.pages[at];
  const copy: ProfilePage = {
    ...src,
    id: uid("page"),
    name: `${src.name} copy`,
    placements: src.placements.map(clonePlacement),
  };
  const pages = [...profile.pages];
  pages.splice(at + 1, 0, copy);
  return { profile: { ...profile, pages }, pageId: copy.id };
}

/** Guard a stored rotate option; undefined when there is none to keep. */
export function normalizeRotate(r: unknown, pageIds: string[]): PageRotate | undefined {
  if (typeof r !== "object" || r === null || Array.isArray(r)) return undefined;
  const v = r as Record<string, unknown>;
  const seconds =
    typeof v.seconds === "number" && Number.isFinite(v.seconds)
      ? Math.max(ROTATE_MIN_SECONDS, Math.min(ROTATE_MAX_SECONDS, v.seconds))
      : ROTATE_DEFAULT_SECONDS;
  const pages = Array.isArray(v.pages)
    ? v.pages.filter((id): id is string => typeof id === "string" && pageIds.includes(id))
    : [];
  return {
    enabled: v.enabled === true,
    seconds,
    ...(pages.length > 0 ? { pages } : {}),
  };
}
