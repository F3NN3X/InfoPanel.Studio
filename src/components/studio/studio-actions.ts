import {
  BLANK_MODULE,
  CARDS_ID,
  PANEL_ID,
  clonePlacement,
  type MonitorProfile,
  type ProfileView,
  type Placement,
} from "@/lib/layout";
import type { LayoutTemplate } from "@/lib/sample-layout";
import { normalizePanelPlacement } from "@/lib/panel-model";
import { followFromOwn, migrateSettingsV7, migrateStyleV7 } from "@/lib/settings-migrate";
import { ownApplies, sectionsWithValues, THEMED_KEYS, withThemeValues, type ThemeLevels } from "@/lib/theme-model";
import { modules } from "@/modules";
import { CARD_SETTINGS, PANEL_SETTINGS, replaceStyle, styleOf } from "@/modules/standard-settings";
import { settingKeys } from "@/modules/types";
import type { PanelPreset } from "@/lib/panelPresets";
import type { ModuleSettings } from "@/modules/types";
import { ALL_MODULES } from "./studio-modules";
import { dropKeys } from "./settings-model";
import { firstFreeRect, zoneFits, type ZoneRect } from "./zone-geometry";

/*
 * Pure profile mutations behind the studio's controls. Each takes the
 * profile and returns a new one; the studio applies them through its
 * profile updater. Ids are passed in so the caller can select the result.
 */

type Size = { cols: number; rows: number };

/** Apply `fn` to one placement. */
export function updatePlacement(
  profile: ProfileView,
  id: string,
  fn: (p: Placement) => Placement
): ProfileView {
  return {
    ...profile,
    placements: profile.placements.map((x) => (x.id === id ? fn(x) : x)),
  };
}

/** Append a placement at the first free slot of `size` (top-left if full). */
function appendAtFreeSlot(
  profile: ProfileView,
  size: Size,
  make: (pos: ZoneRect) => Placement
): ProfileView {
  const clamped = {
    cols: Math.max(1, Math.min(size.cols, profile.cols)),
    rows: Math.max(1, Math.min(size.rows, profile.rows)),
  };
  const pos =
    firstFreeRect(profile.cols, profile.rows, clamped, profile.placements) ?? {
      col: 1,
      row: 1,
      cols: clamped.cols,
      rows: clamped.rows,
    };
  return { ...profile, placements: [...profile.placements, make(pos)] };
}

function zoneAt(id: string, module: string, rect: ZoneRect): Placement {
  return {
    id,
    module,
    colStart: rect.col,
    rowStart: rect.row,
    colSpan: rect.cols,
    rowSpan: rect.rows,
    visible: true,
  };
}

/** Add a module widget at its minimum size in the first free slot. */
export function addModulePlacement(
  profile: ProfileView,
  id: string,
  module: string,
  minSize: Size
): ProfileView {
  return appendAtFreeSlot(profile, minSize, (pos) => zoneAt(id, module, pos));
}

/**
 * A zone holding a fresh panel from the preset, migrated like a loaded
 * one: normalized, with its look in the settings (title → label, …).
 * A saved preset brings its own settings (under today's keys, config v7),
 * and shows them: the sections they set are custom (`followFromOwn`).
 */
function withPreset(p: Placement, preset: PanelPreset): Placement {
  const settings = migrateSettingsV7(PANEL_ID, preset.settings, false).settings;
  const follow = followFromOwn(settings);
  const { follow: _old, ...zone } = p;
  return normalizePanelPlacement({
    ...zone,
    module: PANEL_ID,
    panel: preset.make(),
    settings: settings ? { ...settings } : undefined,
    ...(follow ? { follow } : {}),
  });
}

/** Add a pre-designed panel (a group of widgets) from a preset. */
export function addPresetPlacement(
  profile: ProfileView,
  id: string,
  preset: PanelPreset
): ProfileView {
  return appendAtFreeSlot(
    profile,
    { cols: preset.colSpan, rows: preset.rowSpan },
    (pos) => withPreset(zoneAt(id, PANEL_ID, pos), preset)
  );
}

/** Add a module widget in an explicit box (a library drop; the caller checked it fits). */
export function addModuleAt(
  profile: ProfileView,
  id: string,
  module: string,
  rect: ZoneRect
): ProfileView {
  return { ...profile, placements: [...profile.placements, zoneAt(id, module, rect)] };
}

/** Add a panel preset in an explicit box (a library drop; the caller checked it fits). */
export function addPresetAt(
  profile: ProfileView,
  id: string,
  preset: PanelPreset,
  rect: ZoneRect
): ProfileView {
  return {
    ...profile,
    placements: [...profile.placements, withPreset(zoneAt(id, PANEL_ID, rect), preset)],
  };
}

/** Add a blank zone with an explicit (already clamped) box. */
export function addBlankZone(
  profile: ProfileView,
  id: string,
  rect: ZoneRect
): ProfileView {
  return {
    ...profile,
    placements: [...profile.placements, zoneAt(id, BLANK_MODULE, rect)],
  };
}

const hasRect = (p: Placement, r: ZoneRect) =>
  p.colStart === r.col && p.rowStart === r.row && p.colSpan === r.cols && p.rowSpan === r.rows;

/** Set a zone's box (the caller clamps it first); the same profile back when it is already there. */
export function setZoneRect(
  profile: ProfileView,
  id: string,
  rect: ZoneRect
): ProfileView {
  const zone = profile.placements.find((p) => p.id === id);
  if (!zone || hasRect(zone, rect)) return profile;
  return updatePlacement(profile, id, (p) => ({
    ...p,
    colStart: rect.col,
    rowStart: rect.row,
    colSpan: rect.cols,
    rowSpan: rect.rows,
  }));
}

export function setSpan(
  profile: ProfileView,
  id: string,
  span: number
): ProfileView {
  return updatePlacement(profile, id, (x) => ({ ...x, colSpan: span }));
}

export function setRowSpan(
  profile: ProfileView,
  id: string,
  span: number
): ProfileView {
  return updatePlacement(profile, id, (x) => ({ ...x, rowSpan: span }));
}

export function toggleVisible(
  profile: ProfileView,
  id: string
): ProfileView {
  return updatePlacement(profile, id, (x) => ({ ...x, visible: !x.visible }));
}

export function removePlacement(
  profile: ProfileView,
  id: string
): ProfileView {
  return {
    ...profile,
    placements: profile.placements.filter((x) => x.id !== id),
  };
}

/** Insert a copy (new id) right after the original. */
export function duplicatePlacement(
  profile: ProfileView,
  id: string
): ProfileView {
  const i = profile.placements.findIndex((x) => x.id === id);
  if (i === -1) return profile;
  const next = [...profile.placements];
  next.splice(i + 1, 0, clonePlacement(profile.placements[i]));
  return { ...profile, placements: next };
}

/** Set several zones' boxes at once (the caller checks them first); the same profile back when none moves. */
export function setZoneRects(
  profile: ProfileView,
  rects: Record<string, ZoneRect>
): ProfileView {
  if (!profile.placements.some((p) => rects[p.id] && !hasRect(p, rects[p.id]))) return profile;
  return {
    ...profile,
    placements: profile.placements.map((p) => {
      const r = rects[p.id];
      return r ? { ...p, colStart: r.col, rowStart: r.row, colSpan: r.cols, rowSpan: r.rows } : p;
    }),
  };
}

export function removeZones(
  profile: ProfileView,
  ids: readonly string[]
): ProfileView {
  const set = new Set(ids);
  return { ...profile, placements: profile.placements.filter((x) => !set.has(x.id)) };
}

/** Hide every zone of the set while any of them shows; else show them all. */
export function toggleZonesVisible(
  profile: ProfileView,
  ids: readonly string[]
): ProfileView {
  const set = new Set(ids);
  const anyVisible = profile.placements.some((x) => set.has(x.id) && x.visible);
  return {
    ...profile,
    placements: profile.placements.map((x) => (set.has(x.id) ? { ...x, visible: !anyVisible } : x)),
  };
}

/**
 * Whether toggling these zones is allowed: hiding always is; showing is
 * not when a shown zone would land on another visible one (the room it
 * left was handed out while it was hidden).
 */
export function canToggleZonesVisible(profile: ProfileView, ids: readonly string[]): boolean {
  const next = toggleZonesVisible(profile, ids);
  const set = new Set(ids);
  return next.placements
    .filter((p) => set.has(p.id) && p.visible)
    .every((p) =>
      zoneFits(
        { col: p.colStart, row: p.rowStart, cols: p.colSpan, rows: p.rowSpan },
        next.placements,
        profile.cols,
        profile.rows,
        p.id
      )
    );
}

/**
 * Copy each zone (new ids) to the first free spot of its size, rows
 * first; earlier copies count as taken. A zone with no free spot is not
 * copied. `copies` are the new ids, for selecting them.
 */
export function duplicateZones(
  profile: ProfileView,
  ids: readonly string[]
): { profile: ProfileView; copies: string[] } {
  let placements = profile.placements;
  const copies: string[] = [];
  for (const id of ids) {
    const p = profile.placements.find((x) => x.id === id);
    if (!p) continue;
    const pos = firstFreeRect(profile.cols, profile.rows, { cols: p.colSpan, rows: p.rowSpan }, placements);
    if (!pos) continue;
    const copy = { ...clonePlacement(p), colStart: pos.col, rowStart: pos.row };
    placements = [...placements, copy];
    copies.push(copy.id);
  }
  return { profile: copies.length > 0 ? { ...profile, placements } : profile, copies };
}

/**
 * Move zones from one page of the profile to another (ids kept). A zone
 * keeps its box when that is free on the target page, else takes the first
 * free spot for its size (never below `minSizeOf`). Null when any zone has
 * no room, so nothing moves.
 */
export function moveZonesToPage(
  profile: MonitorProfile,
  ids: readonly string[],
  from: string,
  to: string,
  minSizeOf: (p: Placement) => Size
): MonitorProfile | null {
  const src = profile.pages.find((p) => p.id === from);
  const dst = profile.pages.find((p) => p.id === to);
  const moving = src?.placements.filter((p) => ids.includes(p.id)) ?? [];
  if (!src || !dst || from === to || moving.length === 0) return profile;
  let landed = dst.placements;
  for (const zone of moving) {
    const box: ZoneRect = { col: zone.colStart, row: zone.rowStart, cols: zone.colSpan, rows: zone.rowSpan };
    const min = minSizeOf(zone);
    const size = { cols: Math.max(zone.colSpan, min.cols), rows: Math.max(zone.rowSpan, min.rows) };
    const rect = zoneFits(box, landed, profile.cols, profile.rows)
      ? box
      : firstFreeRect(profile.cols, profile.rows, size, landed);
    if (!rect) return null;
    landed = [...landed, { ...zone, colStart: rect.col, rowStart: rect.row, colSpan: rect.cols, rowSpan: rect.rows }];
  }
  const gone = new Set(moving.map((p) => p.id));
  return {
    ...profile,
    pages: profile.pages.map((p) =>
      p.id === from ? { ...p, placements: p.placements.filter((x) => !gone.has(x.id)) } : p.id === to ? { ...p, placements: landed } : p
    ),
  };
}

/** A zone's minimum size: its widget's; blank zones and panels 1×1. */
export function zoneMinSize(p: Placement): Size {
  const meta = ALL_MODULES.find((m) => m.id === p.module);
  return meta ? { cols: meta.minCols, rows: meta.minRows } : { cols: 1, rows: 1 };
}

/** Make a zone blank: drop its widget, panel and settings. */
export function clearWidget(
  profile: ProfileView,
  id: string
): ProfileView {
  return updatePlacement(profile, id, (p) => ({
    ...p,
    module: BLANK_MODULE,
    panel: undefined,
    settings: undefined,
  }));
}

/** The zone's box grown to at least `min` cells, kept inside the grid. */
function grownRect(profile: ProfileView, p: Placement, min: Size): ZoneRect {
  const cols = Math.min(Math.max(p.colSpan, min.cols), profile.cols);
  const rows = Math.min(Math.max(p.rowSpan, min.rows), profile.rows);
  return {
    col: Math.min(p.colStart, profile.cols - cols + 1),
    row: Math.min(p.rowStart, profile.rows - rows + 1),
    cols,
    rows,
  };
}

/** Whether the zone can grow to at least `min` cells without covering another zone. */
export function canGrowTo(profile: ProfileView, id: string, min: Size): boolean {
  const p = profile.placements.find((x) => x.id === id);
  return (
    p !== undefined &&
    zoneFits(grownRect(profile, p, min), profile.placements, profile.cols, profile.rows, id)
  );
}

/**
 * Grow a zone to at least `min` cells, kept inside the grid. When the
 * grown box would cover another zone, the zone keeps its current box.
 */
function growTo(profile: ProfileView, p: Placement, min: Size) {
  const grown = grownRect(profile, p, min);
  const r = zoneFits(grown, profile.placements, profile.cols, profile.rows, p.id)
    ? grown
    : { col: p.colStart, row: p.rowStart, cols: p.colSpan, rows: p.rowSpan };
  return { colStart: r.col, rowStart: r.row, colSpan: r.cols, rowSpan: r.rows };
}

/** Assign a module to a zone, growing it to the module's minimum size. */
export function assignModule(
  profile: ProfileView,
  id: string,
  module: string,
  minSize: Size
): ProfileView {
  return updatePlacement(profile, id, (p) => ({
    ...p,
    module,
    panel: undefined,
    settings: undefined,
    ...growTo(profile, p, minSize),
  }));
}

/** Assign a preset panel to a zone, growing it to the preset's size. */
export function assignPreset(
  profile: ProfileView,
  id: string,
  preset: PanelPreset
): ProfileView {
  return updatePlacement(profile, id, (p) =>
    withPreset({ ...p, ...growTo(profile, p, { cols: preset.colSpan, rows: preset.rowSpan }) }, preset)
  );
}

/** Change the column count (2–24), keeping every zone inside the grid. */
export function changeCols(
  profile: ProfileView,
  delta: number
): ProfileView {
  const cols = Math.max(2, Math.min(24, profile.cols + delta));
  return {
    ...profile,
    cols,
    placements: profile.placements.map((pl) => {
      const colStart = Math.min(pl.colStart, cols);
      const colSpan = Math.max(1, Math.min(pl.colSpan, cols - colStart + 1));
      return { ...pl, colStart, colSpan };
    }),
  };
}

/** Change the row count (1–24), keeping every zone inside the grid. */
export function changeRows(
  profile: ProfileView,
  delta: number
): ProfileView {
  const rows = Math.max(1, Math.min(24, profile.rows + delta));
  return {
    ...profile,
    rows,
    placements: profile.placements.map((pl) => {
      const rowStart = Math.min(pl.rowStart, rows);
      const rowSpan = Math.max(1, Math.min(pl.rowSpan, rows - rowStart + 1));
      return { ...pl, rowStart, rowSpan };
    }),
  };
}

/** Update the profile theme's values; empty values are stored as none. */
export function setProfileStyle<P extends Pick<ProfileView, "widgetTheme">>(
  profile: P,
  fn: (style: ModuleSettings) => ModuleSettings
): P {
  const style = fn(profile.widgetTheme?.values ?? {});
  // Emptied values stay `{}` when the profile had its own style: it remains This profile's.
  const keep = Object.keys(style).length > 0 || profile.widgetTheme?.values !== undefined;
  return { ...profile, widgetTheme: withThemeValues(profile.widgetTheme, keep ? style : undefined) };
}

/**
 * The look a zone shows of its own: its style keys whose values apply
 * (a themed key only where its section is custom). What Copy style, Save
 * style and "Use as global style" take.
 */
export function ownStyle(p: Placement, levels: ThemeLevels): ModuleSettings {
  return Object.fromEntries(Object.entries(styleOf(p.settings)).filter(([key]) => ownApplies(levels, p, key)));
}

/**
 * A zone with a copied style (see `replaceStyle`): the sections the style
 * sets become custom, so it shows; the others follow the theme as before.
 */
export function withPastedStyle(p: Placement, pasted: ModuleSettings, supported: ReadonlySet<string>): Placement {
  // A style copied or saved before config v7 names the alignment's two axes.
  const style = migrateStyleV7(pasted);
  const settings = replaceStyle(p.settings, style, supported);
  const custom = sectionsWithValues(Object.fromEntries(Object.entries(styleOf(style)).filter(([key]) => supported.has(key))));
  const follow = { ...p.follow, ...Object.fromEntries(custom.map((sec) => [sec, false])) };
  const { settings: _s, follow: _f, ...rest } = p;
  return { ...rest, ...(settings ? { settings } : {}), ...(Object.keys(follow).length > 0 ? { follow } : {}) };
}

/** The look keys a zone's widget (or panel) has settings for. */
export function zoneStyleKeys(p: Placement): ReadonlySet<string> {
  const defs = p.panel
    ? PANEL_SETTINGS
    : p.module === CARDS_ID
      ? CARD_SETTINGS
      : (modules.find((m) => m.id === p.module)?.settings ?? []);
  return new Set(defs.flatMap(settingKeys));
}

/**
 * Give each zone of the set the copied style (`withPastedStyle`: the
 * sections it sets turn custom so it shows). Blank zones have no look and
 * are skipped.
 */
export function pasteStyleToZones(
  profile: ProfileView,
  ids: readonly string[],
  style: ModuleSettings
): ProfileView {
  const set = new Set(ids);
  return {
    ...profile,
    placements: profile.placements.map((p) =>
      set.has(p.id) && p.module !== BLANK_MODULE ? withPastedStyle(p, style, zoneStyleKeys(p)) : p
    ),
  };
}

/** The zones follow the theme in every section, and their own themed values are cleared. */
export function followGlobalStyle(profile: ProfileView, ids: readonly string[]): ProfileView {
  const set = new Set(ids);
  return {
    ...profile,
    placements: profile.placements.map((p) => {
      if (!set.has(p.id)) return p;
      const { follow: _f, ...rest } = p;
      return { ...rest, settings: dropKeys(p.settings, THEMED_KEYS) };
    }),
  };
}

/** One axis of a box mapped from a `from`-cell grid to a `to`-cell grid (edges floored, at least one cell). */
function scaleSpan(start: number, span: number, from: number, to: number): [number, number] {
  const k = to / from;
  const first = Math.min(to, Math.floor((start - 1) * k) + 1);
  const last = Math.max(first, Math.min(to, Math.floor((start - 1 + span) * k)));
  return [first, last - first + 1];
}

/**
 * The page with fresh copies of the sample layout's zones (the empty-layout card's "Use sample layout").
 * The grid is shared by every page, so with `keepGrid` (another page has zones) the sample's zones are
 * scaled onto this profile's grid instead of the profile taking the sample's grid; a zone that then
 * collides moves to the first free spot of its size, or is left out when none is left.
 */
export function withSampleZones(profile: ProfileView, sample: LayoutTemplate, keepGrid = false): ProfileView {
  const zones = sample.placements.map(clonePlacement);
  if (!keepGrid) return { ...profile, cols: sample.cols, rows: sample.rows, placements: zones };
  const placed: Placement[] = [];
  for (const z of zones) {
    const [colStart, colSpan] = scaleSpan(z.colStart, z.colSpan, sample.cols, profile.cols);
    const [rowStart, rowSpan] = scaleSpan(z.rowStart, z.rowSpan, sample.rows, profile.rows);
    const rect: ZoneRect = { col: colStart, row: rowStart, cols: colSpan, rows: rowSpan };
    const spot = zoneFits(rect, placed, profile.cols, profile.rows)
      ? rect
      : firstFreeRect(profile.cols, profile.rows, { cols: colSpan, rows: rowSpan }, placed);
    if (spot) placed.push({ ...z, colStart: spot.col, rowStart: spot.row, colSpan: spot.cols, rowSpan: spot.rows });
  }
  return { ...profile, placements: placed };
}
