/**
 * The Data API keys a stored canvas reads, straight from its JSON (each item's `$.key`, groups
 * included). Kept apart from canvas.ts so the zone's sensor subscription does not pull the
 * InfoPanel model into the kiosk bundle before a canvas is drawn.
 */
const MAX_DEPTH = 32;

export function storedCanvasKeys(canvas: unknown): string[] {
  const keys = new Set<string>();
  const walk = (list: unknown, depth: number) => {
    if (!Array.isArray(list) || depth > MAX_DEPTH) return;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const o = item as { $?: { key?: unknown }; DisplayItems?: unknown };
      if (typeof o.$?.key === "string" && o.$.key) keys.add(o.$.key);
      walk(o.DisplayItems, depth + 1);
    }
  };
  walk((canvas as { items?: unknown } | null | undefined)?.items, 0);
  return [...keys].sort();
}

/** A Studio widget's record as stored (`$.widget`), read loosely: only its module, settings and panel name its keys. */
export interface StoredWidgetRef {
  module: string;
  settings?: Record<string, unknown>;
  panel?: { widgets?: unknown };
}

/** The Studio widgets a stored canvas holds (Free pages, one-editor SPEC §3.3), groups included, straight from its JSON. */
export function storedCanvasWidgets(canvas: unknown): StoredWidgetRef[] {
  const out: StoredWidgetRef[] = [];
  const walk = (list: unknown, depth: number) => {
    if (!Array.isArray(list) || depth > MAX_DEPTH) return;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const o = item as { kind?: unknown; $?: { widget?: unknown }; DisplayItems?: unknown };
      const w = o.$?.widget as StoredWidgetRef | undefined;
      if (o.kind === "Image" && w && typeof w === "object" && typeof w.module === "string") out.push(w);
      walk(o.DisplayItems, depth + 1);
    }
  };
  walk((canvas as { items?: unknown } | null | undefined)?.items, 0);
  return out;
}
