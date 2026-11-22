// FPS Monitor's pacing view: the frame-time graph with budget lines, drawn as the Frame Pacing widget drew it before it
// merged into FPS Monitor (config v19). RTSS only, as it was.
import { Widget, shell, get, num, fmt, useHistory, frameSample, frameBudgets, frameTimeTop, sparkY, Spark, ThresholdLine, ChartAxis, ChartYAxis, Num, type ShellProps } from "../kit";

export interface FramePacingProps extends ShellProps {
  /** Budget lines in Hz; default = [refresh rate, 60]. */
  budgets?: number[];
  /** Samples kept; default 120. */
  window?: number;
}

export default function FramePacing(p: FramePacingProps) {
  const d = p.data;
  const rtssOf = (s: string) => get(d, `plugins.InfoPanel.RTSS.rtss.${s}`);
  const fps = num(rtssOf("fps")),
    ft = num(rtssOf("current frame time")),
    hz = num(rtssOf("refreshrate"));
  const idle = !(fps > 0);
  // One reading a second, checked against the frame rate (`frameSample`); raw, so a stutter isn't eased away.
  const frame = frameSample(ft, fps);
  const samples = p.window ?? 120;
  const hist = useHistory(idle ? NaN : frame, samples, 1);
  const budgets = frameBudgets(p.budgets ?? [hz, 60]);
  // A slow frame rises, as on RTSS's own graph; the scale steps (`frameTimeTop`), so a single spike doesn't squash the line.
  const top = frameTimeTop(hist, budgets.map((b) => b.ms));
  const graph = hist;
  const stats = [
    ["Average", fmt(num(rtssOf("avg-fps"))), "fps"],
    ["1% low", fmt(num(rtssOf("1% low fps"))), "fps"],
    ["Min / max", `${fmt(num(rtssOf("min-fps")))} / ${fmt(num(rtssOf("max-fps")))}`, ""],
    ["Frame time", fmt(frame, 1), "ms"],
  ];
  const cell = ([l, v, u]: string[]) => (
    <div key={l} className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-micro font-medium uppercase tracking-[0.06em] text-[color:var(--w-muted)]">{l}</span>
      <span className="whitespace-nowrap text-[22px]">
        <Num>{v}</Num>
        {u && <span className="ml-1 text-xs text-[color:var(--w-muted)]">{u}</span>}
      </span>
    </div>
  );
  // The dashed budget lines on the graph's own scale (`sparkY`): a frame above one missed that rate.
  const lines = () =>
    budgets.map((b) => <ThresholdLine key={b.hz} at={sparkY(b.ms, 0, top)} />);
  // Their labels on the y axis beside the graph, level with each line, so the line never runs through them.
  const yTicks = budgets.map((b) => ({
    at: sparkY(b.ms, 0, top),
    label: (
      <>
        {fmt(b.hz)} fps
        <br />
        {fmt(b.ms, 1)} ms
      </>
    ),
  }));
  const span = samples >= 60 ? `−${Math.round(samples / 60)} min` : `−${samples}s`;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Frame pacing"}
      icon="timeline"
      compact={(box) =>
        box.shape === "tile" || box.shape === "column"
          ? { label: "Frame time", value: idle ? "—" : frame, d: 1, unit: idle ? "" : "ms", sub: idle ? "No game running" : `${fmt(fps)} fps`, idle: idle ? "No game running" : undefined, hist: idle ? undefined : graph, min: 0, max: top, kind: idle ? "value" : "spark" }
          : undefined
      }
      studio={{ label: "Frame pacing", live: !idle, value: idle ? "—" : frame, d: 1, unit: idle ? "" : "ms", sub: idle ? "No game running" : `${fmt(fps)} fps · 1% ${fmt(num(rtssOf("1% low fps")))}`, hist: idle ? undefined : graph, min: 0, max: top }}
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
            {h > 140 && <p className="m-0 max-w-[34ch] text-body text-[color:var(--w-muted)]">RivaTuner has nothing to capture. FPS and frame time show here when a game starts.</p>}
            {h > 180 && (
              <span className="text-micro text-[color:var(--w-faint)]">
                {rtssOf("gpu-name")} · {rtssOf("resolution")} · {fmt(hz)} Hz
              </span>
            )}
          </div>
        ) : h < 106 ? (
          // a single-row zone: the figures beside the graph, no room to stack them
          <div className="flex h-full min-w-0 items-center gap-4">
            <div className="flex shrink-0 gap-4">{stats.slice(0, w > 300 ? 2 : 1).map(cell)}</div>
            <div className="relative h-full max-h-14 min-w-0 flex-1">
              {lines()}
              <Spark values={graph} min={0} max={top} graph="line" fill={false} curve={false} className="absolute inset-0 h-full" />
            </div>
          </div>
        ) : (
          <div className="flex h-full min-w-0 flex-col gap-3">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${w > 420 ? 4 : 2}, minmax(0,1fr))` }}>
              {stats.slice(0, w > 420 ? 4 : 2).map(cell)}
            </div>
            <div className="flex min-h-[40px] flex-1 gap-2">
              <div className="relative min-w-0 flex-1">
                {lines()}
                <Spark values={graph} min={0} max={top} graph="line" fill={false} curve={false} className="absolute inset-0 h-full" />
              </div>
              {w > 260 && <ChartYAxis ticks={yTicks} className="w-12" />}
            </div>
            {h > 200 && (
              <ChartAxis ticks={[{ at: 0, label: span }, { at: 100, label: "now" }]} className={w > 260 ? "mr-14" : ""} />
            )}
          </div>
        )
      }
    </Widget>
  );
}
