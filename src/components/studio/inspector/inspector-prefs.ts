import { useSyncExternalStore } from "react";

/**
 * The inspector's remembered preferences (README §5.9): the open tab of
 * each context ("widget", "panel", "dashboard"). localStorage, read and
 * written defensively: private mode or a full quota keeps the session state.
 */

const TABS_KEY = "studio.inspectorTabs";

/**
 * Tabs that were renamed: a stored old id reads as the new one (Content is Show; the Dashboard's
 * Profile, Appearance and General became Layout, Look and Behaviour).
 */
const RENAMED_TABS: Record<string, string> = {
  content: "show",
  profile: "layout",
  appearance: "look",
  general: "behaviour",
};

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
  // Another window of this origin wrote it (the Settings window's Studio page): read it again.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key && e.key !== null) return;
    cache = null;
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    if (listeners.size === 0) window.addEventListener("storage", onStorage);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) window.removeEventListener("storage", onStorage);
    };
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

/** The removed global "Advanced settings" switch (widget settings v2 PR 1): its stored value is dropped once. */
const RETIRED_KEYS = ["studio.inspectorAdvanced"];

/** Drop the preferences nothing reads any more. */
export function dropRetiredPrefs(storage?: Pick<Storage, "removeItem">): void {
  try {
    const store = storage ?? globalThis.localStorage;
    for (const key of RETIRED_KEYS) store?.removeItem(key);
  } catch {
    // Storage unavailable: nothing to drop.
  }
}
dropRetiredPrefs();

const QUICK_BAR_KEY = "studio.quickBar";
const ACCORDION_KEY = "studio.accordion";
const PINS_KEY = "studio.quickPins";
const ADVANCED_KEY = "studio.inspector.advanced";

/** How many settings the quick bar holds. */
export const MAX_PINS = 6;

/** Sections of a tab: one open at a time (opening one closes the others), or each on its own. */
export type AccordionMode = "one" | "many";

/** The quick bar is on unless it was turned off. */
export const parseQuickBar = (raw: string | null): boolean => raw !== "false";
/** The Advanced switch is off unless it was turned on. */
export const parseAdvanced = (raw: string | null): boolean => raw === "true";
export const parseAccordion = (raw: string | null): AccordionMode => (raw === "many" ? "many" : "one");

/** Pinned keys config v7 renamed: a stored old key reads as the new one (Density, Small zones, Alignment, Temperature). */
const RENAMED_PINS: Record<string, string> = {
  layout: "sizeTier",
  variant: "compact",
  compactView: "compact",
  alignX: "align",
  alignY: "align",
  units: "tempUnit",
};

/** The stored pins per widget type (renamed keys read as their new name, once); anything malformed reads as empty. */
export function parsePins(raw: string | null): Record<string, string[]> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
        .map(([type, keys]) => {
          const named = keys.filter((k): k is string => typeof k === "string").map((k) => RENAMED_PINS[k] ?? k);
          return [type, [...new Set(named)].slice(-MAX_PINS)];
        })
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
const advancedStore = storedValue(ADVANCED_KEY, parseAdvanced, String);

/** Show every inspector setting, including the ones the theme controls (off by default). */
export function useAdvancedPref(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(advancedStore.subscribe, advancedStore.read, advancedStore.read), advancedStore.write];
}

/** Turn Advanced on (a jump to a hidden setting). */
export const showAdvanced = () => advancedStore.write(true);

/** Flip Advanced (the command palette). */
export const toggleAdvanced = () => advancedStore.write(!advancedStore.read());

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
