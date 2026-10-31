/**
 * The one-way upgrade of a config saved by an older version to this build's, in a chunk of its own: only an older
 * config loads it (`readConfig` in layout.ts), so the kiosk and the studio don't carry it otherwise. Each version
 * adds its step here. The steps: v1→v2 fills explicit zone boxes + rows on legacy profiles, v2→v3 moves a profile's
 * zones onto its first page, v3→v4 rewrites the legacy module ids to their templates, v5→v6 moves the style onto the
 * widget theme, v6→v7 renames the shared keys, v7→v8 the sample widgets', v8→v9 moves a Custom gauge panel widget's
 * width (`settings-migrate.ts`; the panels' own normalisation runs it), v9→v10 drops the widget `preset` key, v11→v12
 * turns the audio widgets' single `device` into a pick, v12→v13 only stamps the version, the old Stream Deck widget's mirror keys go (`migrateProfileStreamDeck`, no version of its own), v13→v14 marks Free pages and
 * the screens made for InfoPanel, v14→v15 makes every page one kind (`migrateProfileV15`, a line in `log` per change
 * it makes), v15→v16 gives each screen the look it inherited (`migrateScreensV16`). A config at this build's version
 * comes out as `mergeConfig` makes it.
 */
import type { ModuleSettings } from "@/modules/types";
import { normalizeAlerts } from "./alerts";
import { normalizeAppearancePresets } from "./appearance-presets";
import { normalizeApiBase } from "./data-api";
import { normalizeGeneral } from "./general";
import { CONFIG_VERSION, defaultConfig, normalizePalettes, normalizeProfile, type DashboardConfig, type MonitorProfile, type StoredConfig } from "./layout";
import { migrateLegacyZones } from "./legacy-zones";
import { migrateProfileV15 } from "./page-model/migrate";
import { normalizePanelPresets } from "./panel-model";
import { clockOfStyle, dashboardLook, migrateScreensV16 } from "./screen-look-migrate";
import { YR_FORECAST_KEY } from "./sensors";
import {
  migrateBaseStyleV6,
  migrateGeneralV7,
  migrateProfileV6,
  migrateProfileV7,
  migrateProfileV8,
  migrateProfileV10,
  migrateProfileV12,
  migrateProfileStreamDeck,
  migrateProfileV14,
  migrateStyleV7,
  type LegacyProfileFields,
} from "./settings-migrate";

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

/** `input`, of any version, as this build's config. */
export function upgradeConfig(input: StoredConfig, log?: string[]): DashboardConfig {
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
    .map((p) => migrateProfileV8(p, { legacy: (parsed.version ?? 0) < 8 }))
    .map(migrateProfileV10)
    .map(migrateProfileV12)
    .map(migrateProfileStreamDeck)
    .map((p) => migrateProfileV14(p, { legacy: (parsed.version ?? 0) < 14 }))
    .map((p) => migrateProfileV15(p, { legacy: (parsed.version ?? 0) < 15, log }));
  // v7: the clocks' 12 / 24 h moves from `general` into the all-profiles style (its themed `clock`).
  const v7 = migrateGeneralV7(isSettings(parsed.general) ? parsed.general : undefined, isSettings(parsed.style) ? migrateStyleV7(migrateBaseStyleV6(parsed.style)) : undefined);
  // A pin to a profile that is gone falls back to Auto.
  const byId = new Set(profiles.map((p) => p.id));
  let activeProfile = parsed.activeProfile ?? defaults.activeProfile;
  if (activeProfile !== "auto" && !byId.has(activeProfile))
    activeProfile = "auto";
  const legacy = (parsed.version ?? 0) < 16;
  // v16: the all-profiles style's 12 / 24 h becomes the app's.
  const clock = legacy ? clockOfStyle(v7.style) : undefined;
  const config: DashboardConfig = {
    version: CONFIG_VERSION,
    activeProfile,
    sourcePrefs: parsed.sourcePrefs,
    profiles,
    dataApiUrl: normalizeApiBase(parsed.dataApiUrl) ?? undefined,
    stylePresets: Array.isArray(parsed.stylePresets)
      ? parsed.stylePresets.map((p) => (isSettings(p?.settings) ? { ...p, settings: migrateStyleV7(p.settings) } : p))
      : undefined,
    panelPresets: normalizePanelPresets(parsed.panelPresets),
    appearancePresets: normalizeAppearancePresets(parsed.appearancePresets),
    palettes: normalizePalettes(parsed.palettes),
    general: normalizeGeneral(clock ? { ...v7.general, clock } : v7.general),
    alerts: normalizeAlerts(parsed.alerts),
  };
  // v16: each screen gets the look it inherited from the dashboard, whose fields go.
  return legacy ? migrateScreensV16(config, dashboardLook({ ...parsed, general: v7.general }, v7.style)) : config;
}

