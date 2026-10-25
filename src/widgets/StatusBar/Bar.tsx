import { Fragment, type ReactNode, type RefObject } from "react";
import { Icon, Num, WeatherGlyph, useIpTag, usePane, type WeatherIconProps } from "../kit";
import { shownOf, type Display, type ItemKey, type Reading } from "./items";
import { splitCenter, type Slots } from "./layout";

export type StatusBarView = "edge" | "pill" | "islands";

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
  /** The island's gap in the bar's own px; null = none. */
  gap: { left: number; width: number } | null;
  barRef: RefObject<HTMLDivElement | null>;
  icons: WeatherIconProps;
}

function ItemView({ r, display, fs, icons }: { r: Reading; display: Display; fs: number; icons: WeatherIconProps }) {
  const shown = shownOf(r, display);
  const tag = useIpTag();
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

/** One edge-to-edge row of three slots; around an island's gap the centre slot splits to either side of it. */
export function Bar(p: BarProps) {
  const { view, slots, fs } = p;
  const islands = view === "islands";
  const padX = islands ? 0 : fs * 1.1;
  const node = (key: ItemKey) => p.readings[key] && <ItemView r={p.readings[key]} display={p.display} fs={fs} icons={p.icons} />;
  const slot = (items: ItemKey[]) => {
    if (items.length === 0) return null;
    const row = (
      <div className="flex min-w-0 items-center" style={{ gap: p.spacing }}>
        {items.map((key, i) => (
          <Fragment key={key}>
            {i > 0 && p.separators && <span aria-hidden className="h-[1.1em] w-px shrink-0 bg-[color:var(--w-faint)] opacity-60" style={{ fontSize: fs }} />}
            {node(key)}
          </Fragment>
        ))}
      </div>
    );
    return islands ? <Pill fs={fs}>{row}</Pill> : row;
  };
  const [before, after] = splitCenter(slots.center);
  const cols = p.gap ? `${Math.max(0, p.gap.left - padX)}px ${p.gap.width}px minmax(0, 1fr)` : "minmax(0, 1fr) auto minmax(0, 1fr)";
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
              <div className="flex h-full min-w-0 items-center">{slot(slots.right)}</div>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-full min-w-0 items-center justify-start overflow-hidden">{slot(slots.left)}</div>
            <div className="flex h-full min-w-0 items-center justify-center">{slot(slots.center)}</div>
            <div className="flex h-full min-w-0 items-center justify-end overflow-hidden">{slot(slots.right)}</div>
          </>
        )}
      </div>
    </div>
  );
}
