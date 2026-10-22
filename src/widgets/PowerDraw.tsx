import type { ModuleSettings } from "@/modules/types";
import { StatGrid, Widget, shell, get, num, fmt, Spark, useHistory, hue, hw, Num, stackX, type ShellProps, type WidgetMeta } from "./kit";

export const meta: WidgetMeta = {
  id: "PowerDraw",
  name: "Power Draw",
  category: "Hardware",
  icon: "bolt",
  prefixes: [],
  defaultSize: [2, 1],
  minSize: [1, 1],
  description: "CPU package + GPU package watts, split bar, total history and GPU board-power limit.",
};

export interface PowerDrawProps extends ShellProps {
  look?: ModuleSettings;
  /** Watts the split bar scales to; default 750. */
  budget?: number;
}

export default function PowerDraw(p: PowerDrawProps) {
  const d = p.data;
  const cpu = hw(d).cpu,
    gpu = hw(d).gpu;
  const cw = num(get(d, `libre.${cpu}_package`)) || 0,
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
          short = h > 0 && h < 96;
        return (
          <div className={`flex h-full min-w-0 flex-col ${short ? "justify-center gap-1.5" : "gap-3"}`}>
            <div className={`flex min-w-0 ${narrow ? "flex-col items-start gap-1" : "items-end justify-between gap-3"}`}>
              <Num className={`${short ? "text-2xl" : size === "lg" ? "text-6xl" : size === "md" ? "text-5xl" : "text-3xl"} font-semibold leading-none tracking-tight`}>
                {fmt(total, 0)}
                <span className="ml-1 text-[0.4em] text-[color:var(--w-muted)]">W</span>
              </Num>
              <div className={`flex min-w-0 text-xs ${w > 0 && w < 150 ? "flex-col gap-0.5" : narrow ? "gap-3" : "gap-4"}`}>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: "var(--accent)" }} />
                  CPU <b className="tabular-nums">{fmt(cw, 0)}</b>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: gpuColor }} />
                  GPU <b className="tabular-nums">{fmt(gw, 0)}</b>
                </span>
              </div>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-[color:var(--w-track)]">
              <div className="absolute inset-0 transition-transform duration-700" style={{ ...stackX(0, (cw / budget) * 100), background: "var(--accent)" }} />
              <div className="absolute inset-0 transition-transform duration-700" style={{ ...stackX((cw / budget) * 100, (gw / budget) * 100), background: gpuColor }} />
            </div>
            {size !== "sm" && !short && <Spark values={hist} min={0} className="min-h-0 flex-1" />}
            {size === "lg" && !short && (
              <StatGrid
                cols={3}
                items={[
                  { label: "Budget", value: `${fmt(budget)} W` },
                  { label: "Headroom", value: `${fmt(budget - total, 0)} W` },
                  { label: "GPU board limit", value: `${fmt(board, 1)}%` },
                ]}
              />
            )}
          </div>
        );
      }}
    </Widget>
  );
}
