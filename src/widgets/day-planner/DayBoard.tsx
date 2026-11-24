// Day Planner's `board` layout (look.json `layouts`, src/widgets/layouts.ts): the kit's departure board. The time now as a large
// readout, then the calendar's coming events one per ruled row: a lettered badge in a tone, the title, and when it starts (minutes
// within the hour, else the time; `Now` while it runs). The events are the calendar links' (the next 36 hours); nothing is made up.
import { useGeneral } from "@/hooks/use-general";
import { localeHour12 } from "@/lib/general";
import type { CalendarEvent } from "@/lib/extras";
import { hour12Of } from "@/modules/setting-readers";
import { Widget, shell, Num, STATE, TONES as TONE } from "../kit";
import { SectionLabel } from "../shared/layout-parts";
import { useExtras, useInStudio, useNow } from "../time-hooks";
import type { DayPlannerProps } from "./DayPlanner";

/** The badges' tones, in turn. */
const OK = `var(--w-ok, ${STATE.ok})`;
const TONES = ["var(--w-accent)", TONE.warn, OK];
/** One row, px; the readout above takes the rest it needs. */
const ROW_H = 30;

/** The events still to come or running, soonest first. */
export const boardEvents = (events: readonly CalendarEvent[], now: number): CalendarEvent[] => events.filter((e) => e.end > now).sort((a, b) => a.start - b.start);

/** When a row's event starts, as the board prints it: `Now` while it runs, minutes within the hour, else `null` (the caller prints the time). */
export function departs(e: CalendarEvent, now: number): string | null {
  if (e.start <= now) return "Now";
  const min = Math.ceil((e.start - now) / 60_000);
  return min < 60 ? `${min} min` : null;
}

const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function DayBoard(p: DayPlannerProps) {
  const { locale } = useGeneral();
  const studio = useInStudio();
  const calendar = useExtras().calendar;
  const now = useNow(60_000);
  const h12 = hour12Of(p.clock) ?? localeHour12(locale);
  const timeText = (ms: number) => new Date(ms).toLocaleTimeString(locale || undefined, { hour: "numeric", minute: "2-digit", hour12: h12 });
  const events = boardEvents(calendar.events, now);
  const next = events[0];
  const summary = { label: "Next", value: next ? timeText(next.start) : "–", sub: next ? next.title : calendar.configured ? "Nothing planned" : "No calendar", icon: "timeline", kind: "text" as const };
  return (
    <Widget {...shell(p)} title={p.title ?? "Day planner"} icon="timeline" showHeader={p.showHeader} compact={(box) => (box.shape === "tile" ? summary : undefined)} studio={summary}>
      {({ w, h }) => {
        const px = clamp(22, Math.min(h * 0.16, w / 6), 56);
        const rows = Math.max(1, Math.floor((h - px - 28) / ROW_H));
        const shown = events.slice(0, rows);
        return (
          <div data-layout="board" className="flex h-full min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-end justify-between gap-3">
              <SectionLabel right={events.length > 0 ? <Num className="text-[color:var(--w-fg)]">{`${String(shown.length).padStart(2, "0")} / ${String(events.length).padStart(2, "0")}`}</Num> : undefined} className="min-w-0 flex-1 pb-1">
                Next
              </SectionLabel>
              <Num className="shrink-0 leading-none text-[color:var(--w-fg)]" style={{ fontSize: px }}>{timeText(now)}</Num>
            </div>
            {shown.length === 0 ? (
              <div className="flex flex-1 items-center text-caption text-[color:var(--w-muted)]">
                {calendar.configured ? "Nothing planned" : studio ? "No calendar yet. Add an ICS link under Settings › Connections." : "No calendar"}
              </div>
            ) : (
              <ul className="flex min-h-0 flex-col">
                {shown.map((e, i) => {
                  const tone = TONES[i % TONES.length];
                  const when = e.allDay ? "All day" : departs(e, now);
                  return (
                    <li key={e.id} className="flex min-w-0 items-center gap-2.5 border-b border-[color:var(--w-track)] last:border-b-0" style={{ height: ROW_H }}>
                      <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center text-micro font-bold leading-none" style={{ color: tone, boxShadow: `inset 0 0 0 1px ${tone}`, background: `color-mix(in srgb, ${tone} 14%, transparent)` }}>
                        {[...e.title.trim()][0]?.toUpperCase() ?? "·"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-body font-semibold text-[color:var(--w-fg)]" title={e.title}>{e.title}</span>
                      {when === "Now" ? (
                        <span className="shrink-0 text-caption font-semibold uppercase tracking-[0.08em]" style={{ color: OK }}>Now</span>
                      ) : (
                        <Num className="shrink-0 text-body" style={{ color: TONE.warn }}>{when ?? timeText(e.start)}</Num>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
