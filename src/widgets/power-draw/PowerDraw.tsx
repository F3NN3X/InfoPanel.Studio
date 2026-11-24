import { readSystemFlat } from "@/lib/system-metrics";
import type { ModuleSettings } from "@/modules/types";
import { Unit, roomy, StatGrid, Widget, shell, get, num, fmt, unitStat, Spark, useHistory, hue, hw, Num, ShareBar, type ShellProps } from "../kit";
import { meta } from "./meta";

export { meta };

export interface PowerDrawProps extends ShellProps {
  look?: ModuleSettings;
  /** Watts the split bar scales to; default 750. */
  budget?: number;
}

export default function PowerDraw(p: PowerDrawProps) {
  const d = p.data;
  const gpu = hw(d).gpu;
  const cw = readSystemFlat(d ?? {}).cpu.power ?? 0,
    gw = num(get(d, `libre.${gpu}_gpu_package`)) || 0;
  const board = num(get(d, `libre.${gpu}_gpu_board_power`));
  const total = cw + gw,
    budget = p.budget ?? 750;
  const hist = useHistory(total);
  const gpuColor = hue(70);
  return (
    <Widget {...shell(p)} title={p.title ?? "Power"} icon="bolt" compact={{ label: "Power", value: total, unit: "W", sub: `CPU ${fmt(cw, 0)} · GPU ${fmt(gw, 0)}`, hist, min: 0 }}>
      {({ size, w, h }) => {
        // Under 260px wide the CPU / GPU split stacks under the total (one per line under 150px); under 96px tall the number shrinks and the graph goes.
        const narrow = w > 0 && w < 260,
          short = h > 0 && h < 96,
          big = roomy(w, h);
        return (
          <div className={`flex h-full min-w-0 flex-col ${short ? "justify-center gap-1.5" : "gap-3"}`}>
            <div className={`flex min-w-0 ${narrow ? "flex-col items-start gap-1" : "items-end justify-between gap-3"}`}>
              <Num className={`${short ? "text-2xl" : size === "lg" ? "text-6xl" : size === "md" ? "text-5xl" : "text-3xl"} font-semibold leading-none tracking-tight`}>
                {fmt(total, 0)}
                <Unit>W</Unit>
              </Num>
              <div className={`flex min-w-0 text-xs ${w > 0 && w < 150 ? "flex-col gap-0.5" : narrow ? "gap-3" : "gap-4"}`}>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: "var(--w-accent)" }} />
                  CPU <b className="tabular-nums">{fmt(cw, 0)}</b>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: gpuColor }} />
                  GPU <b className="tabular-nums">{fmt(gw, 0)}</b>
                </span>
              </div>
            </div>
            <ShareBar parts={[{ pct: (cw / budget) * 100, color: "var(--w-accent)" }, { pct: (gw / budget) * 100, color: gpuColor }]} />
            {size !== "sm" && !short && <Spark values={hist} min={0} marks={big ? "last" : false} axis={big} format={(v) => fmt(v, 0)} className={`min-h-0 flex-1 ${big ? "max-h-[55%]" : ""}`} />}
            {big && !short && hist.length > 1 && <StatGrid cols={3} items={[{ label: "Peak", ...unitStat(Math.max(...hist), "W") }, { label: "Avg", ...unitStat(hist.reduce((a, b) => a + b, 0) / hist.length, "W") }, { label: "Min", ...unitStat(Math.min(...hist), "W") }]} />}
            {size === "lg" && !short && (
              <StatGrid
                cols={3}
                items={[
                  { label: "Budget", ...unitStat(budget, "W") },
                  { label: "Headroom", ...unitStat(budget - total, "W") },
                  { label: "GPU board limit", ...unitStat(board, "%", 1) },
                ]}
              />
            )}
          </div>
        );
      }}
    </Widget>
  );
}
