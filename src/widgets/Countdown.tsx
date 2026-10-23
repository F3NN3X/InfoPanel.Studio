import { useState } from "react";
import { useGeneral } from "@/hooks/use-general";
import { useTick } from "@/hooks/use-tick";
import { breakdownOf, dateLine, phaseOf, targetOf, tickMs, unitWord, type Breakdown, type CountMode } from "@/lib/countdown";
import type { ModuleSettings } from "@/modules/types";
import { CountdownBodyView, type CountdownView } from "./CountdownViews";
import { Empty, Widget, shell, type ShellProps, type WidgetMeta } from "./kit";

export const meta: WidgetMeta = {
  id: "Countdown",
  name: "Countdown",
  category: "Info",
  icon: "event",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [1, 1],
  blurb: "Days until an event",
  tags: "event countdown since until date",
  description: "Counts down to an event, or up from it: years, months, days and live hours, minutes and seconds.",
  views: [
    { id: "inline", name: "Inline" },
    { id: "tiles", name: "Tiles", blurb: "Each unit in its own box" },
    { id: "big", name: "Big number", blurb: "One large number" },
  ],
};

export interface CountdownProps extends ShellProps {
  look?: ModuleSettings;
  /** The layout: the numbers in a line, in boxes, or only the largest unit. */
  view?: CountdownView;
  eventName?: string;
  /** "YYYY-MM-DD"; unset = nothing to count yet. */
  date?: string;
  /** "HH:MM", 24 h; unset = an all-day event. */
  time?: string;
  count?: CountMode;
  breakdown?: Breakdown;
  showDate?: boolean;
  /** The time of day's clock (`auto`: the date & time locale's). */
  clock?: "auto" | "12" | "24";
}

/**
 * The current moment, refreshed on the shared ticker whenever a `msFor` boundary passes (one second or a minute);
 * it sleeps in between.
 */
function useNow(msFor: (now: number) => number, on: boolean): Date {
  const [now, setNow] = useState(() => Date.now());
  useTick(() => {
    const t = Date.now();
    setNow((prev) => (Math.floor(t / msFor(prev)) !== Math.floor(prev / msFor(prev)) ? t : prev));
    const step = msFor(t);
    return step - (t % step);
  }, on, 0, "countdown:clock");
  return new Date(now);
}

export default function Countdown(p: CountdownProps) {
  const { locale } = useGeneral();
  const target = p.date ? targetOf(p.date, p.time ?? "") : null;
  const allDay = !p.time;
  const breakdown = p.breakdown ?? "auto";
  const mode = p.count ?? "auto";
  const now = useNow((t) => (target ? tickMs(breakdown, phaseOf(new Date(t), target, mode, allDay), Math.abs(target.getTime() - t)) : 60_000), target !== null);
  const phase = target ? phaseOf(now, target, mode, allDay) : "until";
  const parts = target && phase !== "now" ? breakdownOf(now, target, breakdown) : [];
  const line = target && p.showDate !== false ? dateLine(target, allDay, phase, p.clock ?? "auto", locale) : "";
  const name = p.eventName?.trim() ?? "";
  const first = parts[0];
  const summary = target
    ? { label: name || "Countdown", value: first ? String(first.value) : "Now", unit: first ? unitWord(first) : "", sub: line, kind: "value" as const }
    : { label: name || "Countdown", value: "–", sub: "Pick a date", kind: "value" as const };
  return (
    <Widget {...shell(p)} title={p.title ?? "Countdown"} icon="event" showHeader={p.showHeader} compact={summary} studio={summary}>
      {({ size, w, h }) =>
        target ? <CountdownBodyView body={{ parts, name, dateLine: line, size, w, h }} view={p.view ?? "inline"} /> : <Empty icon="event" label="Pick a date" />
      }
    </Widget>
  );
}
