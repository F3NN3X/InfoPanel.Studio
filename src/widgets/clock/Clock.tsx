import { useGeneral } from "@/hooks/use-general";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { localeHour12 } from "@/lib/general";
import type { ModuleSettings } from "@/modules/types";
import { Figure } from "../SensorValue";
import { Widget, shell, roomy, Num, useIpTag, type ShellProps } from "../kit";
import { useNow } from "../time-hooks";
import { meta } from "./meta";

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
      {seconds && hand(s * 6, 38, 1.2, "var(--w-accent)")}
      <circle cx="50" cy="50" r="2.5" fill="var(--w-accent)" />
    </svg>
  );
}

/** The time's largest size per tier; at `lg` it grows with the box (`LG_SHARE` of its height). */
const TIME_PX = { xs: 30, sm: 48, md: 72, lg: 96 };
const LG_SHARE = 0.62;
/** The seconds, the AM/PM and the date line, in em of the time; the date never under these px. */
export const SECS_EM = 0.25;
export const AMPM_EM = 0.2;
export const DATE_EM = 0.17;
const DATE_MIN = { xs: 11, sm: 13, md: 13, lg: 13 };

/** The date line's font size for a time of `px`. */
export const datePx = (size: keyof typeof TIME_PX, px: number): number => Math.max(DATE_MIN[size], Math.round(px * DATE_EM));

/** The time's font size: the tier's (growing with the box at `lg`), held down so the time, the seconds / AM-PM and the date line fit the box. */
export function timePx(size: keyof typeof TIME_PX, w: number, h: number, secs: boolean, h12: boolean, date: boolean): number {
  // the date line: its text at DATE_EM of the time (or its floor) and a 0.08em gap above it
  const byH = h > 0 ? (date ? Math.min((h - DATE_MIN[size] * 1.3) / 1.08, h / (1.08 + DATE_EM * 1.3)) : h) : Infinity;
  // the time is about 3.2em wide, the seconds and the AM/PM beside it in their own em
  const byW = w > 0 ? w / (3.2 + (secs ? SECS_EM * 1.6 + 0.06 : 0) + (h12 ? AMPM_EM * 1.6 + 0.06 : 0)) : Infinity;
  const cap = size === "lg" ? Math.max(TIME_PX.lg, byH * LG_SHARE) : TIME_PX[size];
  return Math.round(Math.max(24, Math.min(cap, byH, byW)));
}

/** The roomy (4x4) box: the seconds are 0.35em in the muted colour. */
export const ROOMY_SECS_EM = 0.35;

/** The time's font size in a roomy box: as wide as the box allows with the seconds and the AM/PM beside it, held under the height. */
export function roomyTimePx(w: number, h: number, secs: boolean, h12: boolean, date: boolean): number {
  const byW = w / (3.2 + (secs ? ROOMY_SECS_EM * 1.6 + 0.06 : 0) + (h12 ? AMPM_EM * 1.6 + 0.06 : 0));
  const byH = date ? h / (1.08 + DATE_EM * 1.3) : h;
  return Math.round(Math.max(24, Math.min(byW, byH * 0.62)));
}

/**
 * The time's parts from the device's own clock. The plugin's readings are a sensor snapshot: a frozen preview, a fixture or a
 * stale feed shows its capture date, and the clock plugin only mirrors this machine's time.
 */
export function clockParts(now: Date) {
  const h = now.getHours();
  return { H: h, h12h: h % 12 || 12, M: now.getMinutes(), S: now.getSeconds(), day: now.getDate(), mon: now.getMonth() + 1, yr: now.getFullYear(), pm: h >= 12 };
}

export interface ClockProps extends ShellProps {
  look?: ModuleSettings;
  /** `auto`: the date & time locale's choice (General › Date locale). */
  format?: "24h" | "12h" | "auto";
  showSeconds?: boolean;
  showDate?: boolean;
  face?: "digital" | "analog" | "line" | "figure" | "stacked";
}

/**
 * The stacked face's time, px, for the widget's whole box (a rail slot is too small for the card's padding): as wide as the
 * box allows for HH:MM, held under the height; its short date at 0.6 of it, never under 11 px.
 */
export function stackedPx(w: number, h: number, date: boolean): { time: number; date: number } {
  const time = Math.round(Math.max(14, Math.min(w / 3.6, date ? h / 2.2 : h * 0.8)));
  return { time, date: Math.max(11, Math.round(time * 0.6)) };
}

export default function Clock(p: ClockProps) {
  const { H, h12h, M, S, day, mon, yr, pm } = clockParts(new Date(useNow(1000)));
  const { locale } = useGeneral();
  const reduced = useReducedMotion();
  const h12 = p.format === "12h" || (p.format === "auto" && localeHour12(locale));
  const hh = h12 ? h12h : H;
  const pad = (v: number) => String(Number.isFinite(v) ? v : 0).padStart(2, "0");
  const date = new Date(yr, mon - 1, day);
  const secs = p.showSeconds ?? true;
  const tag = useIpTag();
  return (
    <Widget
      {...shell(p)}
      title={p.title}
      showHeader={!!p.title}
      studio={{ label: `${DAYS[date.getDay()]} · ${day} ${MONTHS[mon - 1]}`, value: `${pad(hh)}:${pad(M)}`, unit: h12 ? (pm ? "PM" : "AM") : secs ? pad(S) : "", kind: "value" }}
    >
      {({ size, w, h, outerW, outerH }) => {
        const big = roomy(outerW, outerH);
        const px = big ? roomyTimePx(w, h, secs, h12, p.showDate !== false) : timePx(size, w, h, secs && size !== "xs", h12, p.showDate !== false);
        if (p.face === "stacked") {
          const sp = stackedPx(outerW, outerH, p.showDate !== false);
          return (
            <div className="flex h-full flex-col items-center justify-center whitespace-nowrap leading-tight">
              <Num ip={tag("time", { kind: "clock", format: h12 ? "hh:mm" : "HH:mm" })} className="font-semibold" style={{ fontSize: sp.time }}>
                {pad(hh)}:{pad(M)}
              </Num>
              {p.showDate !== false && (
                <span {...tag("date", { kind: "clock", format: "ddd d" })} className="text-[color:var(--w-muted)]" style={{ fontSize: sp.date }}>
                  {DAYS[date.getDay()].slice(0, 3)} {day}
                </span>
              )}
            </div>
          );
        }
        return p.face === "figure" ? (
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
              <div className={`flex h-full flex-col justify-center ${big ? "items-center" : ""}`}>
                <div className="flex items-baseline gap-[0.06em] leading-none" style={{ fontSize: px }}>
                  <Num ip={tag("time", { kind: "clock", format: h12 ? "hh:mm" : "HH:mm" })} className="font-semibold tracking-tight">
                    {pad(hh)}
                    <span className="inline-block text-[color:var(--w-accent)]" style={{ opacity: !reduced && S % 2 === 1 ? 0.3 : 1 }}>:</span>
                    {pad(M)}
                  </Num>
                  {secs && size !== "xs" && <span {...tag("time", { kind: "clock", format: "ss" })} className={`font-mono tabular-nums ${big ? "text-[color:var(--w-muted)]" : "text-[color:var(--w-faint)]"}`} style={{ fontSize: `max(18px, ${big ? ROOMY_SECS_EM : SECS_EM}em)` }}>{pad(S)}</span>}
                  {h12 && <span {...tag("time", { kind: "clock", format: "tt" })} className="font-medium text-[color:var(--w-muted)]" style={{ fontSize: `max(14px, ${AMPM_EM}em)` }}>{pm ? "PM" : "AM"}</span>}
                </div>
                {p.showDate !== false && (
                  <span {...tag("date", { kind: "clock", format: size === "lg" ? "dddd, d MMM yyyy" : "dddd, d MMM" })} className="text-[color:var(--w-muted)]" style={{ fontSize: big ? Math.max(14, Math.min(Math.round(w * 0.05), Math.round(px * 0.2))) : datePx(size, px), marginTop: Math.round(px * 0.08) }}>
                    {DAYS[date.getDay()]}, {day} {MONTHS[mon - 1]}
                    {size === "lg" ? ` ${yr}` : ""}
                  </span>
                )}
              </div>
        );
      }}
    </Widget>
  );
}
