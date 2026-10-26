// What the Status Bar's drawn items (rings, double rings, FPS, text lines) read from the data. Hardware is found by role
// (the CPU and GPU the Data API lists), so they work on any machine; one with no data is null and the bar leaves it out.
import { inUnit } from "@/modules/setting-readers";
import { fmt, get, hw, num, type Data } from "../kit";
import type { Card, CardRow } from "./card-model";

export const CARD_ITEMS = ["cpuRing", "gpuRing", "cpuDual", "gpuDual", "fps", "cpuLine", "gpuLine", "fpsLine"] as const;
export type CardKey = (typeof CARD_ITEMS)[number];

const RTSS = "plugins.InfoPanel.RTSS.rtss.";
const PRESENTMON = "plugins.fps-plugin.fps.";

const L = (d: Data, k: string) => num(get(d, `libre.${k}`));
const known = (v: number) => (Number.isFinite(v) ? v : undefined);
const cap = (v: number, max: number) => Math.min(100, Math.max(0, (v / max) * 100));
const watts = (v: number) => (Number.isFinite(v) ? `${fmt(v, 0)} W` : undefined);

/** The frame rate and the 1% low from RTSS, else PresentMon; `seen` is whether either plugin is in the data at all. */
export function fpsOf(d: Data): { fps: number; low: number; seen: boolean } {
  const live = (...ids: string[]) => ids.flatMap((id) => [num(get(d, RTSS + id)), num(get(d, PRESENTMON + id))]).find((v) => Number.isFinite(v) && v !== 0) ?? NaN;
  const seen = ["fps", "1% low fps"].some((id) => [RTSS, PRESENTMON].some((p) => Number.isFinite(num(get(d, p + id)))));
  return { fps: live("fps"), low: live("1% low fps", "1% low"), seen };
}

/** A °C reading in the unit, "23°C" (no unit letter on a card: "23°"). */
const degrees = (c: number, unit: "c" | "f") => (Number.isFinite(c) ? `${fmt(inUnit(c, unit), 0)}°` : undefined);

interface Side {
  load: number;
  loadKey: string;
  temp: number;
  power: number;
  rows: CardRow[];
}

function cpuSide(d: Data): Side | null {
  const { cpu } = hw(d);
  if (!cpu) return null;
  const load = L(d, `${cpu}_cpu_total`);
  if (!Number.isFinite(load)) return null;
  const temp = known(L(d, `${cpu}_core__tctl_tdie`)) ?? L(d, `${cpu}_cpu_core_max`);
  const power = L(d, `${cpu}_package`);
  const clock = L(d, `${cpu}_cores__average`);
  const ram = L(d, "total_memory_memory");
  return {
    load,
    loadKey: `libre.${cpu}_cpu_total`,
    temp,
    power,
    rows: [
      ...(Number.isFinite(power) ? [{ label: "Power", text: watts(power)!, pct: cap(power, 250) }] : []),
      ...(Number.isFinite(clock) ? [{ label: "Clock", text: `${fmt(clock / 1000, 1)} GHz`, pct: cap(clock, 6000) }] : []),
      ...(Number.isFinite(ram) ? [{ label: "RAM", text: `${fmt(ram, 0)}%`, pct: cap(ram, 100) }] : []),
    ],
  };
}

function gpuSide(d: Data): Side | null {
  const { gpu } = hw(d);
  if (!gpu) return null;
  const load = L(d, `${gpu}_gpu_core_load`);
  if (!Number.isFinite(load)) return null;
  const power = L(d, `${gpu}_gpu_package`);
  const clock = L(d, `${gpu}_gpu_core_clock`);
  const used = L(d, `${gpu}_gpu_memory_used`);
  const total = L(d, `${gpu}_gpu_memory_total`);
  return {
    load,
    loadKey: `libre.${gpu}_gpu_core_load`,
    temp: L(d, `${gpu}_gpu_core`),
    power,
    rows: [
      ...(Number.isFinite(power) ? [{ label: "Power", text: watts(power)!, pct: cap(power, 600) }] : []),
      ...(Number.isFinite(clock) ? [{ label: "Clock", text: `${fmt(clock / 1000, 1)} GHz`, pct: cap(clock, 3200) }] : []),
      ...(Number.isFinite(used) && total > 0 ? [{ label: "VRAM", text: `${fmt(used / 1024, 1)} GB`, pct: cap(used, total) }] : []),
    ],
  };
}

/** The drawn item's card, or null while its data is absent. */
export function cardReading(key: CardKey, d: Data, unit: "c" | "f"): Card | null {
  const cpu = key.startsWith("cpu");
  const gpu = key.startsWith("gpu");
  if (cpu || gpu) {
    const s = cpu ? cpuSide(d) : gpuSide(d);
    if (!s) return null;
    const label = cpu ? "CPU" : "GPU";
    const accent: 1 | 2 = cpu ? 1 : 2;
    const temp = degrees(s.temp, unit);
    if (key.endsWith("Ring")) return { kind: "ring", label, accent, load: s.load, loadKey: s.loadKey, temp, power: watts(s.power) };
    if (key.endsWith("Dual")) return Number.isFinite(s.temp) ? { kind: "dual", label, accent, load: s.load, loadKey: s.loadKey, heat: s.temp, temp: temp!, rows: s.rows } : null;
    return { kind: "line", label, accent, values: [`${fmt(s.load, 0)}%`, ...(temp ? [temp] : [])] };
  }
  const { fps, low, seen } = fpsOf(d);
  if (key === "fps") return seen ? { kind: "stat", label: "FPS", accent: 3, value: Number.isFinite(fps) ? fmt(fps, 0) : "–", idle: !Number.isFinite(fps), ...(Number.isFinite(low) ? { low: fmt(low, 0) } : {}) } : null;
  // fpsLine: gone while no game runs
  return Number.isFinite(fps) ? { kind: "line", label: "FPS", accent: 3, values: [fmt(fps, 0), ...(Number.isFinite(low) ? [`1% ${fmt(low, 0)}`] : [])] } : null;
}
