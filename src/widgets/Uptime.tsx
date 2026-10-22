import { Fragment } from "react";
import type { ModuleSettings } from "@/modules/types";
import { bodyGap, Widget, shell, get, num, Num, type ShellProps, type WidgetMeta } from "./kit";

export const meta: WidgetMeta = {
  id: "Uptime",
  name: "Uptime",
  category: "System",
  icon: "timer",
  prefixes: ["plugins.system-info-plugin.uptime."],
  defaultSize: [2, 1],
  minSize: [1, 1],
  blurb: "Time since boot",
  tags: "boot time",
  description: "Time since boot as days / hours / minutes / seconds.",
};

export interface UptimeProps extends ShellProps {
  look?: ModuleSettings;
  showSeconds?: boolean;
}

/** The numerals' size: the tier's (72 / 48 / 30px), shrunk so `n` two-digit groups, their colons and gaps fit the width, and the unit line fits under them. */
export const numPx = (size: string, w: number, h: number, n: number, gap: number): number => {
  const tier = size === "lg" ? 72 : size === "md" ? 48 : 30;
  if (!w || !h) return tier;
  const perGroup = (w - (n - 1) * (12 + gap)) / n;
  return Math.max(14, Math.floor(Math.min(tier, perGroup / 1.4, h - 24)));
};

export default function Uptime(p: UptimeProps) {
  const d = p.data;
  const k = (s: string) => num(get(d, `plugins.system-info-plugin.uptime.${s}`));
  const parts: [string, number, string][] = [
    ["d", k("days"), "days"],
    ["h", k("hours"), "hours"],
    ["m", k("minutes"), "min"],
    ["s", k("seconds"), "sec"],
  ];
  const shown = parts.filter((_, i) => i < 3 || p.showSeconds !== false);
  const pad = (v: number) => String(Number.isFinite(v) ? v : 0).padStart(2, "0");
  return (
    <Widget {...shell(p)} title={p.title ?? "Uptime"} icon="timer" compact={{ label: "Uptime", value: `${k("days")}d ${k("hours")}h`, sub: `${pad(k("minutes"))}m ${pad(k("seconds"))}s`, kind: "value" }}>
      {({ size, w, h }) =>
        size === "xs" ? (
          <div className="flex h-full flex-col justify-center">
            <span className="text-[11px] text-[color:var(--w-muted)]">Uptime</span>
            <Num className="text-2xl font-semibold">
              {k("days")}d {k("hours")}h {pad(k("minutes"))}m
            </Num>
          </div>
        ) : (
          // the look's gap is the space between two numbers, split around the colon
          <div className="flex h-full items-center justify-between gap-2" style={{ columnGap: bodyGap(p.look, 16, w) / 2 }}>
            {shown.map(([u, v, l], i) => (
              <Fragment key={u}>
                {i > 0 && <span className="pb-4 text-2xl font-light text-[color:var(--w-faint)]">:</span>}
                <div className="flex min-w-0 flex-1 flex-col items-center">
                  <Num className="font-semibold leading-none tracking-tight" style={{ fontSize: numPx(size, w, h, shown.length, bodyGap(p.look, 16, w)), ...(u === "d" ? { color: "var(--accent)" } : null) }}>
                    {pad(v)}
                  </Num>
                  <span className="mt-1.5 text-[10.5px] uppercase tracking-wider text-[color:var(--w-faint)]">{l}</span>
                </div>
              </Fragment>
            ))}
          </div>
        )
      }
    </Widget>
  );
}
