import type { CSSProperties } from "react";
import type { ModuleSettings } from "@/modules/types";
import { diskMetric, filterDisks, formatTemp, netMetric, pickAdapter, pickDisk, rateTop, readAdaptersFlat, readSystemFlat, systemKeysFlat, type DiskReading, type DiskValue, type NetDirection } from "@/lib/system-metrics";
import { MetricGauges, MetricGraphs, type MetricRow } from "./SystemOverviewViews";
import { useFitRows, Widget, shell, get, num, fmt, fmtRate, pretty, Ring, RingStack, Spark, Bar, Empty, heat, useHistory, tone, TONES, hw, Num, scaleY, useSkin, useIpTag, type ShellProps, type Tone } from "./kit";
import { meta } from "./meta/SystemOverview";

export { meta };

export type Section = "cpu" | "gpu" | "ram" | "vram" | "disk" | "net";
const DEF: Record<Section, string> = { cpu: "#38bdf8", gpu: "#a78bfa", ram: "#fbbf24", vram: "#facc15", disk: "#fb7185", net: "#34d399" };
// Under a non-default skin, sections derive from the skin's accent by hue rotation, so the palette follows the skin.
const SHIFT: Record<Section, number> = { cpu: 0, gpu: 55, ram: -45, vram: -80, disk: 160, net: 120 };
const sectionColor = (k: Section) => (SHIFT[k] ? `oklch(from var(--sys-base) l c calc(h + ${SHIFT[k]}))` : "var(--sys-base)");
const LABEL: Record<Section, string> = { cpu: "CPU", gpu: "GPU", ram: "RAM", vram: "VRAM", disk: "Disks", net: "NET" };

/** The details each switch shows; an unset switch is on. */
export type Detail = "names" | "temps" | "power" | "clock" | "hotspot" | "fans" | "memClock" | "powerLimit" | "memory" | "pageFile" | "diskTemp" | "diskIo" | "diskLife";

export interface SystemOverviewProps extends ShellProps {
  look?: ModuleSettings;
  /** The layout: the full panel, a sparkline row per metric or open-arc dials. */
  view?: "panel" | "graphs" | "gauges";
  sections?: Section[];
  colors?: Partial<Record<Section, string>>;
  /** Use the accent everywhere. */
  unifiedColor?: boolean;
  ring?: "ring" | "none";
  coreView?: "heatmap" | "bars" | "off";
  heatRamp?: string;
  details?: "auto" | "min" | "full";
  /** Load warning / critical, percent. */
  warn?: number;
  crit?: number;
  /** Detail switches (hardware names, temperatures, power, clocks, fans, memory, page file, drive details). */
  show?: Partial<Record<Detail, boolean>>;
  /** Trend graphs under the loads. */
  sparkline?: boolean;
  /** Graph window, in changed samples. */
  historyLength?: number;
  /** Temperature warning / critical, °C. */
  tempWarn?: number;
  tempCrit?: number;
  /** VRAM / drive fullness warning and critical, percent (critical unset: the load's `crit`). */
  vramWarn?: number;
  vramCrit?: number;
  tempUnit?: "c" | "f";
  /** Decimals on percentages and temperatures. */
  decimals?: 0 | 1;
  /** Section label overrides. */
  labels?: Partial<Record<Section, string>>;
  /** Comma-separated drive-name substrings; empty = all drives. */
  diskFilter?: string;
  /** Graphs / Gauges: the drive (a key slug; empty = the first detected) and what it shows. */
  diskPick?: string;
  diskValue?: DiskValue;
  /** Graphs / Gauges: the adapter (empty = the busiest), its direction and the scale's top in Mbps (0 = auto). */
  netAdapter?: string;
  netDirection?: NetDirection;
  netMax?: number;
}

interface Stat {
  l: string;
  v: string;
  t?: Tone;
  /** In the inline detail line, the value alone ("64°C") instead of "label value". */
  bare?: boolean;
  /** The Data API key it shows, and its scale to the shown unit (MHz as GHz: 0.001), for the InfoPanel conversion's tags. */
  k?: string;
  mul?: number;
}

interface SectionData {
  v: number;
  name: string;
  big?: string;
  stats: Stat[];
  /** Fullness (VRAM, drives) tones by `vramWarn` instead of the load warning. */
  capacity?: boolean;
  /** Whether the machine reports this section at all. */
  present: boolean;
  /** The Data API key of `v`, for the InfoPanel conversion's tags. */
  key?: string;
}

interface Drive {
  id: string;
  name: string;
  used: number;
  text: string;
  t: Tone;
  details: Stat[];
}

/** GB as "51.4" / "128". */
const gb = (v: number) => fmt(v, v >= 100 ? 0 : 1);
/** A slug drive name (flat data has no sensor names) → "Kingston SFYRD2000G". */
const driveName = (name: string) => (/^[a-z0-9_]+$/.test(name) ? pretty(name) : name);
const inline = (s: Stat) => (s.bare ? s.v : `${s.l} ${s.v}`);

function CoreGrid({ cores, cellW, view, ramp }: { cores: number[]; cellW: number; view: "heatmap" | "bars"; ramp?: string }) {
  const hc = cellW > 170 ? 8 : 4;
  return (
    <div className="absolute inset-0 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${Math.min(cores.length, hc)}, minmax(0,1fr))`, gridTemplateRows: `repeat(${Math.ceil(cores.length / hc)}, minmax(0,1fr))`, maxHeight: Math.ceil(cores.length / hc) * 16 }}>
      {cores.map((v, ci) =>
        view === "bars" ? (
          <div key={ci} className="flex min-h-0 flex-col justify-end overflow-hidden rounded-[3px] bg-[color:var(--w-track)]">
            <div className="h-full transition-transform duration-700" style={{ ...scaleY(Math.max(6, v)), background: "var(--accent)" }} />
          </div>
        ) : (
          <div key={ci} title={`Core ${ci + 1} · ${fmt(v, 0)}%`} className="min-h-0 rounded-[3px]" style={{ background: heat(v, ramp ?? "accent") }} />
        )
      )}
    </div>
  );
}

/** The drives as used-space bars with their details, as many as fit `h`. */
function DriveList({ drives, h }: { drives: Drive[]; h: number }) {
  const rowH = drives.some((d) => d.details.length) ? 44 : 30;
  const shown = drives.slice(0, useFitRows(h, rowH - 6, 6));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
      {shown.map((d) => (
        <div key={d.id} className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-baseline justify-between gap-2 text-[11px]">
            <span className="min-w-0 truncate text-[color:var(--w-fg)]" title={d.name}>
              {d.name}
            </span>
            <span className="shrink-0 font-semibold tabular-nums" style={d.t !== "ok" ? { color: TONES[d.t] } : undefined}>
              {d.text}
            </span>
          </div>
          <Bar value={d.used} t={d.t} className="h-1.5 shrink-0" />
          {d.details.length > 0 && <DetailLine stats={d.details} />}
        </div>
      ))}
    </div>
  );
}

/** Details as one line: "64°C · 120 W · Hotspot 80°C", warnings tinted. */
function DetailLine({ stats, width }: { stats: Stat[]; width?: number }) {
  // with a known width, drop the stats that would run past it (~6.2px a character) instead of letting the line truncate mid-stat
  if (width !== undefined && width > 0) {
    let used = 0;
    stats = stats.filter((s, i) => (used += (inline(s).length + (i > 0 ? 3 : 0)) * 6.2) <= width || i === 0);
  }
  return (
    <span className="truncate text-[11px] tabular-nums text-[color:var(--w-faint)]">
      {stats.map((s, i) => (
        <span key={s.l} style={s.t && s.t !== "ok" ? { color: TONES[s.t], fontWeight: 600 } : undefined}>
          {i > 0 && " · "}
          {inline(s)}
        </span>
      ))}
    </span>
  );
}

export default function SystemOverview(p: SystemOverviewProps) {
  const sk = useSkin();
  const d = p.data;
  const cpu = hw(d).cpu,
    gpu = hw(d).gpu;
  const r = readSystemFlat(d, p.names);
  const rk = systemKeysFlat(d);
  const tag = useIpTag();
  const has = (k: string) => (get(d, k) !== "" ? k : undefined);
  const adapters = readAdaptersFlat(d, p.names);
  const L = (k: string) => num(get(d, `libre.${k}`));
  const C = (k: string) => L(`${cpu}_${k}`),
    G = (k: string) => L(`${gpu}_${k}`);
  const dec = p.decimals === 1 ? 1 : 0;
  const on = (k: Detail) => p.show?.[k] !== false;
  const warn = p.warn ?? 80,
    crit = p.crit ?? 92;
  const tempWarn = p.tempWarn ?? 80,
    tempCrit = p.tempCrit ?? 90,
    capWarn = p.vramWarn ?? warn,
    capCrit = p.vramCrit ?? crit;
  const pct = (v: number) => `${fmt(v, dec)}%`;
  // Thresholds are in °C; the text follows the chosen unit.
  const temp = (l: string, c: number | undefined, bare = false, k?: string): Stat[] => (c === undefined ? [] : [{ l, v: formatTemp(c, p.tempUnit ?? "c", dec), t: tone(c, tempWarn, tempCrit), bare, k: p.tempUnit === "f" ? undefined : k }]);
  const stat = (show: boolean, value: number | undefined, s: (v: number) => Stat | null): Stat[] => {
    const out = show && value !== undefined && Number.isFinite(value) ? s(value) : null;
    return out ? [out] : [];
  };

  const cores = r.cpu.cores;
  const adapter = pickAdapter(adapters, "");
  const net = adapter?.id;
  const vr = r.gpu.vram,
    page = r.ram.page;
  const drives: Drive[] = filterDisks(r.disks, p.diskFilter ?? "").map((x: DiskReading) => ({
    id: x.id,
    name: driveName(x.name),
    used: x.used ?? NaN,
    text: x.used === undefined ? "–" : pct(x.used),
    t: tone(x.used ?? NaN, capWarn, capCrit),
    details: [
      ...(on("diskTemp") ? temp("Temp", x.temp, true) : []),
      ...stat(on("diskIo"), x.read, (v) => ({ l: "R", v: fmtRate(v) })),
      ...stat(on("diskIo"), x.write, (v) => ({ l: "W", v: fmtRate(v) })),
      ...stat(on("diskLife"), x.life, (v) => ({ l: "Life", v: `${fmt(v, 0)}%` })),
    ],
  }));
  const fullest = drives.filter((x) => Number.isFinite(x.used)).sort((a, b) => b.used - a.used)[0];

  const ALL: Record<Section, SectionData> = {
    cpu: {
      v: r.cpu.load ?? NaN,
      name: on("names") ? (r.cpu.name ?? pretty(cpu ?? "")).replace(/^AMD Ryzen/, "Ryzen") : "",
      stats: [
        ...(on("temps") ? temp("Temp", r.cpu.temp, true, rk.cpuTemp) : []),
        ...stat(on("power"), r.cpu.power, (v) => ({ l: "Power", v: `${fmt(v, 0)} W`, bare: true, k: rk.cpuPower })),
        // a clock sensor reading 0 is a missing one
        ...stat(true, C("cores__average_effective"), (v) => (v > 0 ? { l: "Clock", v: `${fmt(v / 1000, 2)} GHz`, k: `libre.${cpu}_cores__average_effective`, mul: 0.001 } : null)),
        ...stat(true, C("cpu_core_max"), (v) => ({ l: "Max core", v: `${fmt(v, 0)}%`, k: `libre.${cpu}_cpu_core_max` })),
      ],
      present: r.cpu.load !== undefined,
      key: has("system.cpu.load") ?? rk.cpuLoad,
    },
    gpu: {
      v: r.gpu.load ?? NaN,
      name: on("names") ? (get(d, "plugins.InfoPanel.RTSS.rtss.gpu-name") || r.gpu.name || pretty(gpu ?? "")).replace(/^NVIDIA /, "") : "",
      stats: [
        ...(on("temps") ? temp("Temp", r.gpu.temp, true, rk.gpuTemp) : []),
        ...(on("hotspot") ? temp("Hotspot", r.gpu.hotspot, false, rk.gpuHotspot) : []),
        ...stat(on("power"), r.gpu.power, (v) => ({ l: "Power", v: `${fmt(v, 0)} W`, bare: true, k: rk.gpuPower })),
        ...stat(on("powerLimit"), r.gpu.powerLimit, (v) => ({ l: "Limit", v: `${fmt(v, 0)}%`, k: rk.gpuPowerLimit })),
        ...stat(on("clock"), r.gpu.clock, (v) => ({ l: "Clock", v: `${fmt(v, 0)} MHz`, bare: true, k: rk.gpuClock })),
        ...stat(on("memClock"), r.gpu.memClock, (v) => ({ l: "Mem", v: `${fmt(v, 0)} MHz`, k: rk.gpuMemClock })),
        ...(on("fans") && r.gpu.load !== undefined ? [{ l: "Fans", v: r.gpu.fanRpm !== undefined ? `${fmt(r.gpu.fanRpm, 0)} rpm${r.gpu.fanPct !== undefined ? ` · ${fmt(r.gpu.fanPct, 0)}%` : ""}` : "idle" }] : []),
      ],
      present: r.gpu.load !== undefined,
      key: rk.gpuLoad,
    },
    ram: {
      v: r.ram.load ?? NaN,
      name: on("memory") && r.ram.used !== undefined && r.ram.total !== undefined ? `${gb(r.ram.used)} / ${gb(r.ram.total)} GB` : "",
      stats: [
        ...stat(on("memory"), L("total_memory_memory_available"), (v) => ({ l: "Free", v: `${fmt(v, 1)} GB`, k: "libre.total_memory_memory_available" })),
        ...(on("pageFile") && page?.used !== undefined && page.total !== undefined ? [{ l: "Page", v: `${gb(page.used)} / ${gb(page.total)} GB` }] : []),
        ...stat(on("pageFile"), page?.load, (v) => ({ l: "Page load", v: pct(v), k: rk.pageLoad })),
      ],
      present: r.ram.load !== undefined,
      key: has("system.ram.load") ?? has("libre.total_memory_memory"),
    },
    vram: {
      v: vr.load ?? NaN,
      name: on("memory") && vr.used !== undefined && vr.total !== undefined ? `${gb(vr.used)} / ${gb(vr.total)} GB` : "",
      stats: [
        ...stat(on("memory"), G("gpu_memory_free"), (v) => ({ l: "Free", v: `${fmt(v / 1024, 1)} GB`, k: `libre.${gpu}_gpu_memory_free`, mul: 1 / 1024 })),
        ...stat(true, G("gpu_memory_controller"), (v) => ({ l: "Ctrl", v: `${fmt(v, 0)}%`, k: `libre.${gpu}_gpu_memory_controller` })),
      ],
      capacity: true,
      key: rk.vramLoad,
      present: vr.load !== undefined,
    },
    disk: { v: fullest?.used ?? NaN, name: fullest?.name ?? "", stats: [], capacity: true, present: drives.length > 0 },
    net: { v: Number.isFinite(L(`${net}_network_utilization`)) ? L(`${net}_network_utilization`) : (L(`${net}_download_speed`) / 312.5e6) * 100, name: pretty(net ?? ""), big: fmtRate(L(`${net}_download_speed`)), stats: [{ l: "Down", v: fmtRate(L(`${net}_download_speed`)) }, { l: "Up", v: fmtRate(L(`${net}_upload_speed`)) }, { l: "Total ↓", v: `${fmt(L(`${net}_data_downloaded`), 1)} GB` }], present: !!net },
  };
  const len = Math.max(12, Math.round(p.historyLength ?? 60));
  const H: Record<Section, number[]> = { cpu: useHistory(ALL.cpu.v, len), gpu: useHistory(ALL.gpu.v, len), ram: useHistory(ALL.ram.v, len), vram: useHistory(ALL.vram.v, len), disk: useHistory(ALL.disk.v, len), net: useHistory(ALL.net.v, len) };
  // A section the machine does not report (no GPU, no drives) is left out.
  const keys = (p.sections ?? (["cpu", "gpu", "ram"] as Section[])).filter((k) => ALL[k]?.present);
  const label = (k: Section) => p.labels?.[k] || LABEL[k];
  const skinned = p.skin && p.skin !== "default";
  const col = (k: Section): string | undefined => (p.unifiedColor ? undefined : p.colors?.[k] || (skinned ? (p.skin === "ink" ? undefined : sectionColor(k)) : DEF[k]));
  const vars = (k: Section) => (col(k) ? ({ "--accent": col(k) } as CSSProperties) : undefined);
  const toneOf = (k: Section) => (ALL[k].capacity ? tone(ALL[k].v, capWarn, capCrit) : tone(ALL[k].v, warn, crit));
  const shown = (k: Section) => ALL[k].big ?? pct(ALL[k].v);
  const coreView = p.coreView ?? "heatmap";
  const sparkline = p.sparkline !== false;
  const lead = ALL[keys[0] ?? "cpu"];

  // Graphs / Gauges: the picked drive and adapter, each metric on its own scale.
  const diskValue = p.diskValue ?? "activity",
    netDirection = p.netDirection ?? "down";
  const pickedDisk = pickDisk(filterDisks(r.disks, p.diskFilter ?? ""), p.diskPick);
  const pickedNet = pickAdapter(adapters, p.netAdapter);
  const mv: Record<Section, number> = {
    cpu: ALL.cpu.v,
    gpu: ALL.gpu.v,
    ram: ALL.ram.v,
    vram: ALL.vram.v,
    disk: pickedDisk ? diskMetric(pickedDisk, diskValue) : NaN,
    net: pickedNet ? netMetric(pickedNet, netDirection) : NaN,
  };
  const HM: Record<Section, number[]> = { cpu: useHistory(mv.cpu, len), gpu: useHistory(mv.gpu, len), ram: useHistory(mv.ram, len), vram: useHistory(mv.vram, len), disk: useHistory(mv.disk, len), net: useHistory(mv.net, len) };
  const metricRow = (k: Section): MetricRow => {
    const isRate = k === "net" || (k === "disk" && diskValue === "rate");
    const top = isRate ? rateTop(HM[k], k === "net" ? p.netMax : 0, k === "net" ? undefined : 1e6) : 100;
    const [num, ...unit] = isRate ? fmtRate(mv[k]).split(" ") : [fmt(mv[k], dec), "%"];
    const t: Tone = isRate ? "ok" : k === "vram" || (k === "disk" && diskValue === "used") ? tone(mv[k], capWarn, capCrit) : tone(mv[k], warn, crit);
    return { key: k, label: label(k), text: isRate ? fmtRate(mv[k]) : pct(mv[k]), num, unit: unit.join(" "), value: mv[k], top, hist: HM[k], tone: t, style: vars(k) };
  };

  return (
    <Widget
      {...shell(p)}
      showHeader={!!p.title}
      title={p.title}
      icon="dashboard"
      studio={{ label: "System", value: lead.v, unit: "%", sub: lead.name, hist: H[keys[0] ?? "cpu"], min: 0, max: 100, rows: keys.map((k) => ({ n: label(k), v: shown(k), pct: ALL[k].v })) }}
    >
      {({ w, h, shape }) => {
        if (keys.length === 0) return <Empty icon="dashboard" label="No system data" />;
        // 1×1: concentric activity rings
        if (shape === "tile") {
          // VRAM is a detail of the GPU at this size: the three rings are the loads (CPU, GPU, RAM), amber / red when hot.
          const rings = keys.filter((k) => k !== "vram").slice(0, 3);
          return (
            <div className="flex h-full items-center gap-2" style={{ "--sys-base": "var(--accent)" } as CSSProperties}>
              <RingStack
                rings={rings.map((k) => {
                  const c = toneOf(k) === "ok" ? col(k) ?? "var(--accent)" : TONES[toneOf(k)];
                  return { v: Math.min(100, ALL[k].v), color: c, track: `color-mix(in oklab, ${c} 16%, transparent)` };
                })}
                thickness={10}
                gap={3}
                className="h-full min-w-0 flex-1"
              />
              {w - h > 60 && (
                <div className="flex shrink-0 flex-col gap-1">
                  {rings.map((k) => (
                    <span key={k} className="flex items-baseline gap-1.5 text-[11px]" style={vars(k)}>
                      <span className="text-[color:var(--w-faint)]">{label(k)}</span>
                      <Num className="text-[color:var(--accent)]">{fmt(ALL[k].v, dec)}%</Num>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        }
        if (p.view === "graphs" || p.view === "gauges") {
          const View = p.view === "graphs" ? MetricGraphs : MetricGauges;
          return <View rows={keys.map((k) => metricRow(k))} w={w} h={h} />;
        }
        const ratio = w / Math.max(1, h);
        // one row of sections only while each keeps room for its ring (~150px); else two columns
        const cols = shape === "column" || ratio < 0.8 ? 1 : keys.length <= 2 || (ratio > 1.9 && (w - (keys.length - 1) * 18) / keys.length >= 150) ? keys.length : 2;
        const rowsN = Math.ceil(keys.length / cols);
        const cellH = (h - (rowsN - 1) * 14) / rowsN,
          cellW = (w - (cols - 1) * 18) / cols;
        const level = p.details && p.details !== "auto" ? p.details : cellH < 92 ? "min" : cellH < 170 ? "mid" : "full";
        const ring = p.ring !== "none" && cellW > 130 && cellH > 54;
        // a cell under ~62px keeps the label and value on one line, one under ~40px drops the name / detail line under them
        const stacked = cellW < 120 && (h <= 0 || cellH >= 62),
          roomy = h <= 0 || cellH >= 40;
        const rpx = Math.round(Math.max(40, Math.min(level === "min" ? cellH - 8 : 86, cellH * 0.42, cellW * 0.34)));
        return (
          <div className="grid h-full" style={{ "--sys-base": "var(--accent)", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${rowsN}, minmax(0,1fr))`, columnGap: 18, rowGap: 14 } as CSSProperties}>
            {keys.map((k) => {
              const s = ALL[k],
                t = toneOf(k),
                big = shown(k);
              const showCores = k === "cpu" && coreView !== "off" && cores.length > 0;
              const showSpark = sparkline && k !== "disk";
              const showBar = k === "vram" || k === "ram";
              // Below "full" the details shrink to one line; at "min" it stands in for a hidden name.
              const detailLine = roomy && level !== "full" && s.stats.length > 0 && (level === "mid" || !s.name);
              const headH = Math.max(ring ? rpx : 34, 34);
              return (
                <section key={k} style={vars(k)} className="flex min-h-0 min-w-0 flex-col gap-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    {ring && (
                      <div className="shrink-0" style={{ width: rpx, height: rpx }}>
                        <Ring ipKey={s.key} value={s.v} t={t} thickness={9} className="h-full w-full">
                          <Num ipKey={s.key} ipUnit="" style={{ fontSize: rpx * 0.3 }}>{fmt(s.v, 0)}</Num>
                        </Ring>
                      </div>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className={`flex min-w-0 gap-x-2 ${stacked ? "flex-col gap-y-1" : "items-baseline"}`}>
                        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--w-muted)]">{label(k)}</span>
                        <Num ipKey={s.big ? undefined : s.key} className="whitespace-nowrap leading-none" style={{ fontSize: Math.max(12, Math.min(20, (cellW - (ring ? rpx + 12 : 0) - (stacked ? 0 : 44) - 2) / (big.length * 0.68 * (sk.numWide ?? 1)))), color: t === "ok" ? "var(--accent)" : TONES[t] }}>
                          {big}
                        </Num>
                      </div>
                      {s.name && roomy && <span className="truncate text-[11px] text-[color:var(--w-faint)]">{s.name}</span>}
                      {detailLine && <DetailLine stats={s.stats} width={cellW - (ring ? rpx + 12 : 0)} />}
                    </div>
                  </div>
                  {level === "full" && s.stats.length > 0 && (
                    <div className="grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: cellW < 230 ? "minmax(0,1fr)" : "repeat(2, minmax(0,1fr))" }}>
                      {s.stats.slice(0, Math.max(2, Math.min(cellW < 130 ? 2 : cellW < 230 ? 3 : 6, Math.floor((cellH - headH - 40) / (cellW < 130 ? 28 : 18)) * (cellW < 230 ? 1 : 2)))).map(({ l, v, t: st, k: sk2, mul }) =>
                        cellW < 130 ? (
                          <div key={l} className="flex min-w-0 flex-col whitespace-nowrap text-[11px] leading-tight">
                            <span className="truncate text-[color:var(--w-faint)]">{l}</span>
                            <span {...tag(sk2, { mul })} className="truncate tabular-nums text-[color:var(--w-fg)]" style={st && st !== "ok" ? { color: TONES[st] } : undefined}>
                              {v}
                            </span>
                          </div>
                        ) : (
                          <div key={l} className="flex min-w-0 items-baseline justify-between gap-2 whitespace-nowrap text-[11.5px]">
                            <span className="min-w-0 truncate text-[color:var(--w-faint)]">{l}</span>
                            <span {...tag(sk2, { mul })} className="shrink-0 text-right tabular-nums text-[color:var(--w-fg)]" style={st && st !== "ok" ? { color: TONES[st] } : undefined}>
                              {v}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  )}
                  {level !== "min" && k === "disk" && <DriveList drives={drives} h={cellH - headH - 10} />}
                  {level !== "min" && k !== "disk" && (showCores || showSpark || showBar) && (
                    <div className="relative mt-auto min-h-[14px] flex-1 overflow-hidden">
                      {showCores ? (
                        showSpark && level === "full" ? (
                          <div className="absolute inset-0 flex flex-col gap-1.5">
                            <Spark ipKey={ALL.cpu.key} values={H.cpu} min={0} max={100} className="h-5 shrink-0" />
                            <div className="relative min-h-0 flex-1">
                              <CoreGrid cores={cores} cellW={cellW} view={coreView} ramp={p.heatRamp} />
                            </div>
                          </div>
                        ) : (
                          <CoreGrid cores={cores} cellW={cellW} view={coreView} ramp={p.heatRamp} />
                        )
                      ) : (
                        <div className="absolute inset-x-0 bottom-0 flex h-full max-h-12 flex-col justify-end gap-1.5">
                          {showSpark && <Spark ipKey={k === "net" ? undefined : s.key} values={H[k]} min={0} max={k === "net" ? undefined : 100} className="min-h-0 flex-1" />}
                          {showBar && <Bar ipKey={s.key} value={s.v} t={t} className="h-1.5 shrink-0" />}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        );
      }}
    </Widget>
  );
}
