import { CARDS_ID, type Placement, type ProfileView } from "@/lib/layout";
import { panelLegacyLook, panelOwnSettings } from "@/lib/panel-model";
import type { Appearance } from "@/lib/style-resolve";
import { isLocked, sectionOfKey, themeKeyOf, withFlag, type SectionId, type ThemeLevels } from "@/lib/theme-model";
import { modules } from "@/modules";
import { CARD_SETTINGS, PANEL_SETTINGS } from "@/modules/standard-settings";
import { defaultOf, settingKeys, type ModuleSetting, type ModuleSettingValue, type ModuleSettings } from "@/modules/types";
import { followInfo, followSection, rowSection, widgetLookValues, type LookValues } from "../inspector-model";
import { dropKeys } from "../settings-model";
import type { FieldsApi } from "../settings-panel";

/**
 * A zone's settings for the inspector: its schema, where its values come
 * from, what each row shows, the edits, and its sections' Follow bars
 * (a following section shows the theme's values, read-only).
 */

/** The settings schema of a zone (a panel's look, the generic cards' look, or the widget's). */
export function zoneDefs(zone: Placement): ModuleSetting[] {
  if (zone.panel) return PANEL_SETTINGS;
  if (zone.module === CARDS_ID) return CARD_SETTINGS;
  return modules.find((m) => m.id === zone.module)?.settings ?? [];
}

/** Where a zone's values come from: its own over the theme it follows (and a panel's legacy look). */
export function zoneLookValues(zone: Placement, appearance: Appearance): LookValues {
  return widgetLookValues({
    // A panel's legacy title shows until set here.
    own: zone.panel ? panelOwnSettings(zone) : zone.settings,
    levels: appearance,
    moduleDefaults: zone.panel ? panelLegacyLook(zone) : undefined,
    follow: zone.follow,
  });
}

/**
 * The value a row shows: the own value (where it applies), else the theme's, else the default.
 * A colour row with a palette role reads its role (`themeKeyOf`) from the theme.
 */
export function shownValue(values: LookValues, key: string, def: ModuleSetting): ModuleSettingValue {
  const themeKey = themeKeyOf(def, key);
  const applies = def.perWidget || (values.applies?.(themeKey) ?? true);
  return (applies ? values.own?.[key] : undefined) ?? values.inherited?.[themeKey] ?? defaultOf(def, key);
}

/** Every shown value of a schema (what `visibleIf` reads: the resolved values). */
export function shownValues(values: LookValues, defs: readonly ModuleSetting[]): ModuleSettings {
  return Object.fromEntries(defs.flatMap((def) => settingKeys(def).map((k) => [k, shownValue(values, k, def)])));
}

/** A zone with settings set. */
export function withSettings(zone: Placement, patch: ModuleSettings): Placement {
  return { ...zone, settings: { ...zone.settings, ...patch } };
}

/** A zone without some own settings. */
export function withoutSettings(zone: Placement, keys: readonly string[]): Placement {
  return { ...zone, settings: dropKeys(zone.settings, new Set(keys)) };
}

/** A zone with one section following the theme or custom; its own values stay stored either way. */
export const withFollow = (zone: Placement, sec: SectionId, follows: boolean): Placement => {
  const { follow: _old, ...rest } = zone;
  const follow = withFlag(zone.follow, sec, follows);
  return follow ? { ...rest, follow } : rest;
};

/**
 * A zone after an edit of some keys: each theme section they belong to that still follows the theme turns
 * custom (SPEC §4.3: editing any control customises, "Customise here" is a shortcut). A locked section is
 * the screen's and stays as it is; so do per-widget and unthemed keys.
 */
export function customised(zone: Placement, levels: ThemeLevels, defs: readonly ModuleSetting[], keys: readonly string[]): Placement {
  const defByKey = new Map<string, ModuleSetting>(defs.flatMap((d) => settingKeys(d).map((k): [string, ModuleSetting] => [k, d])));
  return keys.reduce<Placement>((acc, key) => {
    const def = defByKey.get(key);
    const sec = def && !def.perWidget ? sectionOfKey(themeKeyOf(def, key)) : undefined;
    return sec === undefined || acc.follow?.[sec] === false || isLocked(levels, sec) ? acc : withFollow(acc, sec, false);
  }, zone);
}

/**
 * The Follow bars and read-only rows of a zone's sections (`zone` is the
 * one whose state shows); `each` applies a follow change to every zone edited.
 */
export function followFields(
  zone: Placement,
  appearance: Appearance,
  each: (fn: (z: Placement) => Placement, key?: string) => void
): Pick<FieldsApi, "follow" | "readOnly"> {
  return {
    follow: (s) => {
      const sec = followSection(s);
      if (!sec) return undefined;
      return {
        ...followInfo(appearance, zone.follow, sec),
        onCustomize: () => each((z) => withFollow(z, sec, false), `follow:${sec}`),
        onUseTheme: () => each((z) => withFollow(z, sec, true), `follow:${sec}`),
      };
    },
    readOnly: (def) => {
      const sec = rowSection(def);
      return sec !== undefined && followInfo(appearance, zone.follow, sec).mode !== "custom";
    },
  };
}

/**
 * The fields of a selection (one zone or several): the rows show the primary
 * zone's values (the last one), and every edit applies to each zone in one
 * undo step. The quick bar edits through it.
 */
export function selectionFields(
  zones: readonly Placement[],
  appearance: Appearance,
  updateProfile: (fn: (p: ProfileView) => ProfileView, key?: string) => void
): FieldsApi {
  const ids = new Set(zones.map((z) => z.id));
  const primary = zones[zones.length - 1];
  const values = zoneLookValues(primary, appearance);
  const each = (fn: (z: Placement) => Placement, key?: string) =>
    updateProfile((p) => ({ ...p, placements: p.placements.map((z) => (ids.has(z.id) ? fn(z) : z)) }), key);
  return {
    values,
    shown: (key: string, def: ModuleSetting) => shownValue(values, key, def),
    onChange: (key: string, v: ModuleSettingValue) => each((z) => withSettings(z, { [key]: v }), `setting:${key}`),
    onPatch: (patch: ModuleSettings) => each((z) => withSettings(z, patch), `setting:${Object.keys(patch).join()}`),
    onClear: (keys: string[]) => each((z) => withoutSettings(z, keys)),
    ...followFields(primary, appearance, each),
  };
}
