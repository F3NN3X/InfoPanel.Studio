import { useRef } from "react";
import type { ModuleSettings } from "@/modules/types";
import { bodyGap, useFitRows, Widget, shell, get, num, fmt, STATE, hw, Chip, Pill, type ShellProps } from "./kit";
import { meta } from "./meta/StatusTracker";

export { meta };

type St = "ok" | "warn" | "crit" | "none";
interface Cell {
  st: St;
  v: string;
}
export interface Track {
  label: string;
  key?: string;
  kind: "threshold" | "status";
  warn?: number;
  crit?: number;
  up?: string;
}

export interface StatusTrackerProps extends ShellProps {
  look?: ModuleSettings;
  tracks?: Track[];
  samples?: number;
}

export default function StatusTracker(p: StatusTrackerProps) {
  const d = p.data;
  const cpu = hw(d).cpu,
    gpu = hw(d).gpu;
  const eth = Object.keys(d || {})
    .find((k) => /^plugins\.network-info-plugin\.\{[^}]+\}\.name$/.test(k) && get(d, k) === "Ethernet")
    ?.replace(/\.name$/, ".status");
  const defaults: Track[] = [
    { label: "Hottest thread", key: `libre.${cpu}_cpu_core_max`, kind: "threshold", warn: 50, crit: 80 },
    { label: "GPU load", key: `libre.${gpu}_gpu_core_load`, kind: "threshold", warn: 50, crit: 80 },
    { label: "Memory", key: "libre.total_memory_memory", kind: "threshold", warn: 80, crit: 92 },
    { label: "Ethernet", key: eth, kind: "status", up: "Up" },
    { label: "Data API", key: "system.bridge.status", kind: "status", up: "running" },
  ];
  // A track without a key (an inspector slot left on its default) takes the detected key of the default at its position.
  const tracks: Track[] = p.tracks?.map((t, i) => (t.key === undefined ? { ...t, key: defaults[i]?.key } : t)) ?? defaults;
  const N = p.samples ?? 60;
  const hist = useRef<Record<string, Cell[]>>({});
  const lastT = useRef("");
  const stamp = tracks.map((t) => (t.key ? get(d, t.key) : "")).join("|") + get(d, "system.bridge.time");
  if (stamp !== lastT.current) {
    lastT.current = stamp;
    tracks.forEach((t) => {
      const raw = t.key ? get(d, t.key) : "",
        v = num(raw);
      const st: St = raw === "" ? "none" : t.kind === "status" ? (raw === t.up ? "ok" : "crit") : v >= (t.crit ?? Infinity) ? "crit" : v >= (t.warn ?? Infinity) ? "warn" : "ok";
      const arr = hist.current[t.label] ?? Array<Cell>(N).fill({ st: "none", v: "—" });
      hist.current[t.label] = [...arr, { st, v: t.kind === "status" ? raw : `${fmt(v, 0)}%` }].slice(-N);
    });
  }
  const okNow = `${tracks.filter((t) => hist.current[t.label]?.at(-1)?.st === "ok").length}/${tracks.length}`;
  // A track with no reading yet is not failing.
  const failing = tracks.filter((t) => ["warn", "crit"].includes(hist.current[t.label]?.at(-1)?.st ?? "none")).map((t) => t.label);
  const okSub = failing.length > 0 ? `${failing.slice(0, 2).join(", ")} not OK` : tracks.some((t) => hist.current[t.label]?.at(-1)?.st === "ok") ? "All OK" : "No data";
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Status tracker"}
      icon="view_week"
      right={<Chip>Last {N} readings</Chip>}
      compact={(box) => (box.shape === "tile" || box.shape === "column" ? { label: "Status", value: okNow, sub: okSub, kind: "value", icon: "view_week" } : undefined)}
      studio={{
        label: `Last ${N} readings`,
        value: okNow,
        sub: "OK now",
        rows: tracks.map((t) => {
          const l = hist.current[t.label]?.at(-1);
          return { n: t.label, v: l?.v ?? "—", dot: l?.st === "ok" };
        }),
      }}
    >
      {({ w, h }) => {
        // the look's gap spaces the rows and the two legend lines; with it set, budget the legend's
        // full height (the axis line and up to two lines of pills)
        // the legend (axis line + pills) shows from 130px tall; its pills take one line from 330px wide, else two (none under 220px)
        const g = bodyGap(p.look, 10, h),
          labelW = w > 360 ? 112 : w > 200 ? 76 : 56,
          legend = h > 130,
          pillLines = !legend || w < 220 ? 0 : w >= 330 ? 1 : 2,
          rowsFit = useFitRows(h - (legend ? g + 16 + (pillLines ? g + pillLines * 24 + (pillLines - 1) * 6 : 0) : 0), 24, g),
          // each reading needs 2px plus a 2px gap: show the newest that fit
          cells = Math.max(1, Math.min(N, Math.floor((w - labelW - 10 + 2) / 4)));
        return (
          <div className="flex h-full min-w-0 flex-col gap-2.5">
            {tracks.slice(0, rowsFit).map((t) => (
              <div key={t.label} className="grid items-center gap-2.5" style={{ gridTemplateColumns: `${labelW}px minmax(0,1fr)` }}>
                <span className="truncate text-[13px]">{t.label}</span>
                <div className="flex h-6 min-w-0 gap-[2px] overflow-hidden">
                  {(hist.current[t.label] ?? []).slice(-cells).map((c, i) => (
                    <i key={i} title={`${t.label}: ${c.v}`} className="min-w-0 flex-1 self-end rounded-[2px]" style={{ background: c.st === "none" ? "var(--w-track)" : STATE[c.st], height: c.st === "warn" ? "66%" : c.st === "crit" ? "33%" : "100%" }} />
                  ))}
                </div>
              </div>
            ))}
            {legend && (
              <>
                <div className="flex justify-between text-[11px] text-[color:var(--w-faint)]" style={{ marginLeft: labelW + 10 }}>
                  <span>−{N}s</span>
                  <span>now</span>
                </div>
                {pillLines > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["ok", "OK"],
                      ["warn", "50–80%"],
                      ["crit", "Above 80% / down"],
                      ["none", "No data"],
                    ] as const
                  ).map(([s, l]) => (
                    <Pill key={s} state={s === "none" ? "off" : s}>
                      {l}
                    </Pill>
                  ))}
                </div>
                )}
              </>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
