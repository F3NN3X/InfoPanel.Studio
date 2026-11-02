// What limits a game's frame rate right now, from the loads, the busiest CPU core, VRAM and the throttle flags.
// Pure: the widget feeds it a reading a second and holds a verdict for a few seconds before it changes (`holdVerdict`).

export type Verdict = "idle" | "balanced" | "gpu" | "cpu" | "vram" | "thermal" | "power";

export interface BottleneckInput {
  /** Percent loads; NaN when the sensor is missing. */
  gpuLoad: number;
  cpuLoad: number;
  /** The busiest core (percent); NaN falls back to the total CPU load. */
  cpuMaxCore: number;
  /** VRAM used and total, in the same unit (MB). */
  vramUsed: number;
  vramTotal: number;
  fps: number;
  gpuTemp: number;
  thermalThrottle: boolean;
  powerThrottle: boolean;
}

export interface BottleneckLimits {
  /** GPU load at which the GPU is the limit (default 93). */
  gpuAt: number;
  /** Busiest core at which the CPU is the limit when the GPU has room (default 85). */
  cpuAt: number;
  /** VRAM fullness, percent (default 95). */
  vramAt: number;
}

export const DEFAULT_BOTTLENECK: BottleneckLimits = { gpuAt: 93, cpuAt: 85, vramAt: 95 };

/** The GPU load under which a CPU at its limit is what holds the frame rate back. */
const GPU_ROOM = 90;
/** A busy GPU with no frame counter still reads as a game. */
const BUSY_GPU = 60;

const known = (v: number): boolean => Number.isFinite(v);

/** Something is rendering: the frame counter reads, or the GPU is busy. */
export const isActive = (i: BottleneckInput): boolean => i.fps > 0 || (known(i.gpuLoad) && i.gpuLoad >= BUSY_GPU);

/** VRAM fullness in percent, NaN without both readings. */
export const vramPct = (i: BottleneckInput): number => (i.vramTotal > 0 && known(i.vramUsed) ? (i.vramUsed / i.vramTotal) * 100 : Number.NaN);

/**
 * The verdict for one reading. Throttling beats everything (the clocks are already down), then a full VRAM,
 * then the GPU, then the CPU while the GPU has room; otherwise balanced. Outside a game: idle when the machine
 * is quiet, else balanced.
 */
export function classify(i: BottleneckInput, lim: BottleneckLimits = DEFAULT_BOTTLENECK): Verdict {
  if (!isActive(i)) return "idle";
  if (i.thermalThrottle) return "thermal";
  if (i.powerThrottle) return "power";
  if (vramPct(i) >= lim.vramAt) return "vram";
  if (known(i.gpuLoad) && i.gpuLoad >= lim.gpuAt) return "gpu";
  const core = known(i.cpuMaxCore) ? i.cpuMaxCore : i.cpuLoad;
  if (known(core) && core >= lim.cpuAt && !(known(i.gpuLoad) && i.gpuLoad >= GPU_ROOM)) return "cpu";
  return "balanced";
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  idle: "Idle",
  balanced: "Balanced",
  gpu: "GPU-bound",
  cpu: "CPU-bound",
  vram: "VRAM full",
  thermal: "Thermal throttling",
  power: "Power limited",
};

const pct = (v: number): string => `${Math.round(v)} %`;

/** The reason in small type for `verdict`, from the live readings ("GPU 98 % · CPU busiest core 61 %"). */
export function reasonFor(verdict: Verdict, i: BottleneckInput): string {
  const core = known(i.cpuMaxCore) ? i.cpuMaxCore : i.cpuLoad;
  const gpu = known(i.gpuLoad) ? `GPU ${pct(i.gpuLoad)}` : "";
  const cpu = known(core) ? `${known(i.cpuMaxCore) ? "CPU busiest core" : "CPU"} ${pct(core)}` : "";
  const fps = i.fps > 0 ? `${Math.round(i.fps)} fps` : "";
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");
  switch (verdict) {
    case "idle":
      return join("No game running", known(i.gpuLoad) ? `GPU ${pct(i.gpuLoad)}` : "");
    case "vram":
      return join(`VRAM ${pct(vramPct(i))}`, `${Math.round(i.vramUsed)} of ${Math.round(i.vramTotal)} MB`);
    case "thermal":
      return join("Thermal limit active", known(i.gpuTemp) ? `GPU ${Math.round(i.gpuTemp)} °C` : "", gpu);
    case "power":
      return join("Power limit active", gpu, cpu);
    default:
      return join(gpu, cpu, fps);
  }
}

/** The verdict being shown, and a different one seen since `since` (ms) that has not held long enough yet. */
export interface HoldState {
  shown: Verdict;
  pending?: Verdict;
  since: number;
}

/**
 * Hysteresis: the next shown verdict. A candidate that differs from the shown one only replaces it after
 * it has been the candidate for `holdMs` without a break; any other reading restarts the clock.
 */
export function holdVerdict(prev: HoldState | undefined, candidate: Verdict, now: number, holdMs: number): HoldState {
  if (!prev) return { shown: candidate, since: now };
  if (candidate === prev.shown) return { shown: prev.shown, since: now };
  if (prev.pending !== candidate) return { shown: prev.shown, pending: candidate, since: now };
  return now - prev.since >= holdMs ? { shown: candidate, since: now } : prev;
}

/** A verdict that was shown from `t` (ms) until the next entry's `t`. */
export interface VerdictAt {
  v: Verdict;
  t: number;
}

/** The most verdict changes the history keeps. */
export const VERDICT_LOG_MAX = 60;

/** `log` with `v` appended when it differs from the last entry; entries that ended before the window and the oldest past the cap go. */
export function logVerdict(log: readonly VerdictAt[], v: Verdict, now: number, windowMs: number): VerdictAt[] {
  const next = log.length && log[log.length - 1].v === v ? [...log] : [...log, { v, t: now }];
  // keep the entry that was showing when the window opened
  while (next.length > 1 && next[1].t <= now - windowMs) next.shift();
  return next.slice(-VERDICT_LOG_MAX);
}

/** The log as runs over the window ending at `now`, `from` / `to` as fractions 0-1 of it; the first entry's run starts where the log does. */
export function verdictRuns(log: readonly VerdictAt[], now: number, windowMs: number): { v: Verdict; from: number; to: number }[] {
  const start = now - windowMs;
  return log.map((e, i) => ({ v: e.v, from: Math.max(0, (e.t - start) / windowMs), to: Math.min(1, ((log[i + 1]?.t ?? now) - start) / windowMs) })).filter((r) => r.to > r.from);
}
