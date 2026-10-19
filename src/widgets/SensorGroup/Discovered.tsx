// SensorGroup in auto-discovery mode: every `libre.*` / `hwinfo.*` reading as a dot-and-value row,
// temperatures first, then fans, power and the rest (the hardware list).
import { cn } from "@/lib/utils";
import { inUnit } from "@/modules/setting-readers";
import { useFitRows, Widget, shell, Num, Empty, STATE } from "../kit";
import { readings, type Reading, type ReadingKind } from "../hardware-readings";
import type { SensorGroupProps } from "../SensorGroup";

const DOTS: Record<ReadingKind, string> = { temp: STATE.crit, fan: "#38bdf8", power: STATE.warn, other: "var(--accent)" };
const GAP = 6;

/** A °C temperature in °F when the unit is f (to one decimal, as the list reads), else as read. */
function inTempUnit(r: Reading, unit: SensorGroupProps["tempUnit"]): Reading {
  if (unit !== "f" || r.kind !== "temp" || !/^°C?$/.test(r.unit) || !Number.isFinite(r.value)) return r;
  const value = inUnit(r.value, "f");
  return { ...r, value, unit: "°F", text: `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} °F` };
}

export default function Discovered(p: SensorGroupProps) {
  const all = readings(p.data, p.names).map((r) => inTempUnit(r, p.tempUnit));
  const list = p.maxRows && p.maxRows > 0 ? all.slice(0, p.maxRows) : all;
  const dot = (r: Reading) => (p.tempColor && r.kind === "temp" ? p.tempColor : p.fanColor && r.kind === "fan" ? p.fanColor : p.powerColor && r.kind === "power" ? p.powerColor : DOTS[r.kind]);
  const first = list[0];
  if (!first)
    return (
      <Widget {...shell(p)} title={p.title ?? "Hardware"} icon="view_list">
        <Empty />
      </Widget>
    );
  // No compact view: a small zone keeps the rows (as many as fit), never a lone headline value.
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Hardware"}
      icon="view_list"
      showHeader={!!p.title}
      studio={{ label: p.title ?? "Hardware", value: first.value, unit: first.unit, sub: first.label, rows: list.map((r) => ({ n: r.label, v: r.text })) }}
    >
      {({ w, h }) => {
        const cols = w < 260 ? 1 : w < 420 ? 2 : 3;
        const small = h > 0 && h < 120;
        const fit = h > 0 ? useFitRows(h, small ? 24 : 32, GAP) : Infinity;
        return (
          <div className="grid h-full auto-rows-min content-start overflow-hidden" style={{ gap: GAP, gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
            {list.slice(0, fit * cols).map((r) => (
              <div key={r.key} className={cn("flex min-w-0 items-center gap-2 rounded-lg bg-[color:var(--w-track)] px-2.5", small ? "py-0.5" : "py-1.5")}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot(r) }} />
                <span className={cn("min-w-0 truncate text-[color:var(--w-fg)]", small ? "text-[10px]" : "text-xs")} title={r.label}>
                  {r.label}
                </span>
                <Num className={cn("ml-auto shrink-0 font-semibold", small ? "text-xs" : "text-sm")} weight={600}>
                  {r.text}
                </Num>
              </div>
            ))}
          </div>
        );
      }}
    </Widget>
  );
}
