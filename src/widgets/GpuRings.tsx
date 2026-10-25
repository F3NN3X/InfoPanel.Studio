import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, fmt, pretty, useSkin, numFont, hue, hw, RingStack, LegendRow, useIpTag, type ShellProps, type WidgetMeta } from "./kit";

export const meta: WidgetMeta = {
  id: "GpuRings",
  name: "GPU Rings",
  category: "Hardware",
  icon: "donut_large",
  prefixes: [],
  defaultSize: [3, 2],
  minSize: [1, 1],
  blurb: "GPU load, VRAM and temperature as rings",
  tags: "graphics vram",
  description: "Stacked radial rings for bounded percentages only — VRAM outer, core load inner, temperature in the centre — with a legend of clocks, power and fans.",
};

type Ring = "vram" | "load" | "power" | "fan";

export interface GpuRingsProps extends ShellProps {
  look?: ModuleSettings;
  gpu?: string;
  outer?: Ring;
  inner?: Ring;
  colors?: { outer?: string; inner?: string };
}

export default function GpuRings(p: GpuRingsProps) {
  const d = p.data;
  const sk = useSkin();
  const gpu = p.gpu ?? hw(d).gpu;
  const G = (k: string) => num(get(d, `libre.${gpu}_${k}`));
  const key = (k: string) => `libre.${gpu}_${k}`;
  const tag = useIpTag();
  const vram = (G("gpu_memory_used") / G("gpu_memory_total")) * 100;
  const fans = [1, 2, 3].map((i) => G(`gpu_fan_${i}`)).filter((v) => v > 0),
    duty = G("gpu_fan_1_control");
  // `k`: the Data API key of the ring's value (VRAM is a share of two, so it has none), for the InfoPanel conversion's tags.
  const M: Record<Ring, { l: string; v: number; txt: string; k?: string }> = {
    vram: { l: "VRAM", v: vram, txt: `${fmt(G("gpu_memory_used") / 1024, 1)} / ${fmt(G("gpu_memory_total") / 1024, 1)} GB`, k: get(d, key("gpu_memory")) !== "" ? key("gpu_memory") : undefined },
    load: { l: "Core load", v: G("gpu_core_load"), txt: `${fmt(G("gpu_core_load"), 0)}%`, k: key("gpu_core_load") },
    power: { l: "Board power", v: G("gpu_board_power"), txt: `${fmt(G("gpu_board_power"), 1)}%`, k: key("gpu_board_power") },
    fan: { l: "Fan duty", v: duty, txt: `${fmt(duty, 0)}%`, k: key("gpu_fan_1_control") },
  };
  const outer = M[p.outer ?? "vram"],
    inner = M[p.inner ?? "load"];
  const cO = p.colors?.outer ?? "var(--accent)",
    cI = p.colors?.inner ?? hue(70);
  const legend: [string | null, string, string, string?][] = [
    [cO, outer.l, outer.txt, outer === M.vram ? undefined : outer.k],
    [cI, inner.l, inner.txt, inner === M.vram ? undefined : inner.k],
    [null, "Clock", `${fmt(G("gpu_core_clock"), 0)} MHz`, key("gpu_core_clock")],
    [null, "Power", `${fmt(G("gpu_package"), 1)} W`, key("gpu_package")],
    [null, "Fans", fans.length ? `${fmt(fans.reduce((a, b) => a + b, 0) / fans.length, 0)} RPM · ${fmt(duty, 0)}%` : "idle"],
    [null, "Mem junction", `${fmt(G("gpu_memory_junction"), 0)}°C`, key("gpu_memory_junction")],
  ];
  const name = (get(d, "plugins.InfoPanel.RTSS.rtss.gpu-name") || pretty(gpu ?? "")).replace(/^NVIDIA GeForce /, "");
  const rings = (size: number) => (
    <RingStack rings={[{ v: outer.v, color: cO, ipKey: outer.k }, { v: inner.v, color: cI, ipKey: inner.k }]} thickness={size < 110 ? 6 : 9} gap={3} className="shrink-0" style={{ width: size, height: size }}>
      <b {...tag(key("gpu_core"))} className="font-bold leading-none tabular-nums" style={{ fontSize: size * 0.19, ...numFont(sk) }}>
        {fmt(G("gpu_core"), 0)}°C
      </b>
      {size > 100 && <span className="text-[11px] text-[color:var(--w-muted)]">Core</span>}
    </RingStack>
  );
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? name}
      icon="donut_large"
      studio={{ label: name, value: inner.v, unit: "%", sub: `${fmt(G("gpu_core"), 0)}°C · ${outer.l} ${outer.txt}`, pct: outer.v, rows: legend.map(([, l, v]) => ({ n: l, v })) }}
    >
      {({ w, h }) => {
        const side = w > h * 1.35;
        const size = Math.max(60, Math.min(side ? h : h * 0.55, side ? w * 0.45 : w, 150));
        // a narrow legend wraps long values onto a second 19px line: count rows by the lines they take (12.5px glyphs, 26px for swatch and gaps)
        const avail = side ? h : h - size - 16,
          legendW = (side ? w - size - 16 : w) - 26;
        let rows = 0;
        for (let used = -6; rows < legend.length; rows++) {
          used += Math.max(1, Math.ceil((legend[rows][2].length * 12.5 * 0.62) / Math.max(1, legendW))) * 19 + 6;
          if (used > avail) break;
        }
        rows = Math.max(1, rows);
        return (
          <div className={`flex h-full min-w-0 items-center gap-4 ${side ? "" : "flex-col justify-center"}`}>
            {rings(size)}
            {(side ? w - size > 120 : h - size > 40) && (
              <div className="grid min-w-0 flex-1 gap-1.5 self-stretch content-center">
                {/* by position: both rings may show the same metric */}
                {legend.slice(0, rows).map(([c, l, v, k], i) => (
                  <LegendRow key={i} color={c} label={l} value={legendW < 110 ? v.replace(/ \/ [\d.,]+/, "") : v} tag={tag(k)} />
                ))}
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
