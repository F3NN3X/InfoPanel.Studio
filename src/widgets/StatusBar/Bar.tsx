import { Fragment, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Icon, Num, WeatherGlyph, useIpTag, usePane, type WeatherIconProps } from "../kit";
import { shownOf, type Display, type ItemKey, type Reading } from "./items";
import { CardView } from "./Cards";
import { splitCenter, type Slots } from "./layout";

export type StatusBarView = "edge" | "pill" | "islands" | "meters" | "orbit" | "ticker";

/** The views that are a floating capsule with drawn items in it (the InfoPanel designs of the same names). */
export const isPreset = (view: StatusBarView): boolean => view === "meters" || view === "orbit" || view === "ticker";

/** The bar's side padding, px: the presets keep their rings off the capsule's round ends. */
export const barPad = (view: StatusBarView, fs: number, u: number): number => (isPreset(view) ? Math.max(fs * 1.1, u * 0.3) : fs * 1.1);

export interface BarProps {
  view: StatusBarView;
  /** The items to draw, after the narrow-bar drop. */
  slots: Slots<ItemKey>;
  readings: Partial<Record<ItemKey, Reading>>;
  display: Display;
  separators: boolean;
  /** Space between items, px. */
  spacing: number;
  /** Text size, px. */
  fs: number;
  /** The bar's height, px: what the drawn items size by. */
  u: number;
  /** The island's gap in the bar's own px; null = none. */
  gap: { left: number; width: number } | null;
  barRef: RefObject<HTMLDivElement | null>;
  icons: WeatherIconProps;
}

function ItemView({ r, display, fs, u, end, icons }: { r: Reading; display: Display; fs: number; u: number; end: boolean; icons: WeatherIconProps }) {
  const shown = shownOf(r, display);
  const tag = useIpTag();
  if (r.card) return <CardView card={r.card} u={u} end={end} />;
  return (
    <span className="flex min-w-0 items-center whitespace-nowrap font-normal" style={{ gap: fs * 0.4, fontSize: fs }}>
      {shown.icon &&
        (r.image ? (
          <img src={r.image} alt="" draggable={false} className="shrink-0 object-contain" style={{ height: fs * 1.5, width: "auto", maxWidth: fs * 4 }} />
        ) : r.weather ? (
          <WeatherGlyph {...r.weather} {...icons} size={fs * 1.3} className="text-[color:var(--w-fg)]" />
        ) : (
          <span className="inline-flex shrink-0" style={{ fontSize: fs * 1.2 }}>
            <Icon name={r.icon} />
          </span>
        ))}
      {shown.value !== undefined &&
        (r.parts ? (
          r.parts.map((part, i) => (
            <Fragment key={i}>
              {i > 0 && <span aria-hidden className="w-px self-stretch bg-[color:var(--w-faint)] opacity-60" style={{ marginInline: fs * 0.2 }} />}
              <Num weight={400}>{part}</Num>
            </Fragment>
          ))
        ) : (
          <Num weight={400} ip={tag(r.ip?.key, r.ip)} className="truncate" style={{ maxWidth: fs * 18 }}>
            {shown.value}
          </Num>
        ))}
    </span>
  );
}

/** The Islands view's pill: the widget's own surface on one slot. */
function Pill({ children, fs }: { children: ReactNode; fs: number }) {
  const pane = usePane();
  return (
    <div className={`flex h-full min-w-0 items-center overflow-hidden ${pane.className}`} style={{ ...pane.style, borderRadius: 9999, paddingInline: fs * 1.1 }}>
      {children}
    </div>
  );
}

/**
 * Meters: the three zones share the width 3:3:2, never narrower than what they hold (the bar's size is fitted to
 * the items, so that fits), and an empty one gives its share to the others.
 */
const meterCols = (s: Slots<ItemKey>): string => [s.left, s.center, s.right].map((items, i) => (items.length > 0 ? `minmax(min-content, ${[3, 3, 2][i]}fr)` : "auto")).join(" ");

/** One edge-to-edge row of three slots; around an island's gap the centre slot splits to either side of it. */
export function Bar(p: BarProps) {
  const { view, slots, fs } = p;
  const islands = view === "islands";
  const padX = islands ? 0 : barPad(view, fs, p.u);
  // a drawn item in the right slot has its ring at the outer end
  const node = (key: ItemKey, end: boolean) => p.readings[key] && <ItemView r={p.readings[key]} display={p.display} fs={fs} u={p.u} end={end} icons={p.icons} />;
  const slot = (items: ItemKey[], end = false) => {
    if (items.length === 0) return null;
    const row = (
      <div className={`flex min-w-0 items-center ${view === "meters" ? "w-full" : ""}`} style={{ gap: p.spacing }}>
        {items.map((key, i) => (
          <Fragment key={key}>
            {i > 0 && p.separators && <span aria-hidden className="h-[1.1em] w-px shrink-0 bg-[color:var(--w-faint)] opacity-60" style={{ fontSize: fs }} />}
            {node(key, end)}
          </Fragment>
        ))}
      </div>
    );
    return islands ? <Pill fs={fs}>{row}</Pill> : row;
  };
  const [before, after] = splitCenter(slots.center);
  const cols = p.gap ? `${Math.max(0, p.gap.left - padX)}px ${p.gap.width}px minmax(0, 1fr)` : view === "meters" ? meterCols(slots) : "minmax(0, 1fr) auto minmax(0, 1fr)";
  // Meters: the zones are split by upright dividers, as tall as a drawn item (its ring is 0.8 of the bar), so none is clipped
  const zoned = view === "meters" && !p.gap;
  const zone = (items: ItemKey[]): CSSProperties | undefined => (zoned && items.length > 0 ? { borderLeft: "1px solid var(--w-track)", paddingInline: padX * 0.5, height: "84%", alignSelf: "center" } : undefined);
  return (
    <div ref={p.barRef} className="h-full w-full min-w-0 overflow-hidden" style={{ fontSize: fs }}>
      <div className="grid h-full items-center" style={{ gridTemplateColumns: cols, paddingInline: padX, paddingBlock: islands ? Math.max(2, fs * 0.3) : 0, columnGap: 0 }}>
        {p.gap ? (
          <>
            <div className="flex h-full min-w-0 items-center justify-between overflow-hidden">
              <div className="flex h-full min-w-0 items-center">{slot(slots.left)}</div>
              <div className="flex h-full min-w-0 items-center">{slot(before)}</div>
            </div>
            <div aria-hidden />
            <div className="flex h-full min-w-0 items-center justify-between overflow-hidden">
              <div className="flex h-full min-w-0 items-center">{slot(after)}</div>
              <div className="flex h-full min-w-0 items-center">{slot(slots.right, true)}</div>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-full min-w-0 items-center justify-start overflow-hidden">{slot(slots.left)}</div>
            <div className={`flex min-w-0 items-center overflow-hidden ${zoned ? "" : "h-full justify-center"}`} style={zone(slots.center)}>{slot(slots.center)}</div>
            <div className={`flex min-w-0 items-center overflow-hidden ${zoned ? "" : "h-full justify-end"}`} style={zone(slots.right)}>{slot(slots.right, true)}</div>
          </>
        )}
      </div>
    </div>
  );
}
