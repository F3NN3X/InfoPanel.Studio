import { Icon, WeatherGlyph, type WeatherIconProps } from "../kit";
import { ITEM_LABELS, type ItemKey } from "./item-keys";
import { PRIORITY, type Reading } from "./items";

/** The items that stack, in slot order, each once: the ones with a value to read (a logo or a card has none). */
export function stackTiles(keys: ItemKey[], readings: Partial<Record<ItemKey, Reading>>): { k: ItemKey; r: Reading; value: string }[] {
  return [...new Set(keys)].flatMap((k) => {
    const r = readings[k];
    const value = r?.parts ? r.parts.join(" ") : r?.value;
    return r && !r.card && value ? [{ k, r, value }] : [];
  });
}

/**
 * The `max` tiles that stay. A preset view drops by `PRIORITY` (the lowest first, the last of them on a tie), as the bar does;
 * any other view drops from the end of the slot order. The ones left keep their slot order.
 */
export function stackShown<T extends { k: ItemKey }>(tiles: T[], max: number, byPriority: boolean): T[] {
  const kept = [...tiles];
  while (kept.length > max) {
    const rank = (t: T) => (byPriority ? (PRIORITY[t.k] ?? 0) : 0);
    kept.splice(kept.reduce((at, t, i) => (rank(t) <= rank(kept[at]) ? i : at), 0), 1);
  }
  return kept;
}

/** A square-ish zone's Status Bar: a two-column grid of tiles, the item's name over its value, so the numbers fill the box. */
export function StackView({ tiles, w, h, icons, byPriority }: { tiles: ReturnType<typeof stackTiles>; w: number; h: number; icons: WeatherIconProps; byPriority: boolean }) {
  return (
    <div className="grid h-full content-start gap-2 p-3" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
      {stackShown(tiles, h < 260 ? 4 : 8, byPriority).map(({ k, r, value }) => (
        <div key={k} className="flex min-w-0 flex-col gap-1 rounded-lg bg-[color:var(--w-track)] px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-micro font-medium uppercase tracking-[0.08em] text-[color:var(--w-muted)]">
            {r.weather ? <WeatherGlyph {...r.weather} {...icons} size={14} className="shrink-0 text-[color:var(--w-muted)]" /> : r.icon && <Icon name={r.icon} className="text-lead" />}
            <span className="truncate">{ITEM_LABELS[k]}</span>
          </span>
          <span className={`truncate ${w >= 360 ? "text-[28px]" : "text-[20px]"} font-semibold leading-none tabular-nums`}>{value}</span>
        </div>
      ))}
    </div>
  );
}
