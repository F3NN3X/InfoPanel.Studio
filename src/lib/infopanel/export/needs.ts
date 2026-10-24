/**
 * What an exported profile asks of the PC it lands on: InfoPanel draws with installed fonts only, and it re-matches
 * HWiNFO sensors by name on import while Libre and plugin sensors must exist with the same ids.
 */
import { walkItems } from "../parse.ts";
import type { DisplayItem } from "../schema.ts";
import { bindingRef, isBound } from "../sensors.ts";

/** Families that ship with Windows 10 and 11 (lower case), so a profile using only these draws the same anywhere. */
const WINDOWS_FONTS = new Set(
  [
    "Arial", "Arial Black", "Bahnschrift", "Calibri", "Cambria", "Cambria Math", "Candara", "Cascadia Code", "Cascadia Mono", "Comic Sans MS", "Consolas",
    "Constantia", "Corbel", "Courier New", "Ebrima", "Franklin Gothic Medium", "Gabriola", "Gadugi", "Georgia", "Impact", "Ink Free", "Javanese Text",
    "Leelawadee UI", "Lucida Console", "Lucida Sans Unicode", "Malgun Gothic", "Microsoft Himalaya", "Microsoft JhengHei", "Microsoft New Tai Lue",
    "Microsoft PhagsPa", "Microsoft Sans Serif", "Microsoft Tai Le", "Microsoft YaHei", "Microsoft Yi Baiti", "MingLiU-ExtB", "Mongolian Baiti", "MS Gothic",
    "MV Boli", "Myanmar Text", "Nirmala UI", "Palatino Linotype", "Segoe Fluent Icons", "Segoe MDL2 Assets", "Segoe Print", "Segoe Script", "Segoe UI",
    "Segoe UI Emoji", "Segoe UI Historic", "Segoe UI Symbol", "SimSun", "Sitka Text", "Sylfaen", "Symbol", "Tahoma", "Times New Roman", "Trebuchet MS",
    "Verdana", "Webdings", "Wingdings", "Yu Gothic",
  ].map((f) => f.toLowerCase()),
);

/** The families the profile's text items name that Windows doesn't ship, in first-use order. */
export function fontsToInstall(items: readonly DisplayItem[]): string[] {
  const out = new Map<string, string>();
  for (const { item } of walkItems(items as DisplayItem[])) {
    // "" is C#'s default (the first installed family): nothing to install.
    const family = "Font" in item ? item.Font.trim() : "";
    if (family && !WINDOWS_FONTS.has(family.toLowerCase()) && !out.has(family.toLowerCase())) out.set(family.toLowerCase(), family);
  }
  return [...out.values()];
}

export interface SensorSources {
  hwinfo: number;
  libre: number;
  plugin: number;
}

/** How many sensor-bound items read from each source (an item with no sensor chosen counts for none). */
export function sensorSources(items: readonly DisplayItem[]): SensorSources {
  const n: SensorSources = { hwinfo: 0, libre: 0, plugin: 0 };
  for (const { item } of walkItems(items as DisplayItem[])) {
    if (!isBound(item) || !bindingRef(item)) continue;
    n[item.SensorType === "HwInfo" ? "hwinfo" : item.SensorType === "Libre" ? "libre" : "plugin"]++;
  }
  return n;
}

/** The export dialog's line about sensors on another PC; null when nothing is bound. */
export function sensorNote(s: SensorSources): string | null {
  const used = [s.hwinfo && `HWiNFO (${s.hwinfo})`, s.libre && `LibreHardwareMonitor (${s.libre})`, s.plugin && `plugin (${s.plugin})`].filter(Boolean);
  if (used.length === 0) return null;
  const rules = [s.hwinfo && "HWiNFO sensors are matched by name on import", (s.libre || s.plugin) && "Libre and plugin sensors must exist on the other PC with the same ids"].filter(Boolean);
  return `Reads ${used.join(", ")} sensors. ${rules.join("; ")}.`;
}
