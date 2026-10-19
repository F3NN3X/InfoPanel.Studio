import { useSyncExternalStore } from "react";

/**
 * The inspector's remembered preferences (README §5.9): the open tab of
 * each context ("widget", "panel", "dashboard"). localStorage, read and
 * written defensively: private mode or a full quota keeps the session state.
 */

const TABS_KEY = "studio.inspectorTabs";

/** Tabs that were renamed: a stored old id reads as the new one (Content is Show). */
const RENAMED_TABS: Record<string, string> = { content: "show" };

/** The stored tab per context; anything malformed reads as empty. */
export function parseTabs(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([context, tab]) => [context, RENAMED_TABS[tab] ?? tab])
    );
  } catch {
    return {};
  }
}

/**
 * The tab to show: the remembered one while the context still has it and it
 * is not disabled (empty), else the first enabled one.
 */
export function pickTab<T extends string>(
  stored: string | undefined,
  tabs: readonly T[],
  disabled: ReadonlySet<string> = new Set()
): T | undefined {
  const enabled = tabs.filter((t) => !disabled.has(t));
  return enabled.find((t) => t === stored) ?? enabled[0] ?? tabs[0];
}

/** One localStorage value shared by every subscriber. */
function storedValue<T>(key: string, parse: (raw: string | null) => T, serialize: (value: T) => string) {
  let cache: { value: T } | null = null;
  const listeners = new Set<() => void>();
  const read = (): T => {
    if (cache === null) {
      try {
        cache = { value: parse(localStorage.getItem(key)) };
      } catch {
        cache = { value: parse(null) };
      }
    }
    return cache.value;
  };
  const write = (value: T) => {
    cache = { value };
    try {
      localStorage.setItem(key, serialize(value));
    } catch {
      // Storage unavailable: keep the session state.
    }
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return { read, write, subscribe };
}

const tabsStore = storedValue(TABS_KEY, parseTabs, JSON.stringify);

/** Remember a context's tab (also from outside it: "Edit global theme" opens the dashboard's Appearance). */
export function setInspectorTab(contextKey: string, tab: string) {
  tabsStore.write({ ...tabsStore.read(), [contextKey]: tab });
}

/** A context's remembered tab (undefined until one was picked). */
export function useInspectorTab(contextKey: string): [string | undefined, (tab: string) => void] {
  const tabs = useSyncExternalStore(tabsStore.subscribe, tabsStore.read, tabsStore.read);
  return [tabs[contextKey], (tab) => setInspectorTab(contextKey, tab)];
}

// -- studio preferences (per viewer, not per dashboard) ------------------------

const QUICK_BAR_KEY = "studio.quickBar";
const ACCORDION_KEY = "studio.accordion";
const PINS_KEY = "studio.quickPins";

/** How many settings the quick bar holds. */
export const MAX_PINS = 6;

/** Sections of a tab: one open at a time (opening one closes the others), or each on its own. */
export type AccordionMode = "one" | "many";

/** The quick bar is on unless it was turned off. */
export const parseQuickBar = (raw: string | null): boolean => raw !== "false";
export const parseAccordion = (raw: string | null): AccordionMode => (raw === "many" ? "many" : "one");

/** The stored pins per widget type; anything malformed reads as empty. */
export function parsePins(raw: string | null): Record<string, string[]> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
        .map(([type, keys]) => [type, keys.filter((k): k is string => typeof k === "string").slice(-MAX_PINS)])
    );
  } catch {
    return {};
  }
}

/** Pin or unpin `key`: pins keep their order, a new one goes last, and only the last six stay. */
export function togglePin(pins: readonly string[], key: string): string[] {
  return pins.includes(key) ? pins.filter((k) => k !== key) : [...pins, key].slice(-MAX_PINS);
}

const quickBarStore = storedValue(QUICK_BAR_KEY, parseQuickBar, String);
const accordionStore = storedValue(ACCORDION_KEY, parseAccordion, String);
const pinsStore = storedValue(PINS_KEY, parsePins, JSON.stringify);

/** The quick bar over the canvas (on by default). */
export function useQuickBarPref(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(quickBarStore.subscribe, quickBarStore.read, quickBarStore.read), quickBarStore.write];
}

/** One section open per tab, or many (one by default). */
export function useAccordionPref(): [AccordionMode, (mode: AccordionMode) => void] {
  return [useSyncExternalStore(accordionStore.subscribe, accordionStore.read, accordionStore.read), accordionStore.write];
}

/** Every widget type's own pins (a type without any uses its default quick set). */
export function useQuickPins(): Record<string, string[]> {
  return useSyncExternalStore(pinsStore.subscribe, pinsStore.read, pinsStore.read);
}

/** A widget type's pinned keys: its own pins, or its default quick set. */
export const pinsOf = (all: Record<string, string[]>, type: string, defaults: readonly string[]): string[] =>
  all[type] ?? [...defaults];

/** Pin or unpin a setting for a widget type (starting from its default set the first time). */
export function setPin(type: string, defaults: readonly string[], key: string) {
  const all = pinsStore.read();
  pinsStore.write({ ...all, [type]: togglePin(pinsOf(all, type, defaults), key) });
}
