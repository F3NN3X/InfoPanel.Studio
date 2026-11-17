/**
 * The profile picker's model (pinned layer P4, decision 7): the profiles of the panel's size, each with its auto-switch
 * rule, the one shown and the one whose rule names the program in front. The switching itself is the server's
 * (ips-server `control_auto.rs`), which compares program names as `exeKey` does here.
 */
import type { MonitorProfile } from "./layout";

/** A program name as a rule compares it: the file name only, lowercase, without `.exe`. */
export function exeKey(name: string): string {
  const file = name.trim().split(/[\\/]/).pop()?.toLowerCase() ?? "";
  return file.endsWith(".exe") ? file.slice(0, -4) : file;
}

/** Whether a profile's rules name the program `front`. */
export function ruleMatches(profile: Pick<MonitorProfile, "autoSwitch">, front: string | undefined): boolean {
  if (!front || !profile.autoSwitch) return false;
  const key = exeKey(front);
  return profile.autoSwitch.exe.some((e) => exeKey(e) === key);
}

/** One row of the picker. */
export interface PickerRow {
  id: string;
  name: string;
  /** Its place among all the profiles (the chip's series colour, `chipSeries`). */
  index: number;
  /** "Default · 5 pages", "3 pages", or the rule: "Auto: Code.exe, WindowsTerminal.exe". */
  detail: string;
  current: boolean;
  /** Its rule names the program in front, and it is not the one shown. */
  matches: boolean;
}

/**
 * The picker's rows: the profiles of the shown one's size, in the config's order. `defaultId` is the profile the panel
 * shows when nothing overrides it; only the first match is marked, as the server switches to the first.
 */
export function pickerRows(profiles: readonly MonitorProfile[], shownId: string, defaultId: string, front?: string): PickerRow[] {
  const shown = profiles.find((p) => p.id === shownId);
  if (!shown) return [];
  const match = profiles.find((p) => p.width === shown.width && p.height === shown.height && ruleMatches(p, front))?.id;
  return profiles.flatMap((p, index) => {
    if (p.width !== shown.width || p.height !== shown.height) return [];
    const n = p.pages.length;
    const pages = `${n} ${n === 1 ? "page" : "pages"}`;
    const detail = p.autoSwitch ? `Auto: ${p.autoSwitch.exe.join(", ")}` : p.id === defaultId ? `Default · ${pages}` : pages;
    return [{ id: p.id, name: p.name, index, detail, current: p.id === shownId, matches: p.id === match && p.id !== shownId }];
  });
}

/** Program names typed in Studio ("Code.exe, obs64"): split at commas or new lines, trimmed, each once. */
export function parseExeList(text: string): string[] {
  return [...new Set(text.split(/[,\n]/).map((e) => e.trim()).filter(Boolean))];
}
