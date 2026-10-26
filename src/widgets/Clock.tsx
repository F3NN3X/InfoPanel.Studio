import { useGeneral } from "@/hooks/use-general";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { localeHour12 } from "@/lib/general";
import type { ModuleSettings } from "@/modules/types";
import { Figure } from "./SensorValue";
import { Widget, shell, get, num, Num, useIpTag, type ShellProps } from "./kit";
import { meta } from "./meta/Clock";

export { meta };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Analog({ h, m, s, seconds }: { h: number; m: number; s: number; seconds: boolean }) {
  const hand = (deg: number, len: number, w: number, c: string) => (
    <line x1="50" y1="50" x2={50 + len * Math.sin((deg * Math.PI) / 180)} y2={50 - len * Math.cos((deg * Math.PI) / 180)} stroke={c} strokeWidth={w} strokeLinecap="round" />
  );
  return (
    <svg viewBox="0 0 100 100" className="aspect-square h-full max-h-full">
      <circle cx="50" cy="50" r="47" fill="var(--w-track)" stroke="var(--w-track)" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1="50" y1="7" x2="50" y2={i % 3 ? 10 : 13} stroke="var(--w-faint)" strokeWidth={i % 3 ? 1 : 2} transform={`rotate(${i * 30} 50 50)`} />
      ))}
      {hand(((h % 12) + m / 60) * 30, 24, 3.5, "var(--w-fg)")}
      {hand((m + s / 60) * 6, 34, 2.5, "var(--w-muted)")}
      {seconds && hand(s * 6, 38, 1.2, "var(--accent)")}
      <circle cx="50" cy="50" r="2.5" fill="var(--accent)" />
    </svg>
  );
}

const TIME_PX = { xs: 30, sm: 48, md: 72, lg: 96 };
/** The time's font size: the tier's, held down so the time, the seconds / AM-PM and the date line fit the box. */
export function timePx(size: keyof typeof TIME_PX, w: number, h: number, secs: boolean, h12: boolean, date: boolean): number {
  const dateH = date ? (size === "xs" ? 15 : 28) : 0;
  const byH = h > 0 ? h - dateH : Infinity;
  const byW = w > 0 ? (w - (secs ? 36 : 0) - (h12 ? 34 : 0)) / 3.2 : Infinity;
  return Math.round(Math.max(24, Math.min(TIME_PX[size], byH, byW)));
}

export interface ClockProps extends ShellProps {
  look?: ModuleSettings;
  /** `auto`: the date & time locale's choice (General › Date locale). */
  format?: "24h" | "12h" | "auto";
  showSeconds?: boolean;
  showDate?: boolean;
  face?: "digital" | "analog" | "line" | "figure";
}

export default function Clock(p: ClockProps) {
  const d = p.data;
  const k = (s: string) => num(get(d, `plugins.clock-plugin.clock.${s}`));
  const H = k("24-hour"),
    M = k("minute"),
    S = k("second"),
    day = k("day"),
    mon = k("month"),
    yr = k("year");
  const { locale } = useGeneral();
  const reduced = useReducedMotion();
  const h12 = p.format === "12h" || (p.format === "auto" && localeHour12(locale));
  const hh = h12 ? k("12-hour") : H;
  const pad = (v: number) => String(Number.isFinite(v) ? v : 0).padStart(2, "0");
  const date = new Date(yr, mon - 1, day);
  const secs = p.showSeconds ?? true;
  const tag = useIpTag();
  return (
    <Widget
      {...shell(p)}
      title={p.title}
      showHeader={!!p.title}
      studio={{ label: `${DAYS[date.getDay()]} · ${day} ${MONTHS[mon - 1]}`, value: `${pad(hh)}:${pad(M)}`, unit: h12 ? (k("pm") ? "PM" : "AM") : secs ? pad(S) : "", kind: "value" }}
    >
      {({ size, w, h }) =>
        p.face === "figure" ? (
          <Figure label={p.showDate !== false ? "Date" : "Time"} text={p.showDate !== false ? `${day} ${MONTHS[mon - 1]}` : `${pad(hh)}:${pad(M)}${secs ? `:${pad(S)}` : ""}`} w={w} h={h} />
        ) : p.face === "line" ? (
          <div className="flex h-full items-center justify-end whitespace-nowrap leading-none text-[color:var(--w-muted)]" style={{ fontSize: Math.max(8, Math.min(h * 0.36, w / 9)) }}>
            <Num>
              {pad(hh)}:{pad(M)}
              {secs ? `:${pad(S)}` : ""}
            </Num>
          </div>
        ) : p.face === "analog" ? (
          <div className="flex h-full items-center justify-center gap-5">
            <Analog h={H} m={M} s={S} seconds={secs} />
            {size !== "xs" && size !== "sm" && p.showDate !== false && (
              <div className="flex flex-col">
                <span className="text-sm text-[color:var(--w-muted)]">{DAYS[date.getDay()]}</span>
                <Num className="text-3xl font-semibold">
                  {pad(hh)}:{pad(M)}
                </Num>
                <span className="text-sm text-[color:var(--w-muted)]">
                  {day} {MONTHS[mon - 1]} {yr}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col justify-center">
            <div className="flex items-baseline gap-1.5 leading-none">
              <Num ip={tag("time", { kind: "clock", format: h12 ? "hh:mm" : "HH:mm" })} className="font-semibold tracking-tight" style={{ fontSize: timePx(size, w, h, secs && size !== "xs", h12, p.showDate !== false) }}>
                {pad(hh)}
                <span className="inline-block text-[color:var(--accent)]" style={{ opacity: !reduced && S % 2 === 1 ? 0.3 : 1 }}>:</span>
                {pad(M)}
              </Num>
              {secs && size !== "xs" && <span {...tag("time", { kind: "clock", format: "ss" })} className="font-mono text-lg tabular-nums text-[color:var(--w-faint)]">{pad(S)}</span>}
              {h12 && <span {...tag("time", { kind: "clock", format: "tt" })} className="text-sm font-medium text-[color:var(--w-muted)]">{k("pm") ? "PM" : "AM"}</span>}
            </div>
            {p.showDate !== false && (
              <span {...tag("date", { kind: "clock", format: size === "lg" ? "dddd, d MMM yyyy" : "dddd, d MMM" })} className={`${size === "xs" ? "mt-1 text-[11px]" : "mt-2 text-sm"} text-[color:var(--w-muted)]`}>
                {DAYS[date.getDay()]}, {day} {MONTHS[mon - 1]}
                {size === "lg" ? ` ${yr}` : ""}
              </span>
            )}
          </div>
        )
      }
    </Widget>
  );
}
