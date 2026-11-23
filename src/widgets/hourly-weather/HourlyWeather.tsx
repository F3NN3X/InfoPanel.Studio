import type { ModuleSettings } from "@/modules/types";
import { weatherKind } from "@/lib/weather-icons";
import { Widget, shell, get, num, fmt, Empty, Icon, WeatherGlyph, weatherIcon, type ShellProps } from "../kit";
import type { Place } from "../recipe/types";
import { ATTRIBUTION, LICENCE, placePrefix, placeState } from "../recipe/weather";
import { hoursOf, type Hour } from "./place";
import { meta } from "./meta";

export { meta };

export interface HourlyWeatherProps extends ShellProps {
  look?: ModuleSettings;
  /** The place the server fetches; undefined = none set yet. */
  place?: Place;
  /** Hours asked for; as many as fit are drawn. */
  hours?: number;
  /** The chance-of-rain line (default on). */
  showRain?: boolean;
  units?: "C" | "F";
}

/** The width one hour's column needs, px, and the height one hour's row needs. */
const COLUMN_W = 58;
const ROW_H = 30;
/** A box this tall has room for the full credit under the hours. */
const CREDIT_H = 130;

export default function HourlyWeather(p: HourlyWeatherProps) {
  const place = p.place;
  const d = p.data;
  const state = place ? placeState(d, place) : undefined;
  const hours = place ? hoursOf(d, place, p.hours ?? 12) : [];
  const F = p.units === "F";
  const deg = (c: number) => fmt(F ? (c * 9) / 5 + 32 : c, 0);
  const showRain = p.showRain !== false;
  const name = place?.name || "Weather";
  const now = place ? num(get(d, `${placePrefix(place)}temp`)) : Number.NaN;
  const first = hours[0];
  const late = state?.status === "stale" && Number.isFinite(state.age) ? ` · ${state.age} min old` : "";
  const glyph = (h: Hour, className: string) => <WeatherGlyph {...weatherKind("", h.condition, h.night)} className={className} />;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? name}
      icon="schedule"
      right={<span className="truncate text-micro text-[color:var(--w-faint)]">Open-Meteo</span>}
      compact={
        first
          ? { label: name, value: deg(Number.isFinite(now) ? now : first.temp), unit: F ? "°F" : "°C", sub: `${first.condition} · Open-Meteo`, icon: weatherIcon(first.condition), kind: "value" }
          : { label: name, value: "–", sub: place ? "Waiting for weather" : "No place set", icon: "schedule", kind: "value" }
      }
    >
      {({ w, h }) => {
        if (!place) return <Empty icon="location_off" label="No place set" hint="Search for a place in the widget's options" />;
        if (!hours.length) return <Empty icon="cloud_off" label={state?.status === "error" ? "Weather unavailable" : "Waiting for weather"} />;
        const credit = h >= CREDIT_H && (
          <span data-part="credit" className="block shrink-0 text-right text-micro leading-tight text-[color:var(--w-muted)]">
            {ATTRIBUTION} · {LICENCE}
            {late}
          </span>
        );
        const tall = h > w * 1.1;
        if (tall) {
          const rows = hours.slice(0, Math.max(1, Math.floor((h - (credit ? 18 : 0)) / ROW_H)));
          return (
            <div className="flex h-full min-h-0 flex-col gap-1">
              <ul className="flex min-h-0 flex-1 flex-col justify-between">
                {rows.map((x, i) => (
                  <li key={i} className="grid items-center gap-2 text-xs" style={{ gridTemplateColumns: showRain && w >= 150 ? "40px 22px minmax(0,1fr) 34px" : "40px 22px minmax(0,1fr)" }} title={x.condition}>
                    <span className="truncate tabular-nums text-[color:var(--w-muted)]">{x.time}</span>
                    {glyph(x, "text-lg text-[color:var(--w-fg)]")}
                    <span data-part="num" className="font-semibold tabular-nums">{deg(x.temp)}°</span>
                    {showRain && w >= 150 && <span className="text-right tabular-nums text-[color:var(--w-muted)]">{fmt(x.rain, 0)}%</span>}
                  </li>
                ))}
              </ul>
              {credit}
            </div>
          );
        }
        const n = Math.max(1, Math.min(hours.length, Math.floor(w / COLUMN_W)));
        const rain = showRain && h >= 90;
        return (
          <div className="flex h-full min-h-0 flex-col gap-1">
            <div className="grid min-h-0 flex-1 items-center gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
              {hours.slice(0, n).map((x, i) => (
                <div key={i} className="flex min-w-0 flex-col items-center gap-0.5" title={`${x.time} · ${x.condition}`}>
                  {h >= 60 && <span className="text-micro tabular-nums text-[color:var(--w-muted)]">{x.time}</span>}
                  {glyph(x, `${h > 200 ? "text-3xl" : "text-xl"} text-[color:var(--w-fg)]`)}
                  <span data-part="num" className="text-xs font-semibold tabular-nums">{deg(x.temp)}°</span>
                  {rain && (
                    <span className="flex items-center gap-0.5 text-micro tabular-nums text-[color:var(--w-muted)]">
                      <Icon name="water_drop" className="text-micro" />
                      {fmt(x.rain, 0)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
            {credit}
          </div>
        );
      }}
    </Widget>
  );
}
