// Live L/R meters for WaveLink: frames come from the shared Wave Link client's per-key emitters.
import { useEffect, useState } from "react";
import { createBallistics, resolveBallistics, type BallisticsPreset } from "@/lib/audio/ballistics";
import { dbToGain, gainToDb } from "@/lib/audio/decibels";
import type { MeterFrame } from "@/lib/audio/types";
import { useWavelinkMeter } from "@/lib/wavelink";
import { LedLadder, HoldMark, scaleX, scaleY, STATE, clamp, fmt, stepPct, type Smoothed } from "../kit";

export interface Levels {
  l: Smoothed;
  r: Smoothed;
}
export type MeterVariant = "solid" | "segmented" | "gradient";

const SILENT: Levels = { l: { v: 0 }, r: { v: 0 } };
const pctOf = (f: MeterFrame | undefined, ch: number): number => dbToGain(f?.channels[ch]?.peakDb ?? Number.NEGATIVE_INFINITY) * 100;

/** Position on the −60…0 dB scale, 0..100. */
export const dbPos = (pct: number): number => clamp(((gainToDb(pct / 100) + 60) / 60) * 100);
export const fmtDb = (pct: number): string => {
  const db = gainToDb(pct / 100);
  return Number.isFinite(db) ? fmt(Math.max(-60, db), db > -10 ? 1 : 0) : "-∞";
};

/** The smoothed L/R levels of one meter key (`meterKey.channel(id)` / `.device(id)`), in % of full scale. */
export function useWlLevels(key: string, preset: BallisticsPreset): Levels {
  const source = useWavelinkMeter(key);
  const [levels, setLevels] = useState<Levels>(SILENT);
  useEffect(() => {
    const left = createBallistics(preset),
      right = createBallistics(preset);
    const holds = resolveBallistics(preset).peakHoldMs > 0;
    const feed = (f: MeterFrame | undefined) => {
      const now = performance.now();
      setLevels({ l: stepPct(left, pctOf(f, 0), now, holds), r: stepPct(right, pctOf(f, 1), now, holds) });
    };
    feed(source.latest);
    return source.subscribe(feed);
  }, [source, preset]);
  return levels;
}

interface LevelProps {
  /** position 0..100 */
  value: number;
  hold?: number;
  vertical?: boolean;
  variant: MeterVariant;
  n: number;
  color: string;
  hot: string;
}
const ZONES: [number, number] = [70, 90];

function Level({ value, hold, vertical, variant, n, color, hot }: LevelProps) {
  if (variant === "segmented") return <LedLadder value={value} n={n} vertical={vertical} zones={ZONES} hold={hold} color={color} hotColor={hot} />;
  const dir = vertical ? "0deg" : "90deg";
  const fill =
    variant === "gradient"
      ? { background: `linear-gradient(${dir}, ${color} 0%, ${color} ${ZONES[0]}%, ${STATE.warn} ${ZONES[0]}%, ${STATE.warn} ${ZONES[1]}%, ${hot} ${ZONES[1]}%)`, backgroundSize: vertical ? `100% ${(100 / Math.max(1, value)) * 100}%` : `${(100 / Math.max(1, value)) * 100}% 100%`, backgroundPosition: vertical ? "bottom" : "left" }
      : { background: value > ZONES[1] ? hot : color };
  return (
    <div className="relative min-h-0 min-w-0 flex-1 rounded-[2px] bg-[color:var(--w-track)]">
      <div className="absolute inset-0 overflow-hidden rounded-[2px] transition-transform duration-100" style={{ ...(vertical ? scaleY(value) : scaleX(value)), ...fill }} />
      {hold !== undefined && hold > 0 && <HoldMark at={hold} vertical={vertical} />}
    </div>
  );
}

export interface MeterPairProps {
  levels: Levels;
  vertical?: boolean;
  variant: MeterVariant;
  color: string;
  hot: string;
  /** Cross-axis thickness of one bar in px (horizontal pairs stack, vertical ones stand side by side). */
  thickness?: number;
  className?: string;
}
/** Two bars, L and R: side by side when vertical, stacked when horizontal. */
export function MeterPair({ levels, vertical, variant, color, hot, thickness = 7, className = "" }: MeterPairProps) {
  const bar = (s: Smoothed) => <Level value={dbPos(s.v)} hold={s.hold !== undefined ? dbPos(s.hold) : undefined} vertical={vertical} variant={variant} n={vertical ? 24 : 28} color={color} hot={hot} />;
  return vertical ? (
    <div className={`flex min-h-0 flex-1 justify-center gap-[5px] ${className}`}>
      {[levels.l, levels.r].map((s, i) => (
        <div key={i} className="flex" style={{ width: thickness }}>
          {bar(s)}
        </div>
      ))}
    </div>
  ) : (
    <div className={`flex min-w-0 flex-col gap-[3px] ${className}`}>
      {[levels.l, levels.r].map((s, i) => (
        <div key={i} className="flex" style={{ height: thickness }}>
          {bar(s)}
        </div>
      ))}
    </div>
  );
}
