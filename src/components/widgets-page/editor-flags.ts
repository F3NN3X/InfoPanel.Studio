// Hide and lock in the builder (Phase D, G25): states of the editor only, never in the recipe (owner answer Q6: "Shows when" is the
// saved way to hide). A hidden block is not drawn on the stage (it keeps its room, so the layout is the one the widget will have); a
// locked one is not picked by a click on the stage (the click picks the block holding it) and does not drag in Layers. Both are
// held as block paths and follow their blocks through each edit. Pure, but for `loadFlags` and `saveFlags`, which keep them in this
// browser's storage across a reload (D Q3, builder plan Phase 4).
import type { Recipe } from "@/widgets/recipe/types";
import { blockAt, pathsOf, type Path } from "./builder-model";

/** The blocks hidden and locked in the editor, by path (`"0.1"`), and the recipe those paths are of. */
export interface EditorFlags {
  recipe: Recipe;
  hidden: readonly string[];
  locked: readonly string[];
}

const pathOf = (key: string): number[] => (key ? key.split(".").map(Number) : []);

/**
 * Paths of `before`'s blocks where those blocks are in `after`: found by the block itself (a move, an edit elsewhere, undo), else at the
 * same path when a block of the same type is there (the block itself edited); a block that is gone takes its path with it.
 */
export function followPaths(before: Recipe, after: Recipe, keys: readonly string[]): string[] {
  if (before === after) return [...keys];
  return [
    ...new Set(
      keys.flatMap((key) => {
        const b = blockAt(before, pathOf(key));
        if (!b || !key) return [];
        const found = pathsOf(after, [b])[0];
        if (found) return [found.join(".")];
        return blockAt(after, pathOf(key))?.type === b.type ? [key] : [];
      }),
    ),
  ];
}

/** The flags moved onto `recipe` (`followPaths`), or the same object when they are of it already. */
export function followFlags(flags: EditorFlags, recipe: Recipe): EditorFlags {
  if (flags.recipe === recipe) return flags;
  return { recipe, hidden: followPaths(flags.recipe, recipe, flags.hidden), locked: followPaths(flags.recipe, recipe, flags.locked) };
}

/** `keys` with `paths` put on (`on`) or taken off; the root card is never hidden or locked. */
export function setKeys(keys: readonly string[], paths: readonly Path[], on: boolean): string[] {
  const these = paths.filter((p) => p.length > 0).map((p) => p.join("."));
  return on ? [...new Set([...keys, ...these])] : keys.filter((k) => !these.includes(k));
}

/** Whether a block is under a flag: its own, or a block holding it. */
export const flagged = (keys: readonly string[], path: Path): boolean => keys.some((k) => k !== "" && (path.join(".") === k || path.join(".").startsWith(`${k}.`)));

/** The block a click on the stage at `path` picks: it, unless it or a block holding it is locked; then the block holding the outermost locked one. */
export function stagePick(locked: readonly string[], path: Path): number[] {
  for (let n = 1; n <= path.length; n++) if (locked.includes(path.slice(0, n).join("."))) return path.slice(0, n - 1);
  return [...path];
}

/**
 * Where hide and lock are kept across a reload (D Q3, builder plan Phase 4): this browser's storage, by open recipe, never the recipe
 * itself (Q6, and the format has no key for them).
 */
export const FLAGS_KEY = "studio.widgets.editorFlags";
/** The most recipes whose flags are kept: the ones set last. */
export const FLAGS_KEPT_MAX = 50;

/** The flags as kept, by open recipe's key (`Draft.key`). */
export type KeptFlags = Readonly<Record<string, { hidden: readonly string[]; locked: readonly string[] }>>;

const isPathKey = (k: unknown): k is string => typeof k === "string" && /^\d+(\.\d+)*$/.test(k);

/** The flags a kept text holds; anything that does not read as block paths is left out. */
export function flagsOf(text: string | null): KeptFlags {
  let raw: unknown;
  try {
    raw = JSON.parse(text ?? "{}");
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const keys = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isPathKey) : []);
  return Object.fromEntries(Object.entries(raw as Record<string, { hidden?: unknown; locked?: unknown } | null>).map(([k, f]) => [k, { hidden: keys(f?.hidden), locked: keys(f?.locked) }]));
}

/** The text kept for `flags`: recipes with no flag left out, at most `FLAGS_KEPT_MAX` (the last ones). */
export function flagsText(flags: KeptFlags): string {
  const on = Object.entries(flags).filter(([, f]) => f.hidden.length || f.locked.length);
  return JSON.stringify(Object.fromEntries(on.slice(-FLAGS_KEPT_MAX).map(([k, f]) => [k, { hidden: f.hidden, locked: f.locked }])));
}

/** The flags kept in this browser's storage. */
export function loadFlags(storage: Pick<Storage, "getItem"> = localStorage): KeptFlags {
  try {
    return flagsOf(storage.getItem(FLAGS_KEY));
  } catch {
    return {};
  }
}

/** Writes the flags to this browser's storage (none on: the key goes). A full or blocked storage keeps what it had. */
export function saveFlags(flags: KeptFlags, storage: Pick<Storage, "setItem" | "removeItem"> = localStorage): void {
  try {
    const text = flagsText(flags);
    if (text === "{}") storage.removeItem(FLAGS_KEY);
    else storage.setItem(FLAGS_KEY, text);
  } catch {
    // the flags of the last write that fitted stay
  }
}

/** Kept flags put on `recipe`: only the paths it has blocks at (it may have changed since, in another tab). */
export function flagsOn(kept: KeptFlags[string], recipe: Recipe): EditorFlags {
  const there = (keys: readonly string[]) => keys.filter((k) => !!blockAt(recipe, pathOf(k)));
  return { recipe, hidden: there(kept.hidden), locked: there(kept.locked) };
}

/** The stage's rule for the hidden blocks: each drawn invisible, keeping its room (and out of a click's reach). */
export const hiddenRule = (hidden: readonly string[]): string => hidden.map((k) => `[data-builder-stage] [data-recipe-path="${k}"]{visibility:hidden}`).join("\n");
