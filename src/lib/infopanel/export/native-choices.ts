/**
 * What to do with each native widget when a screen goes to InfoPanel, remembered on the zone:
 * `Placement.settings.ipExport`, a JSON string `{ "<key>": choice }` where the key is `zone` for a module zone and the
 * widget's id for a widget of a panel. `ModuleSettings` is copied as it is by every config version, so a build
 * that doesn't know the key keeps it, and no config version changes. The choices travel with the screen file;
 * a widget that is gone has its choice dropped when the choices are next written.
 */
import { CANVAS_ID, PANEL_ID, type Placement } from "../../layout.ts";
import type { ModuleSettings } from "../../../modules/types.ts";
import { choicesFor, MODULE_TIERS, notCompatible, tierOf, type NativeChoice, type TierEntry } from "../native/tiers.ts";

export const IP_EXPORT_KEY = "ipExport";
/**
 * A grid widget's own export rule (one-editor SPEC §7.4), set in its inspector's On InfoPanel section: the Convert
 * dialog starts from it, and a switch to Free carries it onto the widget item (`WidgetItem.onInfoPanel`).
 */
export const ON_INFOPANEL_KEY = "$onInfoPanel";

export type Choices = Readonly<Record<string, NativeChoice>>;

const CHOICES: readonly NativeChoice[] = ["recreate", "snapshot", "leave"];

/** A zone's choices as the Convert dialog starts from them: the remembered ones, its On InfoPanel rule over the zone's own. */
export function startChoices(settings: ModuleSettings | undefined): Choices {
  const rule = settings?.[ON_INFOPANEL_KEY];
  const own = readChoices(settings);
  return typeof rule === "string" && CHOICES.includes(rule as NativeChoice) ? { ...own, zone: rule as NativeChoice } : own;
}

/** The stored choices; anything unreadable or unknown is dropped. */
export function readChoices(settings: ModuleSettings | undefined): Choices {
  const raw = settings?.[IP_EXPORT_KEY];
  if (typeof raw !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, NativeChoice] => CHOICES.includes(e[1] as NativeChoice)));
  } catch {
    return {};
  }
}

/** The settings with `choices` written; with none left, the key is removed. Keys not in `live` are pruned. */
export function writeChoices(settings: ModuleSettings | undefined, choices: Choices, live: readonly string[]): ModuleSettings {
  const { [IP_EXPORT_KEY]: _old, ...rest } = settings ?? {};
  const kept = Object.fromEntries(Object.entries(choices).filter(([k]) => live.includes(k)));
  return Object.keys(kept).length > 0 ? { ...rest, [IP_EXPORT_KEY]: JSON.stringify(kept) } : rest;
}

/** One widget the user chooses for. */
export interface ExportRow {
  /** The key its choice is stored under. */
  key: string;
  /** The zone it is in. */
  zoneId: string;
  name: string;
  entry: TierEntry;
  /** Its default: recreate where it is built, else a snapshot, and leave out for a widget that isn't InfoPanel data. */
  fallback: NativeChoice;
  options: NativeChoice[];
  /** What the InfoPanel version approximates, or why it isn't exported. */
  note?: string;
}

/** A widget kind of a panel: all are recreated. */
const PANEL_ENTRY: TierEntry = { tier: "native", built: true };

const row = (zoneId: string, key: string, name: string, entry: TierEntry, note?: string): ExportRow => {
  const options = choicesFor(entry);
  return { key, zoneId, name, entry, fallback: options[0], options, ...(note ? { note } : {}) };
};

/** The rows of a zone: its module, or a panel's visible widgets. A canvas zone and an empty zone have none. */
export function rowsOf(p: Placement, titleOf: (moduleId: string) => string): ExportRow[] {
  if (p.module === CANVAS_ID || !p.visible) return [];
  if (p.module === PANEL_ID || p.panel) {
    return (p.panel?.widgets ?? []).filter((w) => w.visible).map((w) => row(p.id, w.id, w.label || w.kind, PANEL_ENTRY));
  }
  if (!(p.module in MODULE_TIERS)) return [];
  const entry = tierOf(p.module);
  const name = titleOf(p.module);
  return [row(p.id, "zone", name, entry, entry.tier === "native-only" ? notCompatible(name) : entry.approximated)];
}

/** The choice for a row: the stored one if the row still offers it, else its default. */
export function choiceFor(r: ExportRow, stored: Choices): NativeChoice {
  const c = stored[r.key];
  return c && r.options.includes(c) ? c : r.fallback;
}

/** The notice lines for widgets that can't go to InfoPanel at all, one per widget. */
export const notices = (rows: readonly ExportRow[]): string[] => rows.filter((r) => r.entry.tier === "native-only").map((r) => notCompatible(r.name));

/** The profile look a conversion styles its new items from (the Convert dialog's and the InfoPanel view's). */
export const CONVERT_LOOK = { Font: "Segoe UI", FontSize: 20, Color: "#FFFFFFFF", BackgroundColor: "#FF0A0A0C" };

/**
 * The zone as an export reads it, with nothing asked: each row's choice as the Convert dialog would start it (the
 * remembered one, else the zone's On InfoPanel rule, else the default) written into its settings.
 */
export function withExportChoices(p: Placement, titleOf: (moduleId: string) => string): Placement {
  const rows = rowsOf(p, titleOf);
  if (rows.length === 0) return p;
  const start = startChoices(p.settings);
  const picked = Object.fromEntries(rows.map((r) => [r.key, choiceFor(r, start)]));
  return { ...p, settings: writeChoices(p.settings, picked, rows.map((r) => r.key)) };
}
