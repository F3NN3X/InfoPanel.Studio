import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { addSample, chartPoints, chartRange, TRAIL_MS, type Sample } from "./alerts-chart-model";

/** The trails read so far this session, by sensor: going back to a rule keeps what was already drawn. */
const trails = new Map<string, Sample[]>();

/** The last five minutes of a sensor, one sample a second while this is mounted. */
function useTrail(key: string, value: number | undefined) {
  const [samples, setSamples] = useState<readonly Sample[]>(() => trails.get(key) ?? []);
  const reading = useRef(value);
  reading.current = value;
  useEffect(() => {
    setSamples(trails.get(key) ?? []);
    const sample = () => {
      const next = addSample(trails.get(key) ?? [], reading.current, Date.now());
      trails.set(key, next);
      setSamples(next);
    };
    sample();
    const t = setInterval(sample, 1000);
    return () => clearInterval(t);
  }, [key]);
  return samples;
}

const W = 510;
const H = 120;

interface AlertChartProps {
  sensorKey: string;
  name: string;
  unit?: string;
  value: number | undefined;
  /** The threshold line, for a numeric condition. */
  limit?: number;
  /** The clear line (hysteresis). */
  clear?: number;
  /** The condition holds above the limit (`>`, `>=`), else below it. */
  above: boolean;
}

/**
 * The When card's chart: the sensor over the last five minutes with the threshold and the clear line. It starts empty and
 * fills while the rule is open (the server keeps no sensor history).
 */
export function AlertChart({ sensorKey, name, unit, value, limit, clear, above }: AlertChartProps) {
  const samples = useTrail(sensorKey, value);
  const clipId = useId();
  const now = samples.at(-1)?.at ?? 0;
  const lines = [limit, clear].filter((n): n is number => n !== undefined);
  const [low, high] = chartRange(samples, lines);
  const y = (v: number) => H - ((v - low) / (high - low || 1)) * H;
  const points = chartPoints(samples, now, W, H, low, high);
  const reads = samples.map((s) => s.value);
  const suffix = unit ? ` ${unit}` : "";
  const label = reads.length === 0
    ? `${name}, last 5 min, no readings yet`
    : `${name}, last 5 min, ${Math.min(...reads).toFixed(1)} to ${Math.max(...reads).toFixed(1)}${suffix}`;
  const firing = limit === undefined ? null : above ? { y: 0, height: Math.max(0, y(limit)) } : { y: y(limit), height: Math.max(0, H - y(limit)) };
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-30 w-full overflow-visible">
          {firing && (
            <defs>
              <clipPath id={clipId}>
                <rect x={0} y={firing.y} width={W} height={firing.height} />
              </clipPath>
            </defs>
          )}
          {limit !== undefined && clear !== undefined && (
            <rect x={0} width={W} y={Math.min(y(limit), y(clear))} height={Math.abs(y(limit) - y(clear))} className="fill-ui-danger/6" />
          )}
          {lines.map((line) => (
            <line key={line} x1={0} x2={W} y1={y(line)} y2={y(line)} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" className="stroke-ui-3" />
          ))}
          <polyline points={points} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="stroke-ui-accent" />
          {firing && <polyline points={points} fill="none" clipPath={`url(#${clipId})`} strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="stroke-ui-danger" />}
        </svg>
        {limit !== undefined && (
          <span aria-hidden className="absolute right-0 -translate-y-full pb-0.5 font-ui-mono text-micro text-ui-danger" style={{ top: `${(y(limit) / H) * 100}%` }}>
            {limit}{suffix}
          </span>
        )}
        {clear !== undefined && (
          <span aria-hidden className={cn("absolute right-0 font-ui-mono text-micro text-ui-3", above ? "pt-0.5" : "-translate-y-full pb-0.5")} style={{ top: `${(y(clear) / H) * 100}%` }}>
            clears {clear}
          </span>
        )}
        {samples.length < 2 && <span className="absolute inset-0 grid place-items-center text-caption text-ui-3">Fills in while this rule is open</span>}
      </div>
      <div className="flex justify-between text-micro text-ui-3" aria-hidden>
        <span>{TRAIL_MS / 60_000} min ago</span>
        <span>now</span>
      </div>
    </div>
  );
}
