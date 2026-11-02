import { useRef } from "react";
import { Widget, shell, Bar, TickBar, Num, fmt, roomy, TONES, tone, type ShellProps, type Tone } from "./kit";
import { DEFAULT_BOTTLENECK, VERDICT_LABEL, classify, holdVerdict, logVerdict, reasonFor, verdictRuns, vramPct, type BottleneckInput, type HoldState, type Verdict, type VerdictAt } from "./core/bottleneck";
import { useOnData } from "./core/history";
import { fitFontPx } from "./fit-font";
import { roleData, roleValue } from "./role-data";
import { meta } from "./meta/BottleneckLens";

export { meta };

export interface BottleneckLensProps extends ShellProps {
  /** Seconds a verdict must hold before it replaces the one shown; default 5. */
  hold?: number;
  /** GPU load (percent) at which the GPU is the limit; default 93. */
  gpuAt?: number;
  /** Busiest-core load (percent) at which the CPU is the limit; default 85. */
  cpuAt?: number;
  /** VRAM fullness (percent) counted as full; default 95. */
  vramAt?: number;
}

/** The tone each verdict draws in; a GPU at its limit is what a game wants, so it is not a warning. */
const VERDICT_TONE: Record<Verdict, Tone | "muted"> = { idle: "muted", balanced: "ok", gpu: "ok", cpu: "warn", vram: "crit", thermal: "crit", power: "warn" };
/** The verdict strip at 4x4 covers this long. */
const HISTORY_MS = 5 * 60_000;

export default function BottleneckLens(p: BottleneckLensProps) {
  const { roles, thermalThrottle, powerThrottle } = roleData(p.data, p.names);
  const input: BottleneckInput = {
    gpuLoad: roleValue(roles, "gpu.load"),
    cpuLoad: roleValue(roles, "cpu.load"),
    cpuMaxCore: roleValue(roles, "cpu.maxcore"),
    vramUsed: roleValue(roles, "vram.used"),
    vramTotal: roleValue(roles, "vram.total"),
    fps: roleValue(roles, "fps"),
    gpuTemp: roleValue(roles, "gpu.temp"),
    thermalThrottle,
    powerThrottle,
  };
  const limits = { gpuAt: p.gpuAt ?? DEFAULT_BOTTLENECK.gpuAt, cpuAt: p.cpuAt ?? DEFAULT_BOTTLENECK.cpuAt, vramAt: p.vramAt ?? DEFAULT_BOTTLENECK.vramAt };
  const holdMs = (p.hold ?? 5) * 1000;
  // Judged once per sensor update (not per render), and a change of verdict waits out `hold`.
  const held = useRef<HoldState | undefined>(undefined);
  const log = useRef<VerdictAt[]>([]);
  useOnData(p.data, (now) => {
    held.current = holdVerdict(held.current, classify(input, limits), now, holdMs);
    log.current = logVerdict(log.current, held.current.shown, now, HISTORY_MS);
  });
  const verdict = held.current?.shown ?? classify(input, limits);
  const label = VERDICT_LABEL[verdict];
  const reason = reasonFor(verdict, input);
  const t = VERDICT_TONE[verdict];
  const color = TONES[t];
  const idle = verdict === "idle";
  // A GPU at its limit is the goal in a game, so its bar stays calm; the CPU and VRAM bars warn at their limits.
  const meters = [
    { n: "GPU", v: input.gpuLoad, t: "ok" as Tone, at: limits.gpuAt },
    { n: "CPU core", v: Number.isFinite(input.cpuMaxCore) ? input.cpuMaxCore : input.cpuLoad, t: tone(Number.isFinite(input.cpuMaxCore) ? input.cpuMaxCore : input.cpuLoad, limits.cpuAt), at: limits.cpuAt },
    { n: "VRAM", v: vramPct(input), t: tone(vramPct(input), undefined, limits.vramAt), at: limits.vramAt },
  ].filter((m) => Number.isFinite(m.v));
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Bottleneck"}
      icon="speed"
      compact={(box) => (box.shape === "tile" || box.shape === "column" ? { label: "Bottleneck", value: label, sub: reason, t: t === "muted" ? undefined : t, kind: "text", idle: idle ? "No game running" : undefined } : undefined)}
      studio={{ label: "Bottleneck", live: !idle, value: label, sub: reason, t: t === "muted" ? undefined : t }}
    >
      {({ w, h }) => {
        const strip = h < 90;
        // At 4x4 the verdict grows, the bars carry their limits, and a strip of the last minutes and a stat row fill the card.
        const room = roomy(w, h);
        const size = fitFontPx(w, label.length, 14, strip ? 26 : Math.min(room ? 60 : 48, h * 0.34), 0.58);
        const bars = !strip && h >= 120 && meters.length > 0;
        const now = Date.now();
        const stats = [
          Number.isFinite(input.fps) && input.fps > 0 ? `${fmt(input.fps, 0)} fps` : null,
          Number.isFinite(input.gpuTemp) ? `${fmt(input.gpuTemp, 0)} °C GPU` : null,
          !idle ? (thermalThrottle ? "Thermal throttle" : powerThrottle ? "Power throttle" : "No throttle") : null,
        ].filter((x): x is string => !!x);
        return (
          <div className={`flex h-full min-w-0 flex-col gap-1.5 ${room ? "justify-start" : "justify-center"}`}>
            <div className={`flex min-w-0 ${strip && w > 380 ? "items-baseline gap-4" : "flex-col gap-1"}`}>
              <b className="whitespace-nowrap font-semibold leading-none" style={{ fontSize: size, color: idle ? "var(--w-muted)" : color }}>
                {label}
              </b>
              <span className={`min-w-0 text-[color:var(--w-muted)] ${strip ? "truncate" : "line-clamp-2"} ${h > 160 ? "text-[13px]" : "text-[11.5px]"}`}>{reason}</span>
            </div>
            {bars && room && (
              <div className="mt-3 flex flex-col gap-3">
                {meters.map((m) => (
                  <div key={m.n} className="grid grid-cols-[4.5rem_3rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-xs">
                    <span className="truncate text-[color:var(--w-muted)]">{m.n}</span>
                    <Num weight={600} className="text-right text-sm">{fmt(m.v, 0)} %</Num>
                    <TickBar value={m.v} max={100} t={idle ? "ok" : m.t} ticks={[m.at]} className="h-1.5" />
                    <span className="truncate text-right text-micro text-[color:var(--w-faint)]">limit {fmt(m.at, 0)}</span>
                  </div>
                ))}
              </div>
            )}
            {bars && !room && (
              <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${w > 300 ? meters.length : 1}, minmax(0,1fr))` }}>
                {meters.slice(0, w > 300 ? 3 : 1).map((m) => (
                  <div key={m.n} className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-micro font-medium uppercase tracking-[0.06em] text-[color:var(--w-faint)]">{m.n}</span>
                    <Bar value={m.v} max={100} t={idle ? "ok" : m.t} className="h-1.5" />
                  </div>
                ))}
              </div>
            )}
            {room && log.current.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                <span className="text-micro font-medium uppercase tracking-[0.06em] text-[color:var(--w-faint)]">Verdict, last 5 min</span>
                <svg viewBox="0 0 1000 1" preserveAspectRatio="none" shapeRendering="crispEdges" className="h-3 w-full rounded-[3px] bg-[color:var(--w-track)]" role="img" aria-label={`Verdict over the last 5 minutes, now ${label}`}>
                  {verdictRuns(log.current, now, HISTORY_MS).map((r) => (
                    <rect key={r.from} x={r.from * 1000} y={0} width={(r.to - r.from) * 1000} height={1} fill={TONES[VERDICT_TONE[r.v]]} opacity={r.v === "idle" ? 0.4 : 1} />
                  ))}
                </svg>
              </div>
            )}
            {room && stats.length > 0 && (
              <div className="mt-auto flex justify-between gap-3 border-t border-[color:var(--w-track)] pt-3 text-xs text-[color:var(--w-muted)]">
                {stats.map((x) => (
                  <span key={x} className="truncate">{x}</span>
                ))}
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
