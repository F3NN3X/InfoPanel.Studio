import type { CSSProperties, ReactNode } from "react";
import { Widget, shell, get, num, fmt, has, useSkin, useIpTag, ToneCue, hw, type IpTagExtra, type ShellProps } from "./kit";
import { fpsSubLine } from "./fps-line";
import { meta } from "./meta/OsdStrip";

export { meta };

export type OsdCell = "fps" | "low" | "ft" | "gpu" | "cpu" | "vram" | "display";

export interface OsdStripProps extends ShellProps {
  /** Subset / order of the cells; default = all. */
  cells?: OsdCell[];
  /** Fps target; default = refresh rate. */
  target?: number;
}

// The strip is a dark panel of its own, so its text stays light on every surface.
/** The content height (px) under which a cell's label and value go on one line. */
const INLINE_H = 52;
/** The colours a dropped frame rate takes: below half and below three quarters of the target. */
const DROP_CRIT = "#F2665E";
const DROP_WARN = "#EDB232";

const OSD_TEXT = { color: "#f4f4f5", "--w-fg": "#f4f4f5", "--w-muted": "#d4d4d8", "--w-faint": "#a1a1aa", "--w-track": "rgba(255,255,255,0.1)" } as CSSProperties;

export default function OsdStrip(p: OsdStripProps) {
  const d = p.data;
  const sk = useSkin();
  const R = (s: string) => get(d, `plugins.InfoPanel.RTSS.rtss.${s}`);
  const cpu = hw(d).cpu,
    gpu = hw(d).gpu;
  const L = (k: string) => num(get(d, `libre.${k}`));
  const fps = num(R("fps")),
    low = num(R("1% low fps")),
    ft = num(R("current frame time")),
    hz = num(R("refreshrate"));
  const idle = !(fps > 0);
  const target = p.target ?? hz;
  const drop = (v: number): string | null => (idle || !Number.isFinite(v) ? null : v < target * 0.5 ? DROP_CRIT : v < target * 0.75 ? DROP_WARN : null);
  const res = String(R("resolution")).replace(/\s/g, ""),
    resL = /3840x2160/.test(res) ? "4K" : /2560x1440/.test(res) ? "1440p" : /1920x1080/.test(res) ? "1080p" : res;
  const ALL: Record<OsdCell, [string, string, string | null]> = {
    fps: ["FPS", idle ? "—" : fmt(fps), drop(fps)],
    low: ["1% low", idle ? "—" : fmt(low), drop(low)],
    ft: ["Frame time", idle ? "—" : `${fmt(ft, 1)} ms`, null],
    gpu: ["GPU", `${fmt(L(`${gpu}_gpu_core_load`), 0)}% · ${fmt(L(`${gpu}_gpu_core`), 0)}°`, null],
    cpu: ["CPU", `${fmt(L(`${cpu}_cpu_total`), 0)}%`, null],
    vram: ["VRAM", `${fmt(L(`${gpu}_gpu_memory_used`) / 1024, 1)} GB`, null],
    display: ["Display", `${resL} · ${fmt(hz)} Hz`, null],
  };
  const keys = (p.cells ?? (Object.keys(ALL) as OsdCell[])).filter((k) => k in ALL);
  // Each cell's readings for InfoPanel: one per part of its text (the GPU cell is a load and a temperature).
  const tag = useIpTag();
  const rtss = (s: string) => `plugins.InfoPanel.RTSS.rtss.${s}`;
  const IP: Partial<Record<OsdCell, [string, IpTagExtra][]>> = {
    fps: [[rtss("fps"), { decimals: 0, unit: "" }]],
    low: [[rtss("1% low fps"), { decimals: 0, unit: "" }]],
    ft: [[rtss("current frame time"), { decimals: 1, unit: " ms" }]],
    gpu: [[`libre.${gpu}_gpu_core_load`, { decimals: 0, unit: "%" }], [`libre.${gpu}_gpu_core`, { decimals: 0, unit: "°" }]],
    cpu: [[`libre.${cpu}_cpu_total`, { decimals: 0, unit: "%" }]],
    vram: [[`libre.${gpu}_gpu_memory_used`, { decimals: 1, unit: " GB", mul: 1 / 1024 }]],
  };
  // Tagged (the studio canvas only), a two-part text is two spans; elsewhere the cell's markup is as it was.
  const shownAs = (k: OsdCell, v: string): ReactNode => {
    const parts = IP[k]?.map(([key, extra]) => tag(key, extra)) ?? [];
    if (!parts[0]?.["data-ip-key"]) return v;
    if (parts.length === 1) return <span {...parts[0]}>{v}</span>;
    const [a, b] = v.split(" · ");
    return (
      <>
        <span {...parts[0]}>{a}</span> · <span {...parts[1]}>{b}</span>
      </>
    );
  };
  return (
    <Widget
      {...shell(p)}
      showHeader={false}
      compact={(box) =>
        box.shape === "strip" ? undefined : { label: "FPS", value: idle ? "—" : fps, sub: idle ? "No game running" : fpsSubLine(low, ft), idle: idle ? "No game running" : undefined, kind: "value", icon: idle ? "sports_esports" : "videogame_asset", t: drop(fps) === DROP_CRIT ? "crit" : drop(fps) ? "warn" : "ok" }
      }
      studio={{ label: "OSD", live: !idle, value: idle ? "—" : fps, unit: idle ? "" : "fps", rows: keys.map((k) => ({ n: ALL[k][0], v: ALL[k][1] })) }}
    >
      {({ w, h }) => {
        // Under INLINE_H the label and the value share one line, so the strip still fits.
        const inline = h > 0 && h < INLINE_H;
        const n = Math.max(1, Math.min(keys.length, Math.floor(w / (inline ? 128 : 92))));
        return (
          <div className="flex h-full flex-col justify-center gap-1.5">
            <div className="grid min-w-0 overflow-hidden rounded-md bg-[#17171b] ring-1 ring-white/10" style={{ ...OSD_TEXT, gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
              {keys.slice(0, n).map((k, i) => {
                const [l, v, c] = ALL[k];
                return (
                  <div key={k} className={`flex min-w-0 ${inline ? "items-baseline gap-1.5 px-2 py-1" : "flex-col gap-0.5 px-2.5 py-1.5"} ${i ? "border-l border-white/10" : ""}`}>
                    <span className={`${inline ? "shrink-0 " : ""}truncate text-micro font-semibold uppercase tracking-[0.08em] text-[color:var(--w-muted)]`}>{l}</span>
                    <span
                      className={`truncate ${inline && h < 30 ? "text-[13px]" : "text-[15px]"} font-medium tabular-nums text-[color:var(--w-fg)]`}
                      style={{ fontFamily: sk.skin === "retro" || sk.skin === "tui" ? sk.num : "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace", color: c ?? (k === "fps" && !idle ? "var(--accent)" : undefined) }}
                    >
                      {c && <ToneCue t={c === DROP_CRIT ? "crit" : "warn"} size="0.75em" />}
                      {shownAs(k, v)}
                    </span>
                  </div>
                );
              })}
            </div>
            {h > 90 && (
              <span className="truncate text-[11px] text-[color:var(--w-faint)]">
                RTSS: {has(R("windowtitle")) ? R("windowtitle") : "—"}
                {/✓|enabled/i.test(R("benchmark-mode")) ? " · benchmark mode on" : ""}
              </span>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
