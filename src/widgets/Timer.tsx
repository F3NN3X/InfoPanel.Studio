import { useSyncExternalStore } from "react";
import type { ModuleSettings } from "@/modules/types";
import { clockOf, leftOf, timer, type TimerState } from "@/lib/timer";
import { Widget, shell, Num, Bar, Icon, type ShellProps, type WidgetMeta } from "./kit";

export const meta: WidgetMeta = {
  id: "Timer",
  name: "Timer",
  category: "Info",
  icon: "timer",
  prefixes: [],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Countdown, presets and pomodoro",
  tags: "countdown pomodoro stopwatch",
  description: "A countdown with preset buttons and a pomodoro, for screens you can touch. Sends to the Dynamic Island.",
};

export interface TimerProps extends ShellProps {
  look?: ModuleSettings;
  /** The preset buttons, minutes (default 5, 15, 25). */
  presets?: number[];
  /** A pomodoro button (focus and break minutes). */
  pomodoro?: boolean;
  focusMin?: number;
  breakMin?: number;
}

const BTN =
  "flex h-7 min-w-0 shrink-0 items-center justify-center gap-1 rounded-full border border-[color:var(--w-track)] px-2.5 text-[12px] font-semibold tabular-nums hover:bg-[color:var(--w-track)] active:scale-95";
/** A preset button's width with its gap, px (a "25m" chip). */
const CHIP_W = 52;
const ROW_H = 34;

const useTimer = (): TimerState => useSyncExternalStore(timer.subscribe, timer.getState, timer.getState);

/** The preset buttons that fit `w` × `h`: whole rows only, so none is cut off (all before the box is measured). */
export function presetsThatFit(count: number, w: number, h: number): number {
  if (w <= 0 || h <= 0) return count;
  const perRow = Math.max(1, Math.floor((w + 6) / CHIP_W));
  const rows = Math.max(1, Math.floor((h + 6) / ROW_H));
  return Math.min(count, perRow * rows);
}

export default function Timer(p: TimerProps) {
  const t = useTimer();
  const presets = p.presets?.length ? p.presets : [5, 15, 25];
  const focus = p.focusMin ?? 25;
  const brk = p.breakMin ?? 5;
  const left = leftOf(t);
  const pct = t.active && t.durationMs > 0 ? (1 - left / t.durationMs) * 100 : 0;
  const caption = t.paused ? "Paused" : t.pomodoro ? `${t.label} · round ${t.pomodoro.round + 1}` : t.label || "Timer";
  return (
    <Widget {...shell(p)} title={p.title ?? "Timer"} icon="timer" showHeader={p.showHeader}>
      {({ size, w, h }) => {
        if (!t.active) {
          const buttons = [...presets.map((m) => ({ key: `m${m}`, label: `${m}m`, run: () => timer.dispatch({ type: "start", minutes: m, label: `${m} min` }) }))];
          if (p.pomodoro) buttons.push({ key: "pomo", label: "Pomodoro", run: () => timer.dispatch({ type: "pomodoro", focusMin: focus, breakMin: brk }) });
          // The pomodoro chip is about two presets wide.
          const fit = presetsThatFit(buttons.length + (p.pomodoro ? 1 : 0), w, h) - (p.pomodoro ? 1 : 0);
          return (
            <div className="flex h-full flex-wrap content-center items-center justify-center gap-1.5">
              {buttons.slice(0, Math.max(1, fit)).map((b) => (
                <button key={b.key} type="button" className={BTN} onClick={b.run}>
                  {b.label}
                </button>
              ))}
            </div>
          );
        }
        const tiny = size === "xs" || h < 70;
        const px = Math.max(18, Math.min(tiny ? 26 : size === "sm" ? 34 : 56, (w - 8) / 4.2, h - (tiny ? 34 : 64)));
        return (
          <div className="flex h-full min-w-0 flex-col items-center justify-center gap-1.5">
            {!tiny && <span className="max-w-full truncate text-[11px] text-[color:var(--w-muted)]">{caption}</span>}
            <Num className="leading-none" style={{ fontSize: px }}>
              {clockOf(left)}
            </Num>
            {!tiny && (
              <div className="w-full max-w-[220px]">
                <Bar value={pct} className="h-1" />
              </div>
            )}
            <div className="flex gap-1.5">
              <button type="button" aria-label={t.paused ? "Resume" : "Pause"} className={BTN} onClick={() => timer.dispatch({ type: t.paused ? "resume" : "pause" })}>
                <Icon name={t.paused ? "play_arrow" : "pause"} />
              </button>
              <button type="button" aria-label="Stop" className={BTN} onClick={() => timer.dispatch({ type: "stop" })}>
                <Icon name="stop" />
              </button>
            </div>
          </div>
        );
      }}
    </Widget>
  );
}
