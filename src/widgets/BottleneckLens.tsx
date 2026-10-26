import { useRef } from "react";
import { Widget, shell, Bar, TONES, tone, type ShellProps, type Tone } from "./kit";
import { DEFAULT_BOTTLENECK, VERDICT_LABEL, classify, holdVerdict, reasonFor, vramPct, type BottleneckInput, type HoldState, type Verdict } from "./core/bottleneck";
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
  useOnData(p.data, (now) => {
    held.current = holdVerdict(held.current, classify(input, limits), now, holdMs);
  });
  const verdict = held.current?.shown ?? classify(input, limits);
  const label = VERDICT_LABEL[verdict];
  const reason = reasonFor(verdict, input);
  const t = VERDICT_TONE[verdict];
  const color = TONES[t];
  const idle = verdict === "idle";
  // A GPU at its limit is the goal in a game, so its bar stays calm; the CPU and VRAM bars warn at their limits.
  const meters = [
    { n: "GPU", v: input.gpuLoad, t: "ok" as Tone },
    { n: "CPU core", v: Number.isFinite(input.cpuMaxCore) ? input.cpuMaxCore : input.cpuLoad, t: tone(Number.isFinite(input.cpuMaxCore) ? input.cpuMaxCore : input.cpuLoad, limits.cpuAt) },
    { n: "VRAM", v: vramPct(input), t: tone(vramPct(input), undefined, limits.vramAt) },
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
        const size = fitFontPx(w, label.length, 14, strip ? 26 : Math.min(48, h * 0.34), 0.58);
        const bars = !strip && h >= 120 && meters.length > 0;
        return (
          <div className="flex h-full min-w-0 flex-col justify-center gap-1.5">
            <div className={`flex min-w-0 ${strip && w > 380 ? "items-baseline gap-4" : "flex-col gap-1"}`}>
              <b className="whitespace-nowrap font-semibold leading-none" style={{ fontSize: size, color: idle ? "var(--w-muted)" : color }}>
                {label}
              </b>
              <span className={`min-w-0 text-[color:var(--w-muted)] ${strip ? "truncate" : "line-clamp-2"} ${h > 160 ? "text-[13px]" : "text-[11.5px]"}`}>{reason}</span>
            </div>
            {bars && (
              <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${w > 300 ? meters.length : 1}, minmax(0,1fr))` }}>
                {meters.slice(0, w > 300 ? 3 : 1).map((m) => (
                  <div key={m.n} className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-[10.5px] font-medium uppercase tracking-[0.06em] text-[color:var(--w-faint)]">{m.n}</span>
                    <Bar value={m.v} max={100} t={idle ? "ok" : m.t} className="h-1.5" />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
