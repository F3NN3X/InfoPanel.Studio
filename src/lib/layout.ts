import { DEFAULT_THEME, normalizeThemePatch, type ThemeTokens } from "./theme";
import { normalizeBackground, type PageBackground } from "./appearance";
import { normalizeAppearancePresets, type AppearancePreset } from "./appearance-presets";
import { normalizeAppliedTheme, type AppliedTheme } from "./applied-theme";
import type { ModuleSettings } from "@/modules/types";
import type { SectionFlags, WidgetTheme } from "./theme-model";
import type { LegacyProfileFields } from "./settings-migrate";
import { normalizeApiBase } from "./data-api";
import { normalizeFont, normalizeGeneral, type GeneralFont, type GeneralSettings } from "./general";
import { normalizeSpacing } from "./profile-grid";
import { mainPage, normalizeRotate } from "./pages";
import { normalizeAlerts, type AlertsConfig } from "./alerts";
import { storageCopy } from "./canvas-store";
import { normalizeIsland, type IslandConfig } from "./island/config";
import { normalizePerformance, type ScreenPerformance } from "./performance";
import type { LegacyDashboardFields } from "./screen-look-migrate";
import {
  normalizePanelPlacement,
  normalizePanelPresets,
  type PanelDef,
  type UserPanelPreset,
  type Widget,
  type WidgetKind,
} from "./panel-model";
import type { StoredCanvas, StoredItem } from "./infopanel/import/stored.ts";

/**
 * Layout engine — the dashboard is a grid of *placements*. Each placement
 * hosts one registered module (or the "cards" catch-all grid) and spans a
 * number of grid columns. Layouts are organised per *monitor profile*, so
 * one dashboard can be shaped for a 1920×550 kiosk strip, a 1024×600 panel,
 * a 1080p display, ... and the right profile is picked automatically by
 * window size (or pinned to one).
 */

export const CARDS_ID = "cards";
/** Sentinel module id for placement instances that render a custom panel. */
export const PANEL_ID = "panel";
/** Sentinel module id for a zone with no widget (a drawn, unfilled region). */
export const BLANK_MODULE = "blank";
/** Sentinel module id for a canvas zone: an imported InfoPanel profile (`Placement.canvas`). */
export const CANVAS_ID = "infopanel";
/** A canvas zone whose canvas isn't loaded (only its `canvasRef`): shown, never edited (Edit v3 SPEC §15). */
export const NOT_LOADED = "This page's content isn't loaded yet.";
export const canvasNotLoaded = (p: Pick<Placement, "module" | "canvas">): boolean => p.module === CANVAS_ID && !p.canvas;
/** Sentinel module id for an InfoPanel item or studio element on a screen page (`Placement.item`, Edit v3 SPEC §3.4). */
export const ITEM_ID = "item";
/** A canvas zone's title: the imported profile's name (undefined for other zones). */
export function canvasTitle(p: Pick<Placement, "module" | "canvas">): string | undefined {
  if (p.module !== CANVAS_ID) return undefined;
  const name: unknown = p.canvas?.source?.name;
  return typeof name === "string" && name ? name : "InfoPanel canvas";
}
/** Fixed row height (design px) for "scroll" profiles — the page scrolls. */
export const SCROLL_ROW_H = 120;

// Panels + widgets: the model (types, normalization) lives in panel-model.ts.
export type {
  BoxAlign,
  BoxSize,
  OverlayBand,
  PanelDef,
  PanelJustify,
  PanelLayout,
  ShapeType,
  UserPanelPreset,
  Widget,
  WidgetBox,
  WidgetKind,
} from "./panel-model";

/** Per-instance visual overrides for a placement. */
export interface PlacementDesign {
  /** Hex color overriding the theme accent for this placement only. */
  accent?: string;
  /** Background treatment around the module content. */
  background?: "none" | "panel" | "bordered";
  /** Render a small uppercase title header above the content. */
  header?: boolean;
}

export interface Placement {
  /** Unique instance id (React key). */
  id: string;
  /**
   * Registry module id, CARDS_ID, BLANK_MODULE, PANEL_ID (custom panel) or
   * CANVAS_ID (canvas zone) — the widget the zone hosts.
   */
  module: string;
  /** 1-based grid column this zone starts in. */
  colStart: number;
  /** 1-based grid row this zone starts in. */
  rowStart: number;
  /** Number of grid columns this zone spans (width). */
  colSpan: number;
  /** Number of grid rows this zone spans (height). */
  rowSpan: number;
  /** False: hidden (Layers' eye), not drawn in the kiosk; kept on save. */
  visible: boolean;
  /** Per-instance module settings, merged over the module's defaults. */
  settings?: ModuleSettings;
  /** Per-instance design overrides (accent, background, header). */
  design?: PlacementDesign;
  /** Present when this placement renders a custom panel (group). */
  panel?: PanelDef;
  /**
   * Present when this placement is a canvas zone (CANVAS_ID): an imported
   * InfoPanel profile in its stored form, checked against InfoPanel's schema
   * when drawn (src/lib/infopanel/canvas.ts). Only in memory and in exported
   * files: the server's copy holds `canvasRef` instead (src/lib/canvas-store.ts).
   */
  canvas?: StoredCanvas;
  /** The canvas's file in the server's canvas store (ips-server's canvases.rs), in place of `canvas`. */
  canvasRef?: string;
  /**
   * Per followable section (`theme-model.ts`): `false` = custom, the
   * widget's own values apply; absent / `true` = it follows the theme (its
   * own values stay stored, ignored). Replaces the v5 `styleMode`.
   */
  follow?: SectionFlags;
  /**
   * An item placement (ITEM_ID, Edit v3 SPEC §3.4, decision Q8): the InfoPanel item or studio element in its stored
   * form (`StoredItem`, `$` records included). Its files and fonts are the page's (`ProfilePage.freeCanvas`).
   */
  item?: StoredItem;
  /**
   * Placed freely (items and elements only, never a widget): the box in the screen's design px from its top-left
   * corner, which the grid's columns, rows, gap and padding never move. The cells then hold the cells it covers.
   */
  px?: PixelBox;
  /** The page group it sits in (`ProfilePage.groups`); unset = the page's top level. */
  groupId?: string;
  /** Locked: the canvas doesn't move, resize or delete it. */
  locked?: boolean;
  /** A widget's own name (Layers' rename); unset = its widget's name. Studio-only: an older build ignores it. */
  name?: string;
}

/** A box in design px. */
export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A group of parts on a screen page (Edit v3 SPEC §3.5): any mix, nested by `parentId`. It has no box of its own. */
export interface PageGroup {
  id: string;
  name: string;
  parentId?: string;
  locked?: boolean;
  hidden?: boolean;
  /**
   * What the group was made from, kept as it was by the v15 migration (`page-model/migrate.ts`): an InfoPanel Group
   * item without its children, or a free area's zone and its canvas without the items.
   */
  from?: Record<string, unknown>;
}

export interface ProfilePage {
  id: string;
  name: string;
  /** lucide icon name (page switcher, Stream Deck keys); unset = none. */
  icon?: string;
  placements: Placement[];
  /**
   * The page's widget theme: values plus, per section, `follow: false` to
   * use them instead of the profile's (unset: the profile's theme).
   */
  widgetTheme?: WidgetTheme;
  /**
   * The InfoPanel side of the page besides its items (its InfoPanel profile, files, fonts and palette): what the item
   * placements' files and fonts resolve against, and what a switch to Free starts from (`lib/page-layout.ts`).
   */
  freeCanvas?: Omit<StoredCanvas, "items">;
  /** Items and elements snap to cells while dragging (Edit v3 SPEC §3.2). Unset = true. Widgets always snap. */
  snapItems?: boolean;
  /** What the theme last applied to this page wrote (its skin and style values, `lib/applied-theme.ts`); unset = none. */
  appliedTheme?: AppliedTheme;
  /** The page's groups (§3.5); a canvas-backed page keeps its groups as the canvas's Group items. */
  groups?: PageGroup[];
}

/**
 * A page's layout as the editor still offers it until Edit v3 removes the switch: zones on the grid's cells, or one
 * canvas filling the grid (read from the page's shape, `freeCanvasOf`; v15 stores no flag).
 */
export type PageLayout = "grid" | "free";

/** Who a screen is for (one-editor SPEC §3.2). */
export type MadeFor = "studio" | "infopanel";

/** Auto-rotate through pages; `enabled: false` keeps the interval and list stored. */
export interface PageRotate {
  enabled: boolean;
  seconds: number;
  /** Page ids to rotate through; unset/empty = every page. */
  pages?: string[];
}

export interface MonitorProfile {
  id: string;
  name: string;
  /** Design window width in px (used for auto-selection). */
  width: number;
  /** Design window height in px. */
  height: number;
  /** Number of grid columns. */
  cols: number;
  /**
   * Number of grid rows — uniform cells of width/cols × height/rows.
   * Zones are drawn, moved and resized on this grid (no auto-flow).
   */
  rows: number;
  /**
   * "scroll": fixed row height (SCROLL_ROW_H) and the page scrolls
   * (normal displays). "fill": the grid fills the profile height exactly
   * (kiosk strips).
   */
  fit: "scroll" | "fill";
  /** The profile's pages (at least one); each has its own zones. */
  pages: ProfilePage[];
  /** Auto-rotate through the pages; unset = off. */
  rotate?: PageRotate;
  /**
   * The profile's widget theme (`theme-model.ts`): values for the themed
   * keys over the built-in look, and the sections it locks (widgets
   * then always follow them). Replaces the v5 `style` / `styleEnforce`.
   */
  widgetTheme?: WidgetTheme;
  /** This profile's page background (`{ type: "none" }` or unset: none). */
  background?: PageBackground;
  /** This profile's theme colours over the built-in ones (`resolveTheme`); unset = the built-in theme. */
  theme?: Partial<ThemeTokens>;
  /** This profile's corner radius in rem; unset = the built-in 0.5. */
  radius?: number;
  /** Space between zones in px (unset = `DEFAULT_GRID_GAP`, see profile-grid.ts). */
  gap?: number;
  /** Space around the grid in px (unset = the page's default per mode, see `profilePadding`). */
  padding?: number;
  /** The Dynamic Island over the page (`src/lib/island`); unset = none. */
  island?: IslandConfig;
  /** This profile's Max FPS, motion and rendering switches (`resolveGeneral`); unset = the defaults. */
  performance?: ScreenPerformance;
  /** This profile's page font (`resolveFont`); unset = the built-in one. */
  font?: GeneralFont;
  /** Set on the profiles earlier versions shipped (Sample, ARCv2); kept, no longer read. */
  sampleVersion?: number;
  /** ISO time of the last studio edit (the Screens page's "Last edited" sort); unset until the screen is edited. */
  updatedAt?: string;
  /** Who this screen is for; unset = "studio". "infopanel" turns on the export marks and the Export check. */
  madeFor?: MadeFor;
  /** What the theme last applied to this screen wrote (`lib/applied-theme.ts`); unset = none. */
  appliedTheme?: AppliedTheme;
}

/**
 * One page of a profile as the studio and kiosk edit and draw it: the
 * profile's fields plus that page's zones.
 */
export type ProfileView = Omit<MonitorProfile, "pages"> & {
  placements: Placement[];
  pageId?: string;
  /** That page's widget theme (`ProfilePage.widgetTheme`). */
  pageTheme?: WidgetTheme;
};

/**
 * v4: the legacy module ids are migrated to their templates on load (`legacy-zones.ts`).
 * v5: the server's copy holds canvas zones as `canvasRef`; a v4 build would push them back empty.
 * v6: the widget theme (`settings-migrate.ts`): `styleMode` → `follow`, a profile's `style` /
 *     `styleEnforce` → `widgetTheme`; a v5 build would read every widget as its own look.
 * v7: the shared keys (`settings-migrate.ts`): Small zones, Density, one alignment key, the
 *     thresholds, devices, units and decimals under their shared names, `general.hour12` →
 *     the themed `clock`; a v6 build would read none of them.
 * v8: the sample widgets refiled (`settings-migrate.ts`): NowPlaying's visualiser keys under their v2
 *     names, SensorGroup's `mode`, Widget colors custom where an own colour now has a palette role;
 *     a v7 build would read the old names.
 * v9: panel widgets (`settings-migrate.ts` `migrateWidgetV9`): a Custom gauge widget's width under
 *     its own `width` and a Gauge widget's ring under `size`, both off `fontSize`; a v8 build would
 *     draw them at the default size.
 * v10: the widget `preset` key is dropped (`settings-migrate.ts` `migratePlacementV10`); its values
 *     already sit in the zone's settings, so a v9 build only loses the marker.
 * v11: a sensor alert holds a list of `conditions` (`alerts.ts` `normalizeAlerts`); a rule saved with
 *     one `key` / `op` / `value` becomes a one-item list, which a v10 build would drop as unreadable.
 * v12: the Volume Mixer, Visualizer and Now Playing visualiser pick several audio devices
 *     (`settings-migrate.ts` `migratePlacementV12`); the single `device` becomes a one-device `devices`
 *     (`vizDevices`), which a v11 build would ignore and draw every device.
 * v13: glow (`lib/effects/glow.ts`): the look keys `numGlow` / `numGlowColor`, and the InfoPanel
 *     elements' `valueGlow` plus any spec key a newer build adds (`normalizeElement` keeps them). No data
 *     changes shape, so the migration is the identity; a v12 build would strip the new keys on its next
 *     save, so the server refuses its save (`config_guard.rs`, a version below the stored one).
 * v14: one editor (`settings-migrate.ts` `migrateProfileV14`): a page that is one canvas filling the screen gets
 *     `layout: "free"`, a screen whose pages are all Free `madeFor: "infopanel"`, and a Free page's canvas can hold
 *     Studio widgets (an Image item's `$.widget`). A v13 build would draw them as empty images and drop the new
 *     fields on its next save, so the server refuses its save (`config_guard.rs`).
 * v15: Edit v3 (`page-model/migrate.ts` `migrateProfileV15`): one kind of page. The `layout` flag goes; a Free page on a
 *     Studio screen (its canvas made here) becomes a normal page, its widgets on cells and its items placed freely
 *     (`Placement.item`, `px`) in a group named after the page (`ProfilePage.groups`); a free area becomes a group of
 *     such items; an imported profile, or one made with New InfoPanel profile, keeps its canvas and gets a grid of
 *     about 100 px cells. A canvas's items and
 *     widgets can hold their cells (`$.cell`, `$.widget.cell`) and its text items a letter spacing (`$.letterSpacing`).
 *     A v14 build would drop the item placements and groups on its next save, so the server refuses its save.
 * v16: screens own their look (`screen-look-migrate.ts` `migrateScreensV16`): the dashboard level ("All screens") goes.
 *     Each screen gets a copy of what it inherited (the colors, corners, background, page font, widget style, the
 *     dashboard's theme snapshot when it had no look of its own, and the Max FPS, motion and rendering switches), and
 *     `theme`, `radius`, `background`, `style`, `appliedTheme`, `general.font` and the performance keys leave the config;
 *     the style's 12 / 24 h clock becomes `general.clock`. A v15 build would show every screen in the built-in look, so
 *     the server refuses its save; before the first v16 save it keeps the v15 file as `config.backup-before-v16.json`
 *     (`config_guard.rs`).
 */
export const CONFIG_VERSION = 16;

export interface DashboardConfig {
  version: typeof CONFIG_VERSION;
  /** Profile id to show, or "auto" to match the window size. */
  activeProfile: string;
  /**
   * Dashboard-side source preferences (which sources show and how they're
   * labelled). Keys are `{plugin}::{container}` (container "" for flat
   * sources). Pure display config — the host's own plugin settings are
   * untouched.
   */
  sourcePrefs?: Record<string, SourcePref>;
  profiles: MonitorProfile[];
  /** Base URL of InfoPanel's Data API (default http://127.0.0.1:3921). */
  dataApiUrl?: string;
  /** Saved widget styles, applied from the studio inspector. */
  stylePresets?: StylePreset[];
  /** Panels the user saved for reuse (Add / widget picker). */
  panelPresets?: UserPanelPreset[];
  /** Whole looks the user saved (saved Themes; see appearance-presets.ts). */
  appearancePresets?: AppearancePreset[];
  /** Palettes the user saved (Theme › Palette › Yours; see palettes.ts). */
  palettes?: SavedPalette[];
  /** The app-wide settings: the clocks, the date locale and the kiosk (see general.ts). */
  general?: GeneralSettings;
  /** Alert rules (see alerts.ts); absent = none. */
  alerts?: AlertsConfig;
}

/** A palette the user saved: its name and the 19 color tokens. */
export interface SavedPalette {
  id: string;
  name: string;
  tokens: ThemeTokens;
  /** The widgets' accent saved with it (`palettes.ts`). */
  accent?: string;
}

/** A named set of style values (the keys in `PROFILE_STYLE_KEYS`). */
export interface StylePreset {
  id: string;
  name: string;
  settings: ModuleSettings;
}

/** Dashboard-side configuration for one source (container). */
export interface SourcePref {
  /** Show this source in the dashboard (default: true). */
  enabled?: boolean;
  /** Display-name override for this source. */
  displayName?: string;
}

/** Composite key for a source preference: `{plugin}::{container}`. */
export function sourcePrefKey(plugin: string, container: string): string {
  return `${plugin}::${container}`;
}

const STORAGE_KEY = "infopanel-dashboard:config:v1";

let counter = 0;
export function uid(prefix = "p"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/** A fresh install's one profile: blank, so the studio offers its empty-layout card (Browse / Use sample layout). */
function firstProfile(): MonitorProfile {
  return {
    id: "main",
    name: "Main display",
    width: 1920,
    height: 1080,
    cols: 12,
    rows: 6,
    fit: "scroll",
    pages: [mainPage()],
  };
}

export function defaultConfig(): DashboardConfig {
  return {
    version: CONFIG_VERSION,
    activeProfile: "auto",
    profiles: [firstProfile()],
  };
}

/** A profile as stored: v3 (`pages`) or legacy (`placements`), maybe with the v5 style fields. */
export type StoredProfile = Partial<Pick<MonitorProfile, "pages">> &
  Omit<MonitorProfile, "pages"> & { placements?: Placement[] } & LegacyProfileFields;

/**
 * v1→v2 profile normalization: legacy profiles auto-flowed their
 * placements (no colStart/rowStart) and had no rows. Simulate the old
 * left-to-right flow to fill explicit zone boxes in place, add a row
 * count, and clamp everything into the grid. Shipped profiles (already
 * explicit) pass through untouched.
 */
function normalizePlacements(
  list: Placement[],
  cols: number,
  rows: number
): Placement[] {
  const placements = list.map((pl) => ({
    ...normalizePartFields(normalizePanelPlacement(pl)),
    colSpan: Math.max(1, Math.min(cols, pl.colSpan ?? 1)),
  }));
  if (placements.every((pl) => pl.colStart !== undefined && pl.rowStart !== undefined)) {
    // Explicit — just make sure rowSpan is set and boxes fit the grid.
    for (const pl of placements) {
      pl.rowSpan = Math.max(1, pl.rowSpan ?? 1);
      pl.rowStart = Math.max(1, Math.min(rows, pl.rowStart));
      pl.colStart = Math.max(1, Math.min(cols, pl.colStart));
      pl.rowSpan = Math.min(pl.rowSpan, rows - pl.rowStart + 1);
      pl.colSpan = Math.min(pl.colSpan, cols - pl.colStart + 1);
    }
    return placements;
  }
  // Auto-flow: explicit rowStarts pin their row; auto items advance a
  // left-to-right flow pointer that wraps at the grid edge.
  let flowRow = 1;
  let flowCol = 1;
  for (const pl of placements) {
    if (pl.colStart === undefined || pl.rowStart === undefined) {
      if (pl.rowStart !== undefined && pl.colStart === undefined) {
        flowRow = pl.rowStart;
        flowCol = 1;
      }
      if (flowCol + pl.colSpan - 1 > cols) {
        flowRow += 1;
        flowCol = 1;
      }
      pl.colStart = flowCol;
      pl.rowStart = pl.rowStart ?? flowRow;
      flowCol += pl.colSpan;
    }
    pl.rowSpan = Math.max(1, pl.rowSpan ?? 1);
  }
  for (const pl of placements) {
    pl.rowStart = Math.max(1, Math.min(rows, pl.rowStart));
    pl.colStart = Math.max(1, Math.min(cols, pl.colStart));
    pl.rowSpan = Math.min(pl.rowSpan, rows - pl.rowStart + 1);
    pl.colSpan = Math.min(pl.colSpan, cols - pl.colStart + 1);
  }
  return placements;
}

/**
 * v2→v3: a profile's `placements` become its first page; stored pages get
 * unique ids and names. The output never carries a `placements` key.
 */
function normalizePages(p: StoredProfile, cols: number, rows: number): ProfilePage[] {
  if (!Array.isArray(p.pages) || p.pages.length === 0)
    return [mainPage(normalizePlacements(p.placements ?? [], cols, rows))];
  const seen = new Set<string>();
  return p.pages.map((page, i) => {
    const id =
      typeof page.id === "string" && page.id && !seen.has(page.id) ? page.id : uid("page");
    seen.add(id);
    // v15 stores no page layout (it reads from the page's shape); a v14 flag goes.
    const { layout: _layout, groups: rawGroups, snapItems, appliedTheme, ...rest } = page as ProfilePage & { layout?: unknown };
    const groups = normalizeGroups(rawGroups);
    const known = new Set(groups.map((g) => g.id));
    const placements = normalizePlacements(page.placements ?? [], cols, rows).map((pl) => {
      if (pl.groupId === undefined || known.has(pl.groupId)) return pl;
      const { groupId: _gone, ...kept } = pl;
      return kept;
    });
    return {
      ...rest,
      id,
      name: typeof page.name === "string" && page.name ? page.name : `Page ${i + 1}`,
      placements,
      ...(groups.length ? { groups } : {}),
      ...(snapItems === false ? { snapItems } : {}),
      ...(normalizeAppliedTheme(appliedTheme) ? { appliedTheme: normalizeAppliedTheme(appliedTheme) } : {}),
    };
  });
}

/** A page's stored groups: each with a unique id and a name; a parent that is gone or makes a loop is dropped. */
function normalizeGroups(raw: unknown): PageGroup[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const groups = raw.flatMap((g): PageGroup[] => {
    if (!g || typeof g !== "object" || typeof g.id !== "string" || !g.id || seen.has(g.id)) return [];
    seen.add(g.id);
    const { parentId, locked, hidden, from, ...rest } = g as PageGroup;
    return [
      {
        ...rest,
        name: typeof g.name === "string" ? g.name : "Group",
        ...(typeof parentId === "string" && parentId ? { parentId } : {}),
        ...(locked === true ? { locked } : {}),
        ...(hidden === true ? { hidden } : {}),
        ...(from && typeof from === "object" && !Array.isArray(from) ? { from } : {}),
      },
    ];
  });
  // One at a time, so a loop loses only the first parent that closes it.
  const byId = new Map(groups.map((g) => [g.id, g]));
  const loops = (g: PageGroup): boolean => {
    const path = new Set([g.id]);
    for (let at = g.parentId; at !== undefined; at = byId.get(at)?.parentId) {
      if (path.has(at) || !byId.has(at)) return true;
      path.add(at);
    }
    return false;
  };
  return groups.map((g) => {
    if (g.parentId === undefined || !loops(g)) return g;
    const { parentId: _p, ...top } = g;
    byId.set(g.id, top);
    return top;
  });
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** v15's fields on a placement, guarded: a bad one is dropped (the placement stays). */
function normalizePartFields(pl: Placement): Placement {
  const { px, groupId, locked, item, ...rest } = pl;
  const box = px && typeof px === "object" && finite(px.x) && finite(px.y) && finite(px.w) && finite(px.h) && px.w > 0 && px.h > 0 ? px : undefined;
  const stored = item && typeof item === "object" && !Array.isArray(item) && typeof item.kind === "string" ? item : undefined;
  return {
    ...rest,
    ...(box ? { px: { x: box.x, y: box.y, w: box.w, h: box.h } } : {}),
    ...(typeof groupId === "string" && groupId ? { groupId } : {}),
    ...(locked === true ? { locked } : {}),
    ...(stored ? { item: stored } : {}),
  };
}

/** A stored profile, guarded and with its pages normalised (shared by `mergeConfig` and the upgrade). */
export function normalizeProfile(input: StoredProfile): MonitorProfile & LegacyProfileFields {
  const { placements: _legacy, ...p } = input;
  const cols = Math.max(2, p.cols ?? 12);
  const rows = Math.max(1, p.rows ?? (p.height <= 700 ? 4 : 6));
  const pages = normalizePages(input, cols, rows);
  return {
    ...p,
    cols,
    rows,
    pages,
    rotate: normalizeRotate(p.rotate, pages.map((pg) => pg.id)),
    ...profileExtras(p),
  };
}

/** A profile's appearance fields, guarded (bad values dropped). */
function profileExtras(p: StoredProfile): Partial<MonitorProfile> {
  return {
    background: normalizeBackground(p.background),
    theme: normalizeThemePatch(p.theme),
    radius: typeof p.radius === "number" && Number.isFinite(p.radius) ? p.radius : undefined,
    gap: normalizeSpacing(p.gap),
    padding: normalizeSpacing(p.padding),
    island: normalizeIsland(p.island),
    performance: normalizePerformance(p.performance),
    font: normalizeFont(p.font),
    madeFor: p.madeFor === "studio" || p.madeFor === "infopanel" ? p.madeFor : undefined,
    appliedTheme: normalizeAppliedTheme(p.appliedTheme),
    updatedAt: typeof p.updatedAt === "string" && !Number.isNaN(Date.parse(p.updatedAt)) ? p.updatedAt : undefined,
  };
}

/** A config as stored: any version, its profiles v3 or legacy. */
export type StoredConfig = Omit<Partial<DashboardConfig>, "version" | "profiles"> & LegacyDashboardFields & {
  version?: number;
  profiles?: StoredProfile[];
  /** v5: force the global style on every widget (→ every profile's sections locked). */
  styleEnforce?: boolean;
};

const isSettings = (v: unknown): v is ModuleSettings =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * A config saved at this build's version, merged over the defaults (tolerates missing fields): the local load, the
 * server-synced copy (the kiosk pages pull the studio's latest state this way), a Settings read. An older config goes
 * through `readConfig`, which upgrades it first (`config-upgrade.ts`); a pin to a missing profile falls back to Auto.
 */
export function mergeConfig(input: StoredConfig): DashboardConfig {
  const defaults = defaultConfig();
  const profiles: MonitorProfile[] = (input.profiles && input.profiles.length > 0 ? input.profiles : defaults.profiles).map(normalizeProfile);
  const byId = new Set(profiles.map((p) => p.id));
  const pinned = input.activeProfile ?? defaults.activeProfile;
  return {
    version: CONFIG_VERSION,
    activeProfile: pinned !== "auto" && !byId.has(pinned) ? "auto" : pinned,
    sourcePrefs: input.sourcePrefs,
    profiles,
    dataApiUrl: normalizeApiBase(input.dataApiUrl) ?? undefined,
    stylePresets: Array.isArray(input.stylePresets) ? input.stylePresets : undefined,
    panelPresets: normalizePanelPresets(input.panelPresets),
    appearancePresets: normalizeAppearancePresets(input.appearancePresets),
    palettes: normalizePalettes(input.palettes),
    general: normalizeGeneral(isSettings(input.general) ? input.general : undefined),
    alerts: normalizeAlerts(input.alerts),
  };
}

/** A config saved at this build's version or a newer one (a newer build's: the server refuses its save over it). */
export const isCurrentConfig = (c: Pick<StoredConfig, "version">): boolean => typeof c.version === "number" && c.version >= CONFIG_VERSION;

/**
 * A stored config of any version as this build's: a current one merged (`mergeConfig`), an older one upgraded first
 * (`upgradeConfig`, in a chunk of its own: only an older config loads it). `log` takes a line per change the v15 step
 * makes.
 */
export async function readConfig(input: StoredConfig, log?: string[]): Promise<DashboardConfig> {
  if (isCurrentConfig(input)) return mergeConfig(input);
  const { upgradeConfig } = await import("./config-upgrade");
  return upgradeConfig(input, log);
}

/**
 * A config from outside the app (a config or screen file, a pasted screen): always through the upgrade, whose repairs
 * that no version gates (a dead widget `preset` key, the audio widgets' single `device`, legacy module ids, old asset
 * URLs) also fix a file an older build wrote and labelled current, or a bare screen that carries no version at all.
 */
export async function readImportedConfig(input: StoredConfig): Promise<DashboardConfig> {
  const { upgradeConfig } = await import("./config-upgrade");
  return upgradeConfig(input);
}

/** Saved palettes, guarded: an id and a name required, the tokens over the defaults; none kept = undefined. */
export function normalizePalettes(v: unknown): SavedPalette[] | undefined {
  const kept = (Array.isArray(v) ? (v as Partial<SavedPalette>[]) : []).flatMap((p) => {
    // Tokens found means `p` is an object.
    const tokens = normalizeThemePatch(p?.tokens);
    const name = tokens && typeof p.name === "string" && p.name.trim();
    const accent = typeof p.accent === "string" && p.accent.trim() !== "" && p.accent.length <= 64 ? { accent: p.accent } : {};
    return name && p.id && typeof p.id === "string" ? [{ id: p.id, name, tokens: { ...DEFAULT_THEME, ...tokens }, ...accent }] : [];
  });
  return kept[0] ? kept : undefined;
}

/** Load the saved config, merged over defaults (tolerates missing fields). */
export function loadConfig(): DashboardConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const stored = JSON.parse(raw) as StoredConfig;
    // An older copy (the offline fallback) is not upgraded here: the server's copy replaces it once read.
    return isCurrentConfig(stored) ? mergeConfig(stored) : defaultConfig();
  } catch {
    return defaultConfig();
  }
}

/** This browser holds a config of its own (none: a fresh install, or a browser that never opened the studio). */
export function hasStoredConfig(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

const isQuotaError = (err: unknown): boolean => err instanceof DOMException && err.name === "QuotaExceededError";

/**
 * Keep the config in this browser's storage (the offline fallback), canvases inline so an
 * offline start still draws them. When that is over the storage quota, the canvases the
 * store holds are kept as refs (`storageCopy`), which only the server can resolve.
 */
export function saveConfig(config: DashboardConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    if (!isQuotaError(err)) return; // Storage unavailable (private mode) — the session just won't persist.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storageCopy(config)));
    } catch {
      // Still too large — the copy from before stays.
    }
  }
}

/**
 * Which profile to show: the pinned one, or the one whose design size is
 * closest to the current window (width dominates, height breaks ties).
 */
export function resolveProfile(
  config: DashboardConfig,
  windowWidth: number,
  windowHeight: number
): MonitorProfile {
  if (config.activeProfile !== "auto") {
    const pinned = config.profiles.find((p) => p.id === config.activeProfile);
    if (pinned) return pinned;
  }
  let best: MonitorProfile | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const profile of config.profiles) {
    const score =
      Math.abs(profile.width - windowWidth) +
      Math.abs(profile.height - windowHeight) / 4;
    if (score < bestScore) {
      bestScore = score;
      best = profile;
    }
  }
  return best ?? config.profiles[0] ?? defaultConfig().profiles[0];
}

/** A new, empty profile for the given window size. */
export function newProfile(
  name: string,
  width: number,
  height: number
): MonitorProfile {
  return {
    id: uid("profile"),
    name,
    width,
    height,
    cols: width <= 1280 ? 6 : 12,
    rows: height <= 700 ? 4 : 6,
    fit: height <= 700 && width >= 1600 ? "fill" : "scroll",
    // A blank canvas — the user draws zones, then fills them with widgets.
    pages: [mainPage()],
  };
}

export function clonePlacement(p: Placement): Placement {
  return {
    ...p,
    id: uid(p.module),
    settings: p.settings ? { ...p.settings } : undefined,
    design: p.design ? { ...p.design } : undefined,
    panel: p.panel ? clonePanel(p.panel) : undefined,
  };
}

/** A fresh, empty widget of a kind (ids are unique). */
export function newWidget(kind: WidgetKind): Widget {
  if (kind === "shape")
    return { id: uid("w"), kind, shape: "vbar", thickness: 4, visible: true };
  return { id: uid("w"), kind, visible: true };
}

/** Deep-clone a panel with fresh ids (widgets keep their fields). */
export function clonePanel(p: PanelDef): PanelDef {
  return {
    ...p,
    id: uid("panel"),
    widgets: p.widgets.map((w) => ({ ...w, id: uid("w") })),
  };
}

/** A fresh, empty panel. */
export function newPanel(title: string): PanelDef {
  return {
    id: uid("panel"),
    title,
    titleVisible: true,
    visible: true,
    background: "panel",
    widgets: [],
  };
}
