import { Widget, shell, get, num, fmt, has, clamp, Metric, Ring, Spark, Stat, Chip, Num, ToneCue, hue, useHistory, frameSample, frameBudgets, frameTimeTop, clampSpikes, Icon, TONES, type ShellProps, type Tier, type Tone } from "./kit";
import { fpsSubLine } from "./fps-line";
import { meta } from "./meta/FpsMonitor";

export { meta };

const RTSS = "plugins.InfoPanel.RTSS.rtss.";
const PRESENTMON = "plugins.fps-plugin.fps.";



export interface FpsMonitorProps extends ShellProps {
  /** Fps target line; default = refresh rate. */
  target?: number;
  /** `gauge`: an FPS ring against the refresh rate; `trend`: the ring with a rolling FPS sparkline. Unset: the frame-time graph layout. */
  view?: "gauge" | "trend";
  /** Extra metrics (API, display mode, benchmark, PresentMon figures) in the gauge view; default on. */
  showMetrics?: boolean;
  /** Rolling FPS sparkline in the gauge view. */
  sparkline?: boolean;
  /** Ring colour; empty = by how close the FPS is to the refresh rate. */
  ringColor?: string;
  /** Sparkline colour; empty = a hue of the accent. */
  sparkColor?: string;
}

type Lookup = (...ids: string[]) => string;
type LiveLookup = (...ids: string[]) => number;

/** The label / value pairs of the gauge view's metrics line: RTSS facts, then the PresentMon figures. */
function extraMetrics(k: Lookup, live: LiveLookup): [string, string][] {
  const out: [string, string][] = [];
  const api = k("graphics-api");
  if (has(api)) out.push(["API", api]);
  const display = k("display-mode");
  if (has(display)) out.push(["Display", display]);
  const bench = k("benchmark-mode");
  if (has(bench) && !bench.startsWith("Failed")) out.push(["Benchmark", bench]);
  const gpuUtil = live("gpu utilization");
  if (Number.isFinite(gpuUtil)) out.push(["GPU util", `${Math.round(gpuUtil)}%`]);
  const gpuBusy = live("gpu busy");
  if (Number.isFinite(gpuBusy)) out.push(["GPU busy", `${fmt(gpuBusy, 1)} ms`]);
  const cpuBusy = live("cpu busy");
  if (Number.isFinite(cpuBusy)) out.push(["CPU busy", `${fmt(cpuBusy, 1)} ms`]);
  const latency = live("display latency");
  if (Number.isFinite(latency)) out.push(["Display lat", `${fmt(latency, 1)} ms`]);
  return out;
}

interface GaugeViewProps {
  idle: boolean;
  size: Tier;
  w: number;
  h: number;
  fps: number;
  low: number;
  low01: number;
  ft: number;
  hz: number;
  maxFps: number;
  /** maxFps is the FPS target, not the refresh rate. */
  targeted?: boolean;
  tone: Tone;
  ringColor?: string;
  sparkColor: string;
  hist?: number[];
  source: string;
  gpu: string;
  resolution: string;
  title: string;
  extras: [string, string][];
}

/** The FPS ring against the refresh rate, with 1% low, frame time, metrics and the display facts around it. */
export function GaugeView({ idle, size, w, h, fps, low, low01, ft, hz, maxFps, targeted, tone, ringColor, sparkColor, hist, source, gpu, resolution, title, extras }: GaugeViewProps) {
  const color = ringColor || undefined;
  const tall = h >= w * 0.72;
  const ringSize = Math.max(40, tall ? Math.min(w * 0.7, h * 0.45, 150) : Math.min(h - (size === "xs" ? 4 : 24), w * 0.34, 140));
  const numColor = color ?? (tone !== "ok" ? TONES[tone] : undefined);
  const ring = (
    <div className="shrink-0" style={{ width: ringSize, height: ringSize }}>
      <Ring value={idle ? 0 : fps} max={maxFps} t={tone} color={color} thickness={10} className="h-full w-full">
        <Num className="leading-none" style={{ fontSize: Math.max(12, ringSize * 0.26), color: numColor }}>
          {!idle && <ToneCue t={tone} />}
          {idle ? "–" : fmt(fps)}
        </Num>
      </Ring>
    </div>
  );
  if (idle && size !== "xs")
    return (
      <div className="flex h-full items-center justify-center gap-4">
        {ring}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm text-[color:var(--w-fg)]">No game running</span>
          {size !== "sm" && (
            <span className="truncate text-[11px] text-[color:var(--w-faint)]">
              {gpu} · {resolution} @ {fmt(hz)} Hz
            </span>
          )}
        </div>
      </div>
    );
  if (size === "xs")
    return (
      <div className="flex h-full items-center justify-center gap-2">
        {ring}
        <span className="text-xs font-semibold text-[color:var(--w-muted)]">{source}</span>
      </div>
    );
  const stats = (
    <div className="flex items-center gap-5">
      {low > 0 && <Stat label="1% low" value={`${fmt(low)} fps`} />}
      {low01 > 0 && <Stat label="0.1% low" value={`${fmt(low01)} fps`} />}
      {ft > 0 && <Stat label="Frame time" value={`${fmt(ft, 1)} ms`} />}
    </div>
  );
  const shown = size === "sm" ? [] : extras.slice(0, 4);
  const metrics = shown.length > 0 && (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[color:var(--w-faint)]">
      {shown.map(([l, v]) => (
        <span key={l}>
          {l} <span className="font-semibold tabular-nums text-[color:var(--w-fg)]">{v}</span>
        </span>
      ))}
    </div>
  );
  const spark = hist && <Spark values={hist} min={0} color={sparkColor} className="h-6 w-full" />;
  const sourceLine = (
    <span className="text-[10.5px] font-medium text-[color:var(--w-muted)]">
      {source} · {fmt(maxFps)} {targeted ? "fps target" : "Hz"}
    </span>
  );
  const side = size !== "sm" && w > 440;
  // narrower than the side column's width: the GPU and display facts sit under the metrics, when there is room
  const facts = size !== "sm" && !side && (gpu || resolution) && (!metrics || h >= 190) && (
    <div className="min-w-0 text-[11px] text-[color:var(--w-faint)]">
      {gpu && <div className="truncate font-medium text-[color:var(--w-muted)]">{gpu}</div>}
      <div className="truncate">{[resolution, hz > 0 ? `${fmt(hz)} Hz` : ""].filter(Boolean).join(" · ")}</div>
    </div>
  );
  if (tall)
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 overflow-hidden text-center">
        {ring}
        {sourceLine}
        {stats}
        {spark && <div className="w-[80%]">{spark}</div>}
        {metrics}
        {title && <span className="max-w-full truncate text-[11px] text-[color:var(--w-faint)]">{[title, resolution].filter(Boolean).join(" · ")}</span>}
      </div>
    );
  return (
    <div className="flex h-full min-h-0 items-center gap-5 overflow-hidden">
      <div className="flex shrink-0 flex-col items-center gap-1">
        {ring}
        {sourceLine}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        {stats}
        {spark}
        {metrics}
        {facts}
      </div>
      {side && (
        <div className="w-[26%] max-w-[220px] shrink-0 text-right">
          <div className="truncate text-sm font-medium text-[color:var(--w-fg)]">{gpu || "–"}</div>
          <div className="truncate text-[11px] text-[color:var(--w-faint)]">{[resolution, hz > 0 ? `${fmt(hz)} Hz` : ""].filter(Boolean).join(" · ")}</div>
          {title && <div className="mt-1 truncate text-[11px] text-[color:var(--w-faint)]">{title}</div>}
        </div>
      )}
    </div>
  );
}

export default function FpsMonitor(p: FpsMonitorProps) {
  const d = p.data;
  // RTSS first, then the PresentMon plugin's key (and its alternative names).
  const k: Lookup = (...ids) => ids.flatMap((id) => [get(d, RTSS + id), get(d, PRESENTMON + id)]).find(has) ?? "";
  const live: LiveLookup = (...ids) => ids.flatMap((id) => [num(get(d, RTSS + id)), num(get(d, PRESENTMON + id))]).find((v) => Number.isFinite(v) && v !== 0) ?? NaN;
  const fps = live("fps"),
    low = live("1% low fps", "1% low"),
    low01 = live("0.1% low"),
    ft = live("current frame time", "frame time");
  const hz = live("refreshrate"),
    target = p.target ?? hz;
  const title = k("windowtitle");
  const idle = !fps || /no games/i.test(title);
  // The frame time checked against the frame rate (RTSS sometimes reports a fraction of a ms); a slow frame rises,
  // on a scale that steps instead of following every spike. The FPS history has its menu and loading spikes cut.
  const frame = frameSample(ft, fps);
  const hist = useHistory(frame, 90);
  const ftTop = frameTimeTop(hist, frameBudgets([hz, 60]).map((b) => b.ms));
  const fpsH = clampSpikes(useHistory(fps, 60));
  const pct = Number.isFinite(target) && target > 0 ? fps / target : 1;
  const t: Tone = pct >= 0.9 ? "ok" : pct >= 0.5 ? "warn" : "crit";
  const gauge = p.view === "gauge" || p.view === "trend";
  // The trend view stores `sparkline: true` (v8 migration), so the toggle alone decides.
  const spark = p.sparkline === true;
  // the gauge's full scale and tone: the fps target when set, else the refresh rate
  const targeted = p.target !== undefined && p.target > 0;
  const maxFps = targeted ? p.target! : hz > 0 ? hz : 144;
  const ratio = fps / maxFps;
  const gt: Tone = ratio >= 0.9 ? "ok" : ratio >= 0.6 ? "warn" : "crit";
  const source = num(get(d, RTSS + "fps")) > 0 ? "RTSS" : has(get(d, PRESENTMON + "gpu utilization")) ? "PresentMon" : "FPS";
  const lowLine = fpsSubLine(low, frame);
  const gaugeCompact = {
    label: idle ? "FPS" : title || source,
    value: idle ? "–" : fps,
    unit: idle ? "" : "FPS",
    sub: idle ? "No game running" : lowLine,
    pct: clamp(ratio * 100),
    hist: spark && !idle ? fpsH : undefined,
    kind: idle ? ("value" as const) : spark ? ("spark" as const) : ("ring" as const),
    t: idle ? ("ok" as const) : gt,
    color: p.ringColor || undefined,
  };
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? (idle ? "FPS" : title)}
      icon="speed"
      compact={gauge ? gaugeCompact : { label: idle ? "FPS" : title, value: idle ? "–" : fps, unit: idle ? "" : "FPS", sub: idle ? "No game running" : fpsSubLine(low, frame), idle: idle ? "No game running" : undefined, icon: "sports_esports", hist: idle ? undefined : fpsH, kind: idle ? "value" : "spark", t: idle ? "ok" : t }}
      right={has(k("graphics-api")) && <Chip>{k("graphics-api")}</Chip>}
    >
      {({ size, w, h }) =>
        gauge ? (
          <GaugeView idle={idle} size={size} w={w} h={h} fps={fps} low={low} low01={low01} ft={frame} hz={hz} maxFps={maxFps} targeted={targeted} tone={gt} ringColor={p.ringColor} sparkColor={p.sparkColor || hue(120)} hist={spark ? fpsH : undefined} source={source} gpu={k("gpu-name")} resolution={k("resolution")} title={title} extras={p.showMetrics === false ? [] : extraMetrics(k, live)} />
        ) : idle && size !== "xs" ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <Icon name="sports_esports" className="text-3xl text-[color:var(--w-faint)]" />
            <span className="text-sm text-[color:var(--w-fg)]">No game running</span>
            {size !== "sm" && (
              <span className="text-[11px] text-[color:var(--w-faint)]">
                {k("gpu-name")} · {k("resolution")} @ {fmt(hz)} Hz
              </span>
            )}
          </div>
        ) : size === "xs" ? (
          <Metric value={idle ? "–" : fps} unit="FPS" scale="lg" sub={idle ? "Idle" : fpsSubLine(low, 0)} t={idle ? "ok" : t} className="h-full justify-center" />
        ) : size === "sm" ? (
          <div className="flex h-full items-end justify-between gap-3">
            <Metric value={fps} unit="FPS" scale="xl" t={t} />
            <div className="grid gap-1.5 text-right">
              <Stat label="1% low" value={low > 0 ? fmt(low) : "–"} />
              <Stat label="Frame" value={`${fmt(frame, 1)} ms`} />
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-3">
            <div className="flex items-end gap-5">
              <Metric value={fps} unit="FPS" scale={size === "lg" ? "2xl" : "xl"} t={t} />
              <div className="grid flex-1 grid-cols-3 gap-3">
                <Stat label="1% low" value={low > 0 ? fmt(low) : "–"} />
                <Stat label="Avg" value={fmt(num(k("avg-fps")))} />
                <Stat label="Frame time" value={`${fmt(frame, 1)} ms`} />
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <span className="shrink-0 self-end text-[10px] text-[color:var(--w-faint)]">frame time</span>
              <div className="relative min-h-0 flex-1">
                <Spark values={hist} min={0} max={ftTop} curve={false} className="absolute inset-0 h-full" />
              </div>
            </div>
            {size === "lg" && (
              <div className="grid grid-cols-4 gap-3 border-t border-[color:var(--w-track)] pt-3">
                <Stat label="Min / Max" value={`${fmt(num(k("min-fps")))} / ${fmt(num(k("max-fps")))}`} />
                <Stat label="Display" value={`${k("resolution")} · ${fmt(hz)} Hz`} />
                <Stat label="Mode" value={has(k("display-mode")) ? k("display-mode") : "–"} />
                <Stat label="Benchmark" value={k("benchmark-mode") || "–"} />
              </div>
            )}
          </div>
        )
      }
    </Widget>
  );
}
