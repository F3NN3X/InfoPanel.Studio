// Weather's `quote` layout (look.json `layouts`, src/widgets/layouts.ts): the kit's ticket. The weather now as a solid "quote" slab with
// its side notches (the place, NOW, the condition and the feels-like line, the temperature large), the humidity and the cloud cover on
// tick rulers, then the coming days one per ruled row (the day, the condition, the high in the numbers' colour and the low). The
// readings are the standard layout's, from the same plugin keys; nothing is made up.
import { weatherKind } from "@/lib/weather-icons";
import { Widget, shell, get, num, fmt, has, rows, Part, weatherIcon, WeatherGlyph, useIpTag } from "../kit";
import { QuoteSlab, RulerRow } from "../shared/layout-kit";
import { SectionLabel } from "../shared/layout-parts";
import type { WeatherProps } from "./Weather";

const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function WeatherQuote(p: WeatherProps) {
  const d = p.data;
  const yr = [...new Set(Object.keys(d || {}).map((k) => k.match(/^plugins\.yr-weather-plugin\.([^.]+)\.temp$/)?.[1]).filter((x): x is string => !!x))];
  const base = (p.provider ?? (yr.length ? "yr" : "owm")) === "yr" ? `plugins.yr-weather-plugin.${p.location ?? yr[0]}` : "plugins.weather-plugin.weather";
  const k = (s: string) => get(d, `${base}.${s}`);
  const F = p.units === "F";
  const tag = useIpTag();
  const deg = (c: number) => `${fmt(F ? (c * 9) / 5 + 32 : c, 0)}°`;
  const place = has(k("name")) ? String(k("name")) : "Weather";
  const desc = String(k("weather_desc") ?? "");
  const fc = rows(k("forecast")).map(([date, cond, range]) => {
    const [hi, lo] = String(range).split("/").map(num);
    return { date: String(date).match(/^\w{3}\s+\d{1,2}/)?.[0] ?? String(date).split(" ")[0], cond: String(cond ?? ""), hi, lo };
  });
  const lines = [desc, ...(p.showFeels === false ? [] : [`Feels like ${deg(num(k("feels_like")))}`])].filter(Boolean);
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? place}
      icon="location_on"
      compact={{ label: place, value: deg(num(k("temp"))), sub: desc, icon: weatherIcon(`${k("weather_icon")} ${desc}`), kind: "value" }}
      right={has(k("last_refreshed")) && <span data-part="mono" className="text-micro text-[color:var(--w-muted)]">{String(k("last_refreshed")).slice(11)}</span>}
    >
      {({ w, h }) => {
        const px = clamp(22, Math.min(w / 7, h * 0.16), 48);
        const rulers = p.showStats !== false && h >= 200;
        const slabH = px + 52;
        const left = h - slabH - (rulers ? 86 : 0) - 28;
        const days = p.showForecast === false ? 0 : Math.max(0, Math.min(fc.length, Math.floor(left / 24), p.days ?? 7));
        return (
          <div data-layout="quote" className="flex h-full min-h-0 min-w-0 flex-col gap-3">
            <QuoteSlab icon={weatherIcon(`${k("weather_icon")} ${desc}`)} title={place} tag="Now" lines={lines} value={deg(num(k("temp")))} px={px} ip={tag(F ? undefined : `${base}.temp`, { unit: "°", decimals: 0 })} />
            {rulers && (
              <div className="grid min-w-0 grid-cols-2 gap-4">
                <RulerRow label="Humidity" value={`${fmt(num(k("humidity")))}%`} pct={num(k("humidity"))} />
                <RulerRow label="Clouds" value={`${fmt(num(k("clouds")))}%`} pct={num(k("clouds"))} />
              </div>
            )}
            {days > 0 && (
              <div className="flex min-h-0 min-w-0 flex-col gap-1">
                <SectionLabel right={<span data-part="num">{`${String(days).padStart(2, "0")} / ${String(fc.length).padStart(2, "0")}`}</span>}>Forecast</SectionLabel>
                <ol className="flex min-h-0 flex-col overflow-hidden">
                  {fc.slice(0, days).map((f) => (
                    <Part as="li" kind="row" key={f.date} className="grid h-6 min-w-0 grid-cols-[3.5rem_auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 text-caption leading-none">
                      <span data-part="mono" className="truncate text-micro uppercase text-[color:var(--w-muted)]">{f.date}</span>
                      <WeatherGlyph {...weatherKind("", f.cond)} className="text-base text-[color:var(--w-accent)]" />
                      <span className="truncate text-[color:var(--w-fg)]">{f.cond}</span>
                      <span data-part="num" className="tabular-nums">{deg(f.hi)}</span>
                      <span className="w-8 text-right tabular-nums text-[color:var(--w-muted)]">{deg(f.lo)}</span>
                    </Part>
                  ))}
                </ol>
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
