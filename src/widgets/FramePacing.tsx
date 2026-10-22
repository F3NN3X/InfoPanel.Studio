import { Widget, shell, get, num, fmt, useHistory, flipFrameTimes, Spark, Num, type ShellProps, type WidgetMeta } from "./kit";

export const meta: WidgetMeta = {
  id: "FramePacing",
  name: "Frame Pacing",
  category: "Gaming",
  icon: "timeline",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [2, 1],
  blurb: "Frame-time graph with budget lines",
  tags: "stutter fps frametime",
  description: "Frame-time graph with refresh-rate and 60 Hz budget lines — average FPS hides stutter, frame-time spikes show it. Friendly empty state when no game runs.",
};

export interface FramePacingProps extends ShellProps {
  /** Budget lines in Hz; default = [refresh rate, 60]. */
  budgets?: number[];
  /** Samples kept; default 120. */
  window?: number;
}

export default function FramePacing(p: FramePacingProps) {
  const d = p.data;
  const R = (s: string) => get(d, `plugins.InfoPanel.RTSS.rtss.${s}`);
  const fps = num(R("fps")),
    ft = num(R("current frame time")),
    hz = num(R("refreshrate"));
  const idle = !(fps > 0);
  const hist = useHistory(idle ? NaN : ft, p.window ?? 120, 1);
  const budgets = (p.budgets ?? [hz, 60]).filter((b) => b > 0).map((b) => ({ hz: b, ms: 1000 / b }));
  const top = Math.max(20, ...budgets.map((b) => b.ms * 1.25), ...hist);
  // Drawn flipped, so a drop or stutter dips below the budget lines instead of peaking above them.
  const graph = flipFrameTimes(hist, top);
  const stats = [
    ["Average", fmt(num(R("avg-fps"))), "fps"],
    ["1% low", fmt(num(R("1% low fps"))), "fps"],
    ["Min / max", `${fmt(num(R("min-fps")))} / ${fmt(num(R("max-fps")))}`, ""],
    ["Frame time", fmt(ft, 1), "ms"],
  ];
  const cell = ([l, v, u]: string[]) => (
    <div key={l} className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[11px] font-medium uppercase tracking-[0.06em] text-[color:var(--w-muted)]">{l}</span>
      <span className="whitespace-nowrap text-[22px]">
        <Num>{v}</Num>
        {u && <span className="ml-1 text-xs text-[color:var(--w-muted)]">{u}</span>}
      </span>
    </div>
  );
  // the dashed budget lines, with their Hz / ms labels where there is room for them
  const lines = (labels: boolean) =>
    budgets.map((b) => (
      <div key={b.hz} className="absolute inset-x-0 border-t border-dashed border-[color:var(--w-faint)]" style={{ top: `${(b.ms / top) * 100}%` }}>
        {labels && (
          <span className="absolute right-0 -translate-y-full pb-0.5 text-[10px] tabular-nums text-[color:var(--w-faint)]">
            {fmt(b.hz)} Hz · {fmt(b.ms, 1)} ms
          </span>
        )}
      </div>
    ));
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Frame pacing"}
      icon="timeline"
      compact={(box) =>
        box.shape === "tile" || box.shape === "column"
          ? { label: "Frame time", value: idle ? "—" : ft, d: 1, unit: idle ? "" : "ms", sub: idle ? "No game running" : `${fmt(fps)} fps`, hist: idle ? undefined : graph, min: 0, max: top, kind: idle ? "value" : "spark" }
          : undefined
      }
      studio={{ label: "Frame pacing", live: !idle, value: idle ? "—" : ft, d: 1, unit: idle ? "" : "ms", sub: idle ? "No game running" : `${fmt(fps)} fps · 1% ${fmt(num(R("1% low fps")))}`, hist: idle ? undefined : graph, min: 0, max: top }}
    >
      {({ w, h }) =>
        idle ? (
          <div className="grid h-full place-content-center justify-items-center gap-1.5 text-center">
            {h >= 100 && (
              <svg viewBox="0 0 120 44" className="h-11 w-[120px]">
                <path d="M2 30 H118" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="3 4" />
              </svg>
            )}
            <b className="text-sm font-semibold">No game running</b>
            {h > 140 && <p className="m-0 max-w-[34ch] text-[13px] text-[color:var(--w-muted)]">RivaTuner has nothing to capture. FPS and frame time show here when a game starts.</p>}
            {h > 180 && (
              <span className="text-[11px] text-[color:var(--w-faint)]">
                {R("gpu-name")} · {R("resolution")} · {fmt(hz)} Hz
              </span>
            )}
          </div>
        ) : h < 106 ? (
          // a single-row zone: the figures beside the graph, no room to stack them
          <div className="flex h-full min-w-0 items-center gap-4">
            <div className="flex shrink-0 gap-4">{stats.slice(0, w > 300 ? 2 : 1).map(cell)}</div>
            <div className="relative h-full max-h-14 min-w-0 flex-1">
              {lines(false)}
              <Spark values={graph} min={0} max={top} graph="line" fill={false} className="absolute inset-0 h-full" />
            </div>
          </div>
        ) : (
          <div className="flex h-full min-w-0 flex-col gap-3">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${w > 420 ? 4 : 2}, minmax(0,1fr))` }}>
              {stats.slice(0, w > 420 ? 4 : 2).map(cell)}
            </div>
            <div className="relative min-h-[40px] flex-1">
              {lines(true)}
              <Spark values={graph} min={0} max={top} graph="line" fill={false} className="absolute inset-0 h-full" />
            </div>
            {h > 200 && (
              <div className="flex justify-between text-[11px] text-[color:var(--w-faint)]">
                <span>−{Math.round((p.window ?? 120) / 4)}s</span>
                <span>now</span>
              </div>
            )}
          </div>
        )
      }
    </Widget>
  );
}
