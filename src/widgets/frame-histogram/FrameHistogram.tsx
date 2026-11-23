import { Widget, shell, fmt, frameSample, ChartAxis, Num, TONES, type ShellProps } from "../kit";
import { frameHistogram, frameLows } from "../core/histogram";
import { useSeries, type SeriesLimits } from "../core/history";
import { roleData, roleValue } from "../shared/role-data";
import { meta } from "./meta";

export { meta };

export interface FrameHistogramProps extends ShellProps {
  /** Seconds of frames counted; default 60. */
  window?: number;
}

/** Frame budgets drawn as guides (ms): 60 and 120 fps. */
const GUIDES = [
  { ms: 1000 / 60, label: "60 fps" },
  { ms: 1000 / 120, label: "120 fps" },
];
const BINS = 24;

export default function FrameHistogram(p: FrameHistogramProps) {
  const { roles } = roleData(p.data, p.names);
  const fps = roleValue(roles, "fps");
  const idle = !(fps > 0);
  const windowS = p.window ?? 60;
  // One reading a second from RTSS, checked against the frame rate (`frameSample`); a store holds at most 700 of them.
  const limits: SeriesLimits = { maxAgeMs: windowS * 1000, maxCount: 700, minGapMs: 800 };
  const store = useSeries(p.data, { ft: idle ? Number.NaN : frameSample(roleValue(roles, "frametime"), fps) }, limits);
  const frames = store.read("ft").map((s) => s.v);
  const hist = frameHistogram(frames, BINS);
  const lows = frameLows(frames);
  const span = windowS >= 60 ? `last ${Math.round(windowS / 60)} min` : `last ${windowS} s`;
  const stats = [
    ["1% low", fmt(lows.low1Fps), "fps", `${fmt(lows.low1, 1)} ms`],
    ["0.1% low", fmt(lows.low01Fps), "fps", `${fmt(lows.low01, 1)} ms`],
  ];
  const x = (ms: number) => (ms / hist.top) * 100;
  const cell = ([l, v, u, ms]: string[]) => (
    <div key={l} className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-micro font-medium uppercase tracking-[0.06em] text-[color:var(--w-muted)]">{l}</span>
      <span className="whitespace-nowrap text-stat">
        <Num>{v}</Num>
        <span className="ml-1 text-xs text-[color:var(--w-muted)]">{u}</span>
        <span className="ml-2 text-micro text-[color:var(--w-faint)]">{ms}</span>
      </span>
    </div>
  );
  const chart = (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
      {hist.bins.map((b, i) =>
        b.count ? <rect key={i} x={x(b.from) + 0.25} width={Math.max(0.1, x(b.to) - x(b.from) - 0.5)} y={100 - (b.count / hist.peak) * 100} height={(b.count / hist.peak) * 100} fill={b.from >= GUIDES[0].ms ? TONES.warn : "var(--w-accent)"} opacity={0.85} /> : null
      )}
      {GUIDES.filter((g) => g.ms < hist.top).map((g) => (
        <line key={g.label} x1={x(g.ms)} x2={x(g.ms)} y1="0" y2="100" stroke="var(--w-faint)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      ))}
      {[lows.low1, lows.low01].filter(Number.isFinite).map((ms, i) => (
        <line key={i} x1={x(Math.min(ms, hist.top))} x2={x(Math.min(ms, hist.top))} y1="0" y2="100" stroke={i ? TONES.crit : TONES.warn} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Frame histogram"}
      icon="equalizer"
      right={idle ? undefined : <span className="font-mono text-micro text-[color:var(--w-faint)]">{span}</span>}
      compact={(box) =>
        box.shape === "tile" || box.shape === "column"
          ? { label: "1% low", value: idle || !frames.length ? "—" : lows.low1Fps, d: 0, unit: idle || !frames.length ? "" : "fps", sub: idle ? "No game running" : `0.1% ${fmt(lows.low01Fps)} fps`, idle: idle ? "No game running" : undefined, kind: "value" }
          : undefined
      }
      studio={{ label: "Frame histogram", live: !idle, value: idle || !frames.length ? "—" : lows.low1Fps, d: 0, unit: idle || !frames.length ? "" : "fps", sub: idle ? "No game running" : `1% low · 0.1% ${fmt(lows.low01Fps)} fps` }}
    >
      {({ w, h }) =>
        idle ? (
          <div className="grid h-full place-content-center justify-items-center gap-1.5 text-center">
            {h >= 100 && (
              <svg viewBox="0 0 120 44" className="h-11 w-30">
                <path d="M2 30 H118" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="3 4" />
              </svg>
            )}
            <b className="text-sm font-semibold">No game running</b>
            {h > 140 && <p className="m-0 max-w-[34ch] text-body text-[color:var(--w-muted)]">Frame times collect here when a game starts.</p>}
          </div>
        ) : h < 106 ? (
          <div className="flex h-full min-w-0 items-center gap-4">
            <div className="flex shrink-0 gap-4">{stats.slice(0, w > 300 ? 2 : 1).map(cell)}</div>
            <div className="relative h-full max-h-14 min-w-0 flex-1">{chart}</div>
          </div>
        ) : (
          <div className="flex h-full min-w-0 flex-col gap-3">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${w > 300 ? 2 : 1}, minmax(0,1fr))` }}>
              {stats.slice(0, w > 300 ? 2 : 1).map(cell)}
            </div>
            <div className="relative min-h-10 flex-1">{chart}</div>
            {h > 170 && (
              <ChartAxis
                ticks={[
                  { at: 0, label: "0 ms" },
                  ...GUIDES.filter((g) => x(g.ms) > (w > 300 ? 30 : 14) && x(g.ms) < 80).map((g) => ({ at: x(g.ms), label: Math.round(g.ms), title: g.label })),
                  { at: 100, label: `${hist.top}+ ms` },
                ]}
              />
            )}
          </div>
        )
      }
    </Widget>
  );
}
