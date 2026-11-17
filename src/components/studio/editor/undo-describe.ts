import type { DashboardConfig, MonitorProfile, Placement, ProfilePage } from "@/lib/layout";
import type { ModuleSetting } from "@/modules/types";
import { zoneDefs } from "../inspector/zone-fields";
import { zoneName } from "../inspector/zone-meta";

/** An undo step in words, and where it happened. */
export interface StepName {
  /** "Outer ring → VRAM". */
  text: string;
  /** What it happened on ("GPU Rings"): the toast's end. */
  on?: string;
  /** The zone to select after undoing, and the setting to light. */
  target?: { profileId: string; pageId: string; zoneId: string; key?: string };
}

/** Keys that change with an edit but are not one. */
const SKIPPED = new Set(["updatedAt"]);

/** Equal by value, shared parts first: snapshots keep what did not change, so most of a page is met by identity and never walked. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false;
  const [x, y] = [a as Record<string, unknown>, b as Record<string, unknown>];
  const keys = Object.keys(x).filter((k) => x[k] !== undefined);
  return keys.length === Object.keys(y).filter((k) => y[k] !== undefined).length && keys.every((k) => same(x[k], y[k]));
}

/** The keys of two records that differ. */
function changedKeys(a: object | undefined, b: object | undefined): string[] {
  const [x, y] = [(a ?? {}) as Record<string, unknown>, (b ?? {}) as Record<string, unknown>];
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => !SKIPPED.has(k) && !same(x[k], y[k]));
}

/** A setting's new value as the inspector words it: an option's label, On or Off, the number. */
export function valueWords(def: ModuleSetting, value: unknown): string | null {
  if (value === undefined) return "default";
  if (typeof value === "boolean") return value ? "On" : "Off";
  const option = def.options?.find((o) => o.value === value);
  if (option) return option.label;
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value !== "" && value.length <= 24 ? value : null;
}

/** One zone changed: the setting and its new value, a move, a resize, a hide. */
function zoneStep(before: Placement, after: Placement, profileId: string, pageId: string): StepName {
  const on = zoneName(after);
  const target = { profileId, pageId, zoneId: after.id };
  const keys = changedKeys(before.settings, after.settings);
  if (keys.length === 1) {
    const key = keys[0];
    const def = zoneDefs(after).find((d) => d.key === key);
    if (def) {
      const value = valueWords(def, after.settings?.[key]);
      return { text: value === null ? def.label : `${def.label} → ${value}`, on, target: { ...target, key } };
    }
  }
  if (keys.length > 1) return { text: `${keys.length} settings`, on, target };
  if (before.visible !== after.visible) return { text: after.visible ? `Show ${on}` : `Hide ${on}`, target };
  if (before.colSpan !== after.colSpan || before.rowSpan !== after.rowSpan) return { text: `Resize ${on}`, target };
  if (before.colStart !== after.colStart || before.rowStart !== after.rowStart) return { text: `Move ${on}`, target };
  return { text: `Edit ${on}`, target };
}

function pageStep(before: ProfilePage, after: ProfilePage, profileId: string): StepName {
  if (before.name !== after.name) return { text: `Rename page to ${after.name}` };
  const was = new Map(before.placements.map((p) => [p.id, p]));
  const now = new Map(after.placements.map((p) => [p.id, p]));
  const added = after.placements.filter((p) => !was.has(p.id));
  const removed = before.placements.filter((p) => !now.has(p.id));
  if (added.length === 1 && removed.length === 0) return { text: `Add ${zoneName(added[0])}` };
  if (removed.length === 1 && added.length === 0) return { text: `Delete ${zoneName(removed[0])}`, target: { profileId, pageId: after.id, zoneId: removed[0].id } };
  const changed = after.placements.filter((p) => was.has(p.id) && was.get(p.id) !== p && !same(was.get(p.id), p));
  if (changed.length === 1 && added.length === 0 && removed.length === 0) return zoneStep(was.get(changed[0].id) as Placement, changed[0], profileId, after.id);
  if (changed.length + added.length + removed.length > 1) return { text: `${changed.length + added.length + removed.length} widgets` };
  return { text: `Edit ${after.name}` };
}

function profileStep(before: MonitorProfile, after: MonitorProfile): StepName {
  if (before.name !== after.name) return { text: `Rename screen to ${after.name}` };
  if (!same(before.pinned, after.pinned) && same(before.pages, after.pages)) return { text: "Edit the pinned layer" };
  const added = after.pages.filter((p) => !before.pages.some((x) => x.id === p.id));
  const removed = before.pages.filter((p) => !after.pages.some((x) => x.id === p.id));
  if (added.length === 1 && removed.length === 0) return { text: `Add page ${added[0].name}` };
  if (removed.length === 1 && added.length === 0) return { text: `Delete page ${removed[0].name}` };
  const changed = after.pages.filter((p) => {
    const was = before.pages.find((x) => x.id === p.id);
    return was !== undefined && was !== p && !same(was, p);
  });
  if (changed.length === 1) return pageStep(before.pages.find((x) => x.id === changed[0].id) as ProfilePage, changed[0], after.id);
  if (changed.length === 0 && !same(before.pages.map((p) => p.id), after.pages.map((p) => p.id))) return { text: "Page order" };
  return { text: `Edit ${after.name}` };
}

/**
 * Names the step between two snapshots of the config, for the Undo and Redo tooltips and the toast (E3). Nothing is
 * stored: snapshots share what did not change, so the walk compares by identity first and stays cheap. Null when the
 * step is not a screen's (an alert rule, the Data API address): those read plain Undo.
 */
export function describeChange(before: DashboardConfig, after: DashboardConfig): StepName | null {
  if (before === after) return null;
  const added = after.profiles.filter((p) => !before.profiles.some((x) => x.id === p.id));
  const removed = before.profiles.filter((p) => !after.profiles.some((x) => x.id === p.id));
  if (added.length === 1 && removed.length === 0) return { text: `Add screen ${added[0].name}` };
  if (removed.length === 1 && added.length === 0) return { text: `Delete screen ${removed[0].name}` };
  const changed = after.profiles.filter((p) => {
    const was = before.profiles.find((x) => x.id === p.id);
    return was !== undefined && was !== p && changedKeys(was, p).length > 0;
  });
  if (changed.length !== 1) return null;
  return profileStep(before.profiles.find((x) => x.id === changed[0].id) as MonitorProfile, changed[0]);
}

/** The toast's sentence: "Undid Outer ring → VRAM on GPU Rings". */
export const stepSentence = (verb: "Undid" | "Redid", step: StepName | null): string =>
  step ? `${verb} ${step.text}${step.on ? ` on ${step.on}` : ""}` : `${verb} the last change`;
