// KPI Tiles' cards view: metric cards that reflow into a row, grid or stack, drawn as the Vitals widget drew them before
// it merged into KPI Tiles (config v19).
import { readSystemFlat } from "@/lib/system-metrics";
import type { ModuleSettings } from "@/modules/types";
import { SKINS } from "../core/theme";
import { fitFontPx } from "../fit-font";
import { Unit, bodyGap, fitRows, Widget, shell, get, num, fmt, fmtRate, rateParts, toMBps, detect, Spark, useHistory, useSkin, tone, TONES, hw, type ShellProps } from "../kit";

type Metric = "cpu" | "gpu" | "ram" | "net" | "vram" | "fps";
interface Vital {
  label: string;
  v: number;
  unit: string;
  /** The number as shown, where the unit scales with the value (a throughput). */
  text?: string;
  max?: number;
  sub: string;
}

export interface VitalsProps extends ShellProps {
  look?: ModuleSettings;
  metrics?: Metric[];
}

/** One metric card. A braille graph is text, so it takes its own rows above the value instead of sitting behind it. */
function VitalCard({ m, hist, w, h, tui }: { m: Vital; hist: number[]; w: number; h: number; tui: boolean }) {
  const braille = useSkin().graph === "braille";
  const t = m.max ? tone(m.v, 75, 90) : "ok";
  const text = m.text ?? fmt(m.v, 0);
  // short cards trade vertical padding for numeral height
  const padY = h - 33 < 13 ? 4 : 8;
  // the padding + the 13px label line + 4px under the value leave the rest to the numerals
  // a card tall enough for it gives the graph its own bottom third, so the line never crosses the numerals
  const split = !braille && h >= 76 && h < 110;
  const sparkH = split ? Math.round(h * 0.34) : 0;
  // a card too short to split keeps the graph behind its text, so the text gets a plate: a halo in the surface's colour (the text colour with its lightness flipped)
  const halo = "oklch(from var(--w-fg) calc(1 - l) 0 0 / 0.9)";
  const plate = !braille && h > 0 && h < 76 ? { textShadow: `0 0 5px ${halo}, 0 0 5px ${halo}, 0 0 2px ${halo}` } : null;
  const maxFs = Math.max(10, Math.min(24, Math.floor(h - sparkH - padY * 2 - 17)));
  // the tui skin sets everything in a wide monospace face: fit the numerals with wider glyphs and drop the sub line sooner
  const fs = fitFontPx(w - 24, text.length + m.unit.length * 0.5, 10, maxFs, tui ? 0.72 : 0.62);
  // one 10px braille row under a 4px gap
  const graphRows = braille && h - padY * 2 - 13 - (fs + 4) >= 14;
  return (
    <div className="relative flex min-w-0 flex-col overflow-hidden rounded-xl bg-[color:var(--w-track)] px-3" style={{ paddingTop: padY, paddingBottom: padY + sparkH }}>
      {!braille && <Spark values={hist} min={0} max={m.max} grid={false} className={`absolute inset-x-0 bottom-0 opacity-80 ${split ? "h-[34%]" : "h-1/2"}`} />}
      <div className="relative flex items-baseline justify-between gap-2 leading-3.25" style={plate ?? undefined}>
        <span className={`min-w-0 truncate text-micro font-medium uppercase ${tui ? "" : "tracking-[0.08em]"} text-[color:var(--w-muted)]`}>{m.label}</span>
        {w > (tui ? 170 : 110) && <span className="truncate text-micro text-[color:var(--w-faint)]">{m.sub}</span>}
      </div>
      {graphRows && <Spark values={hist} min={0} max={m.max} grid={false} className="mt-1 min-h-0 flex-1 opacity-80" />}
      <span className="relative mt-auto block max-w-full overflow-hidden text-ellipsis whitespace-nowrap pb-1 font-semibold leading-none tabular-nums" style={{ fontSize: fs, ...plate, ...(t !== "ok" ? { color: TONES[t] } : null) }}>
        {text}
        <Unit>{m.unit}</Unit>
      </span>
    </div>
  );
}

export default function Vitals(p: VitalsProps) {
  const d = p.data;
  const cpu = hw(d).cpu,
    gpu = hw(d).gpu;
  const libreOf = (k: string) => num(get(d, `libre.${k}`));
  const net = detect(d, /^libre\.(.+)_download_speed$/).reduce((a, n) => a + (libreOf(`${n}_download_speed`) || 0), 0);
  const up = detect(d, /^libre\.(.+)_upload_speed$/).reduce((a, n) => a + (libreOf(`${n}_upload_speed`) || 0), 0);
  const rate = rateParts(net);
  const all: Record<Metric, Vital> = {
    cpu: { label: "CPU", v: libreOf(`${cpu}_cpu_total`), unit: "%", max: 100, sub: `${fmt(readSystemFlat(d ?? {}).cpu.temp ?? NaN, 0)}°C` },
    gpu: { label: "GPU", v: libreOf(`${gpu}_gpu_core_load`), unit: "%", max: 100, sub: `${fmt(libreOf(`${gpu}_gpu_core`), 0)}°C` },
    ram: { label: "RAM", v: libreOf("total_memory_memory"), unit: "%", max: 100, sub: `${fmt(libreOf("total_memory_memory_used"), 1)} GB` },
    net: { label: "Net ↓", v: toMBps(net), text: rate.text, unit: rate.unit, sub: `↑ ${fmtRate(up)}` },
    vram: { label: "VRAM", v: (libreOf(`${gpu}_gpu_memory_used`) / libreOf(`${gpu}_gpu_memory_total`)) * 100, unit: "%", max: 100, sub: `${fmt(libreOf(`${gpu}_gpu_memory_used`) / 1024, 1)} GB` },
    fps: { label: "FPS", v: num(get(d, "plugins.InfoPanel.RTSS.rtss.fps")), unit: "", sub: get(d, "plugins.InfoPanel.RTSS.rtss.resolution") },
  };
  const keys = p.metrics ?? (["cpu", "gpu", "ram", "net"] as Metric[]);
  const H: Record<Metric, number[]> = { cpu: useHistory(all.cpu.v), gpu: useHistory(all.gpu.v), ram: useHistory(all.ram.v), net: useHistory(all.net.v), vram: useHistory(all.vram.v), fps: useHistory(all.fps.v) };
  return (
    <Widget
      {...shell(p)}
      showHeader={false}
      studio={{ label: "Vitals", value: all.cpu.v, unit: "%", sub: "CPU", hist: H.cpu, min: 0, max: 100, rows: keys.map((k) => ({ n: all[k].label, v: `${all[k].text ?? fmt(all[k].v, 0)} ${all[k].unit}`, pct: all[k].max ? all[k].v : undefined })) }}
      compact={(box) => (box.shape === "tile" ? { label: "CPU · GPU", value: all.cpu.v, unit: "%", sub: `GPU ${fmt(all.gpu.v, 0)}% · RAM ${fmt(all.ram.v, 0)}%`, hist: H.cpu, min: 0, max: 100, icon: "vital_signs" } : undefined)}
    >
      {({ w, h }) => {
        const gx = bodyGap(p.look, 8, w),
          gy = bodyGap(p.look, 8, h);
        const cols = Math.max(1, Math.min(w / h > 2.4 ? keys.length : w / h < 0.7 ? 1 : 2, Math.floor((w + gx) / (60 + gx))));
        const shown = keys.slice(0, cols * fitRows(h, 34, gy));
        const cardW = (w - (cols - 1) * gx) / cols;
        const rows = Math.ceil(shown.length / cols);
        const cardH = (h - (rows - 1) * gy) / rows;
        return (
          <div className="grid h-full gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: "minmax(0,1fr)" }}>
            {shown.map((k) => (
              <VitalCard key={k} m={all[k]} hist={H[k]} w={cardW} h={cardH} tui={!!SKINS[p.skin ?? "default"]?.boxed} />
            ))}
          </div>
        );
      }}
    </Widget>
  );
}
