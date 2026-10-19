import { DEFAULT_THEME, normalizeThemePatch, type ThemeTokens } from "./theme";
import { normalizeBackground, type PageBackground } from "./appearance";
import { normalizeAppearancePresets, type AppearancePreset } from "./appearance-presets";
import type { ModuleSettings } from "@/modules/types";
import type { SectionFlags, WidgetTheme } from "./theme-model";
import {
  migrateBaseStyleV6,
  migrateGeneralV7,
  migrateProfileV6,
  migrateProfileV7,
  migrateProfileV8,
  migrateStyleV7,
  type LegacyProfileFields,
} from "./settings-migrate";
import { normalizeApiBase } from "./data-api";
import { normalizeGeneral, type GeneralSettings } from "./general";
import { normalizeSpacing } from "./profile-grid";
import { YR_FORECAST_KEY } from "./sensors";
import { mainPage, normalizeRotate } from "./pages";
import { normalizeAlerts, type AlertsConfig } from "./alerts";
import { migrateLegacyZones } from "./legacy-zones";
import { storageCopy } from "./canvas-store";
import { normalizeIsland, type IslandConfig } from "./island/config";
import {
  normalizePanelPlacement,
  normalizePanelPresets,
  type PanelDef,
  type UserPanelPreset,
  type Widget,
  type WidgetKind,
} from "./panel-model";
import type { StoredCanvas } from "./infopanel/import/stored.ts";

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
  /** The canvas's file in the server's canvas store (server/canvases.mjs), in place of `canvas`. */
  canvasRef?: string;
  /**
   * Per followable section (`theme-model.ts`): `false` = custom, the
   * widget's own values apply; absent / `true` = it follows the theme (its
   * own values stay stored, ignored). Replaces the v5 `styleMode`.
   */
  follow?: SectionFlags;
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
}

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
   * keys over the dashboard's style, and the sections it locks (widgets
   * then always follow them). Replaces the v5 `style` / `styleEnforce`.
   */
  widgetTheme?: WidgetTheme;
  /**
   * This profile's page background, replacing the dashboard's
   * (`{ type: "none" }`: none for this profile; unset: the dashboard's).
   */
  background?: PageBackground;
  /**
   * This profile's theme colours over the dashboard's (`resolveTheme`);
   * unset = the dashboard's theme.
   */
  theme?: Partial<ThemeTokens>;
  /** This profile's corner radius in rem; unset = the dashboard's. */
  radius?: number;
  /** Space between zones in px (unset = `DEFAULT_GRID_GAP`, see profile-grid.ts). */
  gap?: number;
  /** Space around the grid in px (unset = the page's default per mode, see `profilePadding`). */
  padding?: number;
  /** The Dynamic Island over the page (`src/lib/island`); unset = none. */
  island?: IslandConfig;
  /** Set on the profiles earlier versions shipped (Sample, ARCv2); kept, no longer read. */
  sampleVersion?: number;
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
 */
export const CONFIG_VERSION = 8;

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
  theme: ThemeTokens;
  /** Corner radius in rem (shadcn --radius). */
  radius: number;
  /** Base URL of InfoPanel's Data API (default http://127.0.0.1:3921). */
  dataApiUrl?: string;
  /** Saved widget styles, applied from the studio inspector. */
  stylePresets?: StylePreset[];
  /** Panels the user saved for reuse (Add / widget picker). */
  panelPresets?: UserPanelPreset[];
  /** Page background behind every profile's grid (see appearance.ts). */
  background?: PageBackground;
  /**
   * The all-profiles style: the themed keys every profile's widget theme
   * sits on (the base layer, no locks; see `theme-model.ts`).
   */
  style?: ModuleSettings;
  /** Whole looks the user saved (Appearance gallery; see appearance-presets.ts). */
  appearancePresets?: AppearancePreset[];
  /** Font, clock format, locale, motion and kiosk cursor (see general.ts). */
  general?: GeneralSettings;
  /** Alert rules (see alerts.ts); absent = none. */
  alerts?: AlertsConfig;
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
    theme: { ...DEFAULT_THEME },
    radius: 0.5,
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
    ...normalizePanelPlacement(pl),
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
    return {
      ...page,
      id,
      name: typeof page.name === "string" && page.name ? page.name : `Page ${i + 1}`,
      placements: normalizePlacements(page.placements ?? [], cols, rows),
    };
  });
}

function normalizeProfile(input: StoredProfile): MonitorProfile & LegacyProfileFields {
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
  };
}

/**
 * Image paths saved while the DataBridge plugin served the dashboard point
 * at http://127.0.0.1:3921/assets/<file>; those files now ship in the
 * build under /assets/ip/arcv2/ (see ASSET). Rewrites any saved copy.
 */
const LEGACY_ASSET_PREFIX = "http://127.0.0.1:3921/assets/";
/** InfoPanel export assets, shipped in public/assets/ip/arcv2/. */
const ASSET = (f: string) => `/assets/ip/arcv2/${f}`;

/**
 * The DataBridge's open-meteo forecast is gone; bindings to it move to the
 * yr plugin's forecast, resolved at runtime (YR_FORECAST_KEY) because the
 * location slug differs per user.
 */
const LEGACY_FORECAST_KEYS = [
  "plugins.InfoPanel.DataBridge.weather.forecast",
  "plugins.data-bridge.weather.forecast",
];

/** A config as stored: any version, its profiles v3 or legacy. */
export type StoredConfig = Omit<Partial<DashboardConfig>, "version" | "profiles"> & {
  version?: number;
  profiles?: StoredProfile[];
  /** v5: force the global style on every widget (→ every profile's sections locked). */
  styleEnforce?: boolean;
};

function migrateAssetUrls(config: StoredConfig): StoredConfig {
  const json = JSON.stringify(config);
  const needsFix =
    json.includes(LEGACY_ASSET_PREFIX) ||
    LEGACY_FORECAST_KEYS.some((k) => json.includes(k));
  if (!needsFix) return config;
  let fixed = json.replaceAll(LEGACY_ASSET_PREFIX, ASSET(""));
  for (const key of LEGACY_FORECAST_KEYS)
    fixed = fixed.replaceAll(key, YR_FORECAST_KEY);
  return JSON.parse(fixed);
}

const isSettings = (v: unknown): v is ModuleSettings =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A style that picks a surface ("auto" / empty leave the widget's own). */
const hasSurface = (style: ModuleSettings | undefined): boolean =>
  style?.surface !== undefined && style.surface !== "" && style.surface !== "auto";

/** v3→v4: every page's legacy zones become their templates' (see `migrateLegacyZones`). */
function migrateProfileZones<P extends MonitorProfile & LegacyProfileFields>(p: P, dashboardSurface: boolean): P {
  const ctx = { styledSurface: dashboardSurface || hasSurface(p.style ?? p.widgetTheme?.values) };
  const pages = p.pages.map((pg) => {
    const placements = migrateLegacyZones(pg.placements, ctx);
    return placements === pg.placements ? pg : { ...pg, placements };
  });
  return pages.every((pg, i) => pg === p.pages[i]) ? p : { ...p, pages };
}

/**
 * Merge a stored/partial config over the defaults (tolerates missing
 * fields). Used by the local load and by the server-synced copy (the
 * kiosk pages pull the studio's latest state this way). Also runs the
 * migrations: v1→v2 fills explicit zone boxes + rows on legacy profiles,
 * v2→v3 moves a profile's zones onto its first page, v3→v4 rewrites the
 * legacy module ids to their templates, v5→v6 moves the style onto the
 * widget theme, v6→v7 renames the shared keys, v7→v8 the sample widgets' (`settings-migrate.ts`); a
 * pin to a missing profile falls back to Auto.
 */
export function mergeConfig(input: StoredConfig): DashboardConfig {
  const parsed = migrateAssetUrls(input);
  const defaults = defaultConfig();
  const profiles = (
    parsed.profiles && parsed.profiles.length > 0
      ? parsed.profiles
      : defaults.profiles
  )
    .map(normalizeProfile)
    .map((p) => migrateProfileZones(p, isSettings(parsed.style) && hasSurface(parsed.style)))
    .map((p) =>
      migrateProfileV6(p, {
        legacy: (parsed.version ?? 0) < 6,
        base: isSettings(parsed.style) ? parsed.style : undefined,
        enforce: parsed.styleEnforce === true,
      })
    )
    .map((p) => migrateProfileV7(p, { legacy: (parsed.version ?? 0) < 7 }))
    .map((p) => migrateProfileV8(p, { legacy: (parsed.version ?? 0) < 8 }));
  // v7: the clocks' 12 / 24 h moves from `general` into the all-profiles style (its themed `clock`).
  const v7 = migrateGeneralV7(isSettings(parsed.general) ? parsed.general : undefined, isSettings(parsed.style) ? migrateStyleV7(migrateBaseStyleV6(parsed.style)) : undefined);
  // A pin to a profile that is gone falls back to Auto.
  const byId = new Set(profiles.map((p) => p.id));
  let activeProfile = parsed.activeProfile ?? defaults.activeProfile;
  if (activeProfile !== "auto" && !byId.has(activeProfile))
    activeProfile = "auto";
  return {
    version: CONFIG_VERSION,
    activeProfile,
    sourcePrefs: parsed.sourcePrefs,
    profiles,
    theme: { ...DEFAULT_THEME, ...parsed.theme },
    radius: parsed.radius ?? defaults.radius,
    dataApiUrl: normalizeApiBase(parsed.dataApiUrl) ?? undefined,
    stylePresets: Array.isArray(parsed.stylePresets)
      ? parsed.stylePresets.map((p) => (isSettings(p?.settings) ? { ...p, settings: migrateStyleV7(p.settings) } : p))
      : undefined,
    panelPresets: normalizePanelPresets(parsed.panelPresets),
    background: normalizeBackground(parsed.background),
    style: v7.style,
    appearancePresets: normalizeAppearancePresets(parsed.appearancePresets),
    general: normalizeGeneral(v7.general),
    alerts: normalizeAlerts(parsed.alerts),
  };
}

/** Load the saved config, merged over defaults (tolerates missing fields). */
export function loadConfig(): DashboardConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    return mergeConfig(JSON.parse(raw) as StoredConfig);
  } catch {
    return defaultConfig();
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
