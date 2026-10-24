/**
 * The Cores element's sensors: one load sensor per CPU core or thread, found in the live Data API
 * by its native ref. LibreHardwareMonitor names them "/<cpu>/<n>/load/<i>" with a sensor name
 * ending "Core #1" (AMD), "CPU Core #1" or "CPU Core #1 Thread #2" (Intel); the total and the
 * "Core Max" load are left out.
 */
import type { ChosenSensor } from "../editor/bind.ts";
import type { DataApiValue } from "../sensors.ts";

export interface CoreSensor extends ChosenSensor {
  ref: string;
  core: number;
  /** 0 when the CPU reports cores, not threads. */
  thread: number;
}

const REF = /^libre:(\/[a-z]*cpu\/\d+)\/load\/\d+$/i;
const NAME = /\bCore #(\d+)(?:\s+Thread #(\d+))?$/i;

/** The first CPU's per-core (or per-thread) load sensors, in core then thread order; empty when none are found. */
export function detectCores(sensors: Readonly<Record<string, DataApiValue>>): CoreSensor[] {
  const byCpu = new Map<string, CoreSensor[]>();
  for (const [key, v] of Object.entries(sensors)) {
    const cpu = v.ref ? REF.exec(v.ref)?.[1] : undefined;
    const m = cpu && v.name ? NAME.exec(v.name.trim()) : null;
    if (!cpu || !m || !v.ref) continue;
    const list = byCpu.get(cpu) ?? [];
    list.push({ key, name: v.name ?? key, unit: v.unit, ref: v.ref, core: Number(m[1]), thread: m[2] ? Number(m[2]) : 0 });
    byCpu.set(cpu, list);
  }
  const first = [...byCpu.keys()].sort()[0];
  return first ? byCpu.get(first)!.sort((a, b) => a.core - b.core || a.thread - b.thread) : [];
}
