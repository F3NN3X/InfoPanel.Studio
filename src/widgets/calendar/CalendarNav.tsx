// Calendar's `grid-nav` layout (look.json `layouts`, src/widgets/layouts.ts): the kit's month navigator. Notched buttons page the
// month, the month in the accent over a weekday row, six weeks with the neighbouring months' days dimmed and Sunday's column hatched
// with its days struck through (the kit's rest day),
// today framed with a corner flag, the selected day (the next event's, else today) a solid slab, and a footer readout of the
// selected date beside the next event. Everything comes from the clock plugin's date and the calendar links; nothing is made up.
import { useState } from "react";
import type { CalendarEvent } from "@/lib/extras";
import { Widget, shell, Num, Part, TONES, type Box } from "../kit";
import { hatch } from "../shared/layout-parts";
import { useExtras, useNow } from "../time-hooks";
import type { CalendarProps } from "./Calendar";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The navigator needs about this much room; a smaller box shows the standard layout's summary card (or, forced full, the month and the day). */
export const NAV_MIN = { w: 180, h: 170 };
export const navFits = (box: Pick<Box, "w" | "h">): boolean => box.w >= NAV_MIN.w && box.h >= NAV_MIN.h;

/** A day as a comparable key, local time. */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** The 42 days the grid shows for the month of `year`/`month0`: from the week holding the 1st, starting on `weekStart` (0 = Sunday). */
export function monthCells(year: number, month0: number, weekStart: number): Date[] {
  const lead = (new Date(year, month0, 1).getDay() - weekStart + 7) % 7;
  return Array.from({ length: 42 }, (_, i) => new Date(year, month0, 1 - lead + i));
}

/** The day the footer reads and the slab marks: the next event that has not ended (soonest first), else today. */
export function selectedDay(today: Date, events: readonly CalendarEvent[], now: number): { day: Date; event?: CalendarEvent } {
  const event = [...events].filter((e) => e.end > now).sort((a, b) => a.start - b.start)[0];
  if (!event) return { day: today };
  const at = new Date(event.start);
  return { day: new Date(at.getFullYear(), at.getMonth(), at.getDate()), event };
}

/** `2026.11.27`. */
export const dotDate = (d: Date): string => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;

const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The kit's square nav button: a notched outline in the accent, a chevron. */
function NavButton({ dir, size, onClick }: { dir: -1 | 1; size: number; onClick: () => void }) {
  return (
    <button type="button" aria-label={dir < 0 ? "Previous month" : "Next month"} onClick={onClick} className="relative shrink-0 text-[color:var(--w-accent)]" style={{ width: size, height: size }}>
      <svg aria-hidden viewBox="0 0 24 24" className="absolute inset-0 h-full w-full">
        <path d="M0.5 0.5H23.5V18.5L18.5 23.5H0.5Z" fill="none" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={dir < 0 ? "M14 7L9 12L14 17" : "M10 7L15 12L10 17"} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="square" />
      </svg>
    </button>
  );
}

export function CalendarNav(p: CalendarProps & { day: number; month: number; year: number; week: number }) {
  const calendar = useExtras().calendar;
  const now = useNow(60_000);
  const [offset, setOffset] = useState(0);
  const ws = p.weekStart ?? 1;
  const today = new Date(p.year, p.month - 1, p.day);
  const shown = new Date(p.year, p.month - 1 + offset, 1);
  const cells = monthCells(shown.getFullYear(), shown.getMonth(), ws);
  const { day: selected, event } = selectedDay(today, calendar.events, now);
  const marked = new Set(calendar.events.map((e) => dayKey(new Date(e.start))));
  const time = event && !event.allDay ? new Date(event.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : event ? "All day" : undefined;
  const aside = event ? `${event.title} // ${time}` : `W${p.week} // ${calendar.configured ? "No events" : "No calendar"}`;
  // a narrow footer keeps the event's time or the week alone rather than cutting the words short
  const short = event ? time! : `W${p.week}`;
  return (
    <Widget {...shell(p)} title={p.title} showHeader={false} compact={(box) => (navFits(box) ? undefined : { label: WEEKDAYS[today.getDay()], value: p.day, sub: `${MONTHS[p.month - 1]} ${p.year}`, kind: "value" as const, icon: "calendar_today" })}>
      {({ w, h }) => {
        const title = (px: number) => (
          <div className="flex min-w-0 items-baseline justify-center gap-[0.4em] truncate font-semibold uppercase leading-none tracking-[0.06em]" style={{ fontSize: px }}>
            <span className="truncate text-[color:var(--w-accent)]">{MONTHS[shown.getMonth()]}</span>
            <Num className="text-[color:var(--w-fg)]">{shown.getFullYear()}</Num>
          </div>
        );
        // forced full in a small box: the month and the day, no grid
        if (!navFits({ w, h }))
          return (
            <div data-layout="grid-nav" className="flex h-full min-w-0 flex-col justify-center gap-2">
              {title(clamp(11, w * 0.09, 16))}
              <Num className="text-center leading-none text-[color:var(--w-fg)]" style={{ fontSize: clamp(18, h * 0.35, 48) }}>{p.day}</Num>
            </div>
          );
        const navH = Math.round(clamp(22, h * 0.13, 36));
        const headH = 14;
        const footH = 18;
        const gap = 6;
        const foot = (h - navH - headH - footH - gap * 3) / 6 >= 18;
        const rowH = Math.floor((h - navH - headH - gap * 2 - (foot ? footH + gap : 0) - 5 * 2) / 6);
        const cellPx = clamp(11, rowH * 0.5, 20);
        return (
          <div data-layout="grid-nav" className="flex h-full min-w-0 flex-col" style={{ gap }}>
            <div className="flex min-w-0 items-center justify-between gap-2" style={{ height: navH }}>
              <NavButton dir={-1} size={navH} onClick={() => setOffset((o) => o - 1)} />
              <div className="min-w-0 flex-1">{title(clamp(11, navH * 0.5, 20))}</div>
              <NavButton dir={1} size={navH} onClick={() => setOffset((o) => o + 1)} />
            </div>
            <div className="grid grid-cols-7 gap-x-0.5 text-center" style={{ height: headH }}>
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} data-part="label" className="text-micro font-medium uppercase leading-3.5 tracking-[0.06em] text-[color:var(--w-faint)]">
                  {DAYS[(i + ws) % 7]}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5" style={{ gridTemplateRows: `repeat(6, ${rowH}px)` }}>
              {cells.map((c) => {
                const key = dayKey(c);
                const inMonth = c.getMonth() === shown.getMonth();
                // the kit hatches one column, the rest day, and strikes its days through; Saturday is a day like the others
                const rest = c.getDay() === 0;
                const isToday = key === dayKey(today);
                const isSelected = key === dayKey(selected);
                // the cell keeps the column's hatch; today's frame and the selected slab are a box about a cell high, so a wide month keeps square-ish marks
                const mark = { width: `min(100%, ${Math.round(rowH * 1.5)}px)` };
                const dot = marked.has(key) && <span aria-hidden className="absolute bottom-0.75 left-1/2 size-0.75 -translate-x-1/2" style={{ background: TONES.warn }} />;
                const flag = isToday && <span aria-hidden className="absolute right-0 top-0 size-1.75 bg-[color:var(--w-accent)]" style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%)" }} />;
                return (
                  <span key={key} className="flex items-stretch justify-center" data-rest={rest ? "" : undefined} style={{ fontSize: cellPx, ...(rest && !isSelected ? { backgroundImage: hatch(22) } : null) }}>
                    {isSelected ? (
                      <Part kind="slab" as="span" data-part="num" data-selected="" className="flex items-center justify-center font-bold tabular-nums" style={mark}>
                        <span>{c.getDate()}</span>
                        {flag}
                      </Part>
                    ) : (
                      <span
                        data-today={isToday ? "" : undefined}
                        className={`relative flex items-center justify-center tabular-nums ${rest && !isToday ? "line-through decoration-1 " : ""}${isToday ? "font-bold text-[color:var(--w-fg)]" : rest ? "text-[color:var(--w-muted)]" : inMonth ? "font-semibold text-[color:var(--w-fg)]" : "text-[color:var(--w-muted)]"}`}
                        style={{ ...mark, ...(isToday ? { boxShadow: "inset 0 0 0 1px var(--w-accent)" } : null) }}
                      >
                        {c.getDate()}
                        {dot}
                        {flag}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
            {foot && (
              <div className="flex min-w-0 items-center justify-between gap-3 border-t border-[color:color-mix(in_srgb,var(--w-accent)_35%,transparent)] pt-1.5" style={{ height: footH }}>
                <span className="flex shrink-0 items-baseline gap-1.5 text-micro leading-none">
                  <span data-part="label" className="uppercase tracking-[0.08em] text-[color:var(--w-faint)]">Sel</span>
                  <Num className="text-[color:var(--w-fg)]">{dotDate(selected)}</Num>
                </span>
                <span data-part="mono" className="min-w-0 truncate text-micro uppercase leading-none tracking-[0.06em] text-[color:var(--w-muted)]" title={aside}>
                  {w >= 300 ? aside : short}
                </span>
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
