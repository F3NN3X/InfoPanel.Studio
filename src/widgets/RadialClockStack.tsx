import { useGeneral } from "@/hooks/use-general";
import { hour12Of } from "@/modules/setting-readers";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, hue, pretty, sensorLabel, Num, RingStack, TONES, type ShellProps, type WidgetMeta } from "./kit";
import { dayFraction, nextEvent, rangeFraction, secondFraction, untilText, weekFraction, yearFraction } from "./RadialClock/fractions";
import { useExtras, useNow } from "./time-hooks";

export const meta: WidgetMeta = {
  id: "RadialClockStack",
  name: "Radial Clock Stack",
  category: "Info",
  icon: "donut_large",
  prefixes: [],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Day, year, sensor and next event as rings",
  tags: "rings clock progress year week day calendar time",
  description: "Concentric rings for how far the day and the year (or week) have gone, one sensor and the time to the next calendar event, with the time in the middle.",
};

export interface RadialClockStackProps extends ShellProps {
  look?: ModuleSettings;
  span?: "year" | "week";
  /** The sensor key of the third ring; empty = no ring. */
  sensor?: string;
  sensorMin?: number;
  sensorMax?: number;
  /** An outer ring for the second; ticks once a second. */
  showSeconds?: boolean;
  /** The next-event ring, when a calendar is set up. */
  showEvent?: boolean;
  /** How many minutes before an event its ring starts to fill. */
  horizon?: number;
  /** 0 = Sunday, 1 = Monday (default). */
  weekStart?: number;
  clock?: "auto" | "12" | "24";
}

interface RingRow {
  key: string;
  label: string;
  value: string;
  v: number;
  color: string;
}

const pct = (f: number) => `${Math.round(f * 100)}%`;

export default function RadialClockStack(p: RadialClockStackProps) {
  const { locale } = useGeneral();
  const calendar = useExtras().calendar;
  const secs = p.showSeconds === true;
  const now = useNow(secs ? 1000 : 60_000);
  const next = nextEvent(now, calendar.events, p.horizon ?? 120);
  const sensor = p.sensor ?? "";
  const span = p.span ?? "year";

  const rows: RingRow[] = [
    ...(secs ? [{ key: "s", label: "Second", value: String(new Date(now).getSeconds()), v: secondFraction(now) * 100, color: hue(-60) }] : []),
    { key: "d", label: "Day", value: pct(dayFraction(now)), v: dayFraction(now) * 100, color: "var(--accent)" },
    span === "week"
      ? { key: "w", label: "Week", value: pct(weekFraction(now, p.weekStart ?? 1)), v: weekFraction(now, p.weekStart ?? 1) * 100, color: hue(55) }
      : { key: "y", label: "Year", value: pct(yearFraction(now)), v: yearFraction(now) * 100, color: hue(55) },
    ...(sensor
      ? [
          {
            key: "x",
            label: sensorLabel(sensor, p.names, pretty(sensor.split(".").pop() ?? sensor)),
            value: get(p.data, sensor, "–"),
            v: rangeFraction(num(get(p.data, sensor)), p.sensorMin ?? 0, p.sensorMax ?? 100) * 100,
            color: hue(130),
          },
        ]
      : []),
    ...(calendar.configured && p.showEvent !== false ? [{ key: "e", label: "Next", value: untilText(next.minutes), v: next.fraction * 100, color: TONES.warn }] : []),
  ];

  const time = new Date(now).toLocaleTimeString(locale || undefined, { hour: "numeric", minute: "2-digit", hour12: hour12Of(p.clock) });
  const dayPct = dayFraction(now);
  const summary = { label: time, value: pct(dayPct), sub: "of the day", kind: "ring" as const, pct: dayPct * 100 };

  return (
    <Widget {...shell(p)} title={p.title ?? "Rings"} icon="donut_large" showHeader={p.showHeader} compact={(box) => (box.shape === "tile" ? summary : undefined)} studio={summary}>
      {({ w, h }) => {
        const side = Math.max(0, Math.min(h, w));
        const legend = w >= h * 1.7 && w - h >= 150;
        const ringSide = legend ? h : side;
        const n = rows.length;
        const step = Math.min(11, 30 / n);
        const thickness = step * 0.6;
        // the time sits in the hole: about 36% of the side across
        const timePx = Math.max(10, Math.min(ringSide * 0.14, (ringSide * 0.36) / (time.length * 0.55)));
        return (
          <div className="flex h-full min-w-0 items-center justify-center gap-4">
            <RingStack rings={rows.map((r) => ({ v: r.v, color: r.color }))} thickness={thickness} gap={step * 0.4} className="shrink-0" style={{ width: ringSide, height: ringSide }}>
              <Num className="whitespace-nowrap leading-none" weight={600} style={{ fontSize: timePx }}>
                {time}
              </Num>
            </RingStack>
            {legend && (
              <ul className="flex min-w-0 flex-col gap-1.5 text-xs">
                {rows.map((r) => (
                  <li key={r.key} className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                    <span className="min-w-0 flex-1 truncate text-[color:var(--w-muted)]">{r.label}</span>
                    <span className="shrink-0 tabular-nums">{r.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
