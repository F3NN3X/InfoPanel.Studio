// System Overview's `power` layout (look.json `layouts`, src/widgets/layouts.ts): the kit's power draw. The CPU and GPU draw together as
// a large readout with the GPU's share of its power limit as a chip, the two as parts of a stacked bar, then one tick-ruler row per
// section (its load, with its own watts or memory in use beside it), and the temperatures as a mono footer. The readings are the
// standard layout's (`readSystemFlat`) and its colours the theme's series ones; a reading the hardware does not report is left out.
import { useLayoutEffect, useRef, type RefObject } from "react";
import { readSystemFlat } from "@/lib/system-metrics";
import { DEFAULT_ACCENT } from "@/looks/palette";
import { Widget, shell, fmt, ShareBar, seriesColour, Empty } from "../kit";
import { t3Tokens } from "../core/t3-tokens";
import { RulerRow, ToneChip } from "../shared/layout-kit";
import { Reading, SectionLabel } from "../shared/layout-parts";
import type { Section, SystemOverviewProps } from "./SystemOverview";

const LABEL: Partial<Record<Section, string>> = { cpu: "CPU", gpu: "GPU", ram: "RAM", vram: "VRAM" };
const SERIES: Partial<Record<Section, 1 | 2 | 3 | 4>> = { cpu: 1, gpu: 2, ram: 3, vram: 4 };

const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(hi, v));
const watts = (w?: number) => (w === undefined ? undefined : `${fmt(w, 0)} W`);

/**
 * Hides the rows of `ref` from the first that does not fit its box whole, so a ruler row never runs under the temperatures or out of
 * the card. The rows are measured, not counted at one height: the readout above them grows with the card, and a Look's type with it.
 * It fits after every render and when the box resizes (the box takes the room the parts around it leave, so hiding a row never resizes it).
 */
function useWholeRows(ref: RefObject<HTMLDivElement | null>): void {
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    const rows = Array.from(el.children) as HTMLElement[];
    for (const r of rows) r.style.display = "";
    const bottom = el.getBoundingClientRect().bottom;
    const cut = rows.findIndex((r) => r.getBoundingClientRect().bottom > bottom + 0.5);
    if (cut >= 0) for (const r of rows.slice(cut)) r.style.display = "none";
  };
  const latest = useRef(fit);
  latest.current = fit;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => latest.current());
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  useLayoutEffect(fit);
}

export function SystemPower(p: SystemOverviewProps) {
  const r = readSystemFlat(p.data ?? {}, p.names);
  const marks = t3Tokens(p.t3);
  const colorOf = (k: Section) => p.colors?.[k] || seriesColour(marks, SERIES[k] ?? 1, k === "cpu" ? "var(--w-accent)" : DEFAULT_ACCENT);
  const sections = (p.sections ?? ["cpu", "gpu", "ram"]).filter((s) => s in LABEL);
  const rows = sections.flatMap((k): { k: Section; label: string; pct: number; value: string }[] => {
    const label = p.labels?.[k] || LABEL[k]!;
    if (k === "cpu" || k === "gpu") {
      const dev = r[k];
      return dev.load === undefined ? [] : [{ k, label, pct: dev.load, value: [watts(dev.power), `${fmt(dev.load, 0)}%`].filter(Boolean).join(" · ") }];
    }
    const mem = k === "ram" ? r.ram : r.gpu.vram;
    return mem.load === undefined ? [] : [{ k, label, pct: mem.load, value: mem.used !== undefined && mem.total ? `${fmt(mem.used, 1)} / ${fmt(mem.total, 0)} GB` : `${fmt(mem.load, 0)}%` }];
  });
  const cpuW = r.cpu.power ?? 0;
  const gpuW = r.gpu.power ?? 0;
  const total = cpuW + gpuW;
  const temps = [r.cpu.temp !== undefined && `CPU ${fmt(r.cpu.temp, 0)}°C`, r.gpu.temp !== undefined && `GPU ${fmt(r.gpu.temp, 0)}°C`].filter(Boolean).join(" // ");
  const list = useRef<HTMLDivElement | null>(null);
  useWholeRows(list);
  return (
    <Widget {...shell(p)} showHeader={!!p.title} title={p.title} icon="monitor_heart" compact={{ label: "Power draw", value: fmt(total, 0), unit: "W", sub: `CPU ${fmt(cpuW, 0)} · GPU ${fmt(gpuW, 0)}`, icon: "bolt" }}>
      {({ w, h }) => {
        if (!rows.length && total === 0) return <Empty icon="monitor_heart" label="No system readings" />;
        const px = clamp(22, Math.min(w / 6, h * 0.14), 64);
        return (
          <div data-layout="power" className="flex h-full min-h-0 min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <SectionLabel right={r.gpu.powerLimit !== undefined && <ToneChip tone="ok">{`GPU ${fmt(r.gpu.powerLimit, 0)}% of limit`}</ToneChip>}>Power draw</SectionLabel>
              <Reading value={total} decimals={0} unit="W" px={px} />
            </div>
            {total > 0 && (
              <ShareBar
                parts={[
                  { pct: (cpuW / total) * 100, color: colorOf("cpu") },
                  { pct: (gpuW / total) * 100, color: colorOf("gpu") },
                ]}
              />
            )}
            {/* the rows take the room the readout, the bar and the temperatures leave, and show the ones that fit it whole (useWholeRows) */}
            <div ref={list} className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 pt-2">
              {rows.map((row) => (
                <RulerRow key={row.k} label={row.label} value={row.value} pct={row.pct} color={colorOf(row.k)} />
              ))}
            </div>
            {temps && h >= 220 && (
              <div data-part="mono" className="flex min-w-0 shrink-0 justify-between gap-3 border-t border-[color:color-mix(in_srgb,var(--w-accent)_35%,transparent)] pt-1.5 text-micro uppercase tracking-[0.06em] text-[color:var(--w-muted)]">
                <span className="truncate">{temps}</span>
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
