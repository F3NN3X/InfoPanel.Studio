// Weather's forecast view: the multi-day forecast, drawn as the Forecast widget drew it before it merged into Weather (config v19).
import type { ModuleSettings } from "@/modules/types";
import { weatherKind } from "@/lib/weather-icons";
import { Widget, shell, get, num, fmt, rows, RangeBar, WeatherGlyph, weatherIcon, type ShellProps, type WeatherIconProps } from "../kit";

interface Day {
  day: string;
  date: string;
  cond: string;
  hi: number;
  lo: number;
  rain: number;
  wind: string;
}

export interface ForecastProps extends ShellProps {
  look?: ModuleSettings;
  /** Yr container slug. */
  location?: string;
  /** Default: as many as fit. */
  days?: number;
  units?: "C" | "F";
  /** The icon set: the app's own or Meteocons, with the Meteocons style and whether they animate. */
  iconSet?: WeatherIconProps["set"];
  iconStyle?: WeatherIconProps["style"];
  iconAnimated?: boolean;
}

export default function Forecast(p: ForecastProps) {
  const d = p.data;
  const loc = p.location ?? Object.keys(d || {}).map((k) => k.match(/^plugins\.yr-weather-plugin\.([^.]+)\.forecast$/)?.[1]).find(Boolean);
  const F = p.units === "F";
  const toUnitOf = (c: number) => (F ? (c * 9) / 5 + 32 : c);
  const fc: Day[] = rows(get(d, `plugins.yr-weather-plugin.${loc}.forecast`)).map(([date, cond, range, rain, wind]) => {
    const [hi, lo] = String(range).split("/").map(num);
    return { day: date?.split(" ")[0], date: date?.split(" ").slice(1).join(" "), cond, hi: toUnitOf(hi), lo: toUnitOf(lo), rain: num(rain), wind };
  });
  const lo = Math.min(...fc.map((f) => f.lo)),
    hi = Math.max(...fc.map((f) => f.hi)),
    span = hi - lo || 1;
  const first = fc[0];
  const glyph = (cond: string, className: string) => <WeatherGlyph {...weatherKind("", cond)} set={p.iconSet} style={p.iconStyle} animated={p.iconAnimated} className={className} />;
  // The hi/lo range bar; called as a function so nothing is defined during render.
  const range = (f: Day, horizontal?: boolean) => <RangeBar from={((f.lo - lo) / span) * 100} to={((f.hi - lo) / span) * 100} horizontal={horizontal} />;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Forecast"}
      icon="calendar_month"
      studio={{ label: "Forecast", value: `${fmt(first?.hi ?? NaN, 0)}°`, sub: `Tomorrow · ${first?.cond ?? ""}`, kind: "value", rows: fc.map((f, i) => ({ n: i === 0 ? "Tomorrow" : f.day, v: `${fmt(f.hi, 0)}° / ${fmt(f.lo, 0)}°` })) }}
      compact={(box) => (box.shape === "tile" && first ? { label: "Tomorrow", value: `${fmt(first.hi, 0)}°`, sub: `${first.cond} · ${fmt(first.lo, 0)}°`, icon: weatherIcon(first.cond), kind: "value" } : undefined)}
    >
      {({ w, h }) => {
        const tall = h > w * 1.1;
        // under 130px the fixed columns alone (36 + 20 + 32 + gaps) outgrow the row: the range bar goes and the day takes the slack
        const narrow = w < 130;
        if (tall)
          return (
            <ul className="flex h-full flex-col justify-between gap-1">
              {fc.slice(0, p.days ?? Math.max(1, Math.floor(h / 34))).map((f, i) => (
                <li key={i} className={`grid items-center text-xs ${narrow ? "gap-1" : "gap-2"}`} style={{ gridTemplateColumns: narrow ? "minmax(0,1fr) 18px auto" : w < 200 ? "36px 20px minmax(0,1fr) 32px" : "34px 22px 28px minmax(0,1fr) 28px" }} title={`${f.cond} · ${f.rain} mm · ${f.wind}`}>
                  <span className="truncate text-[color:var(--w-muted)]">{i === 0 ? "Tomorrow" : f.day}</span>
                  {glyph(f.cond, "text-lg text-[color:var(--w-fg)]")}
                  {w >= 200 && <span className="text-right tabular-nums text-[color:var(--w-faint)]">{fmt(f.lo, 0)}°</span>}
                  {!narrow && range(f, true)}
                  <span className="font-medium tabular-nums">{fmt(f.hi, 0)}°</span>
                </li>
              ))}
            </ul>
          );
        const n = p.days ?? Math.max(1, Math.min(fc.length, Math.floor(w / 62)));
        // under 100px tall (a two-row zone of a short-row grid) a day is its name over one line of icon and hi / lo
        if (h < 100)
          return (
            <div className="grid h-full items-center gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
              {fc.slice(0, n).map((f, i) => (
                <div key={i} className="flex min-w-0 flex-col items-center gap-0.5" title={`${f.cond} · ${f.rain} mm · ${f.wind}`}>
                  {h >= 34 && <span className="text-micro leading-[14px] text-[color:var(--w-muted)]">{f.day}</span>}
                  <span className="flex min-w-0 items-center gap-1 text-xs leading-4">
                    {glyph(f.cond, "shrink-0 text-base text-[color:var(--w-fg)]")}
                    <span className="truncate tabular-nums">
                      <b className="font-semibold">{fmt(f.hi, 0)}°</b>
                      <span className="text-[color:var(--w-faint)]">/{fmt(f.lo, 0)}°</span>
                    </span>
                  </span>
                </div>
              ))}
            </div>
          );
        return (
          <div className="grid h-full gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
            {fc.slice(0, n).map((f, i) => (
              <div key={i} className="flex min-h-0 flex-col items-center gap-1.5" title={`${f.cond} · ${f.rain} mm · ${f.wind}`}>
                <span className="text-micro text-[color:var(--w-muted)]">{f.day}</span>
                {glyph(f.cond, `${h > 200 ? "text-3xl" : "text-xl"} text-[color:var(--w-fg)]`)}
                <span className="text-xs font-semibold tabular-nums">{fmt(f.hi, 0)}°</span>
                {h > 150 && <div className="flex min-h-[16px] flex-1 justify-center">{range(f)}</div>}
                <span className="text-micro tabular-nums text-[color:var(--w-faint)]">{fmt(f.lo, 0)}°</span>
                {h > 230 && f.rain > 0 && <span className="text-micro tabular-nums text-sky-300">{fmt(f.rain, 1)} mm</span>}
              </div>
            ))}
          </div>
        );
      }}
    </Widget>
  );
}
