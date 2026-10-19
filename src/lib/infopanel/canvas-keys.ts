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
