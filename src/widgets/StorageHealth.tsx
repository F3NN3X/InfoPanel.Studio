import type { ModuleSettings } from "@/modules/types";
import { StatGrid, Widget, hue, shell, get, num, fmt, fmtGB, fmtRate, detect, diskShort, firstDisk, Metric, Ring, Spark, Stat, Bar, Num, useHistory, useSkin, tone, Empty, LegendRow, type ShellProps } from "./kit";
import { meta } from "./meta/StorageHealth";

export { meta };

export interface StorageHealthProps extends ShellProps {
  look?: ModuleSettings;
  /** Sensor slug, e.g. "kingston_sfyrd2000g"; default = first detected. */
  disk?: string;
}

/** Read and write history. Two braille text graphs cannot share a box, so under braille they stack below the legend. */
function RateGraph({ rH, wH, rd, wr }: { rH: number[]; wH: number[]; rd: number; wr: number }) {
  const legend = (
    <>
      <LegendRow color="var(--accent)" label="read" value={fmtRate(rd)} className="text-[10px]" />
      <LegendRow color={hue(70)} label="write" value={fmtRate(wr)} className="text-[10px]" />
    </>
  );
  if (useSkin().graph === "braille")
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <div className="grid grid-cols-2 gap-3">{legend}</div>
        <Spark values={rH} min={0} className="min-h-0 flex-1" />
        <Spark values={wH} min={0} color={hue(70)} className="min-h-0 flex-1" />
      </div>
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="grid grid-cols-2 gap-3">{legend}</div>
      <div className="relative min-h-0 flex-1">
        <Spark values={rH} min={0} className="absolute inset-0 h-full" />
        <Spark values={wH} min={0} fill={false} color={hue(70)} className="absolute inset-0 h-full" />
      </div>
    </div>
  );
}

export default function StorageHealth(p: StorageHealthProps) {
  const d = p.data;
  const disks = detect(d, /^libre\.(.+)_power_on_hours$/);
  const id = p.disk ?? firstDisk(disks);
  const k = (s: string) => num(get(d, `libre.${id}_${s}`));
  const pick = (...ks: string[]) => ks.map(k).find(Number.isFinite);
  const life = k("life"),
    temp = pick("composite_temperature", "temperature", "temperature__2") ?? NaN;
  const warnT = pick("warning_temperature") ?? 70,
    critT = pick("critical_temperature") ?? 85;
  const rd = k("read_rate"),
    wr = k("write_rate");
  const rH = useHistory(rd),
    wH = useHistory(wr);
  if (!id)
    return (
      <Widget {...shell(p)} title="SSD" icon="health_metrics">
        <Empty />
      </Widget>
    );
  const lifeT = life < 20 ? "crit" : life < 50 ? "warn" : "ok";
  const name = p.title ?? diskShort(id, get(d, `libre.${id}_volumes`));
  return (
    <Widget
      {...shell(p)}
      title={`${name} · ${fmtGB(k("total_space"))}`}
      icon="health_metrics"
      compact={{ label: name, value: life, unit: "%", sub: `${fmt(temp, 0)}°C · ${fmtRate(rd + wr)}`, pct: life, kind: "ring", t: lifeT }}
      right={<span className="tabular-nums" style={{ color: tone(temp, warnT, critT) === "ok" ? "var(--w-fg)" : "#fbbf24" }}>{fmt(temp, 0)}°C</span>}
    >
      {({ size }) =>
        size === "xs" ? (
          <Metric label="Health" value={life} unit="%" scale="lg" t={lifeT} sub={`${fmt(temp, 0)} °C`} className="h-full justify-center" />
        ) : size === "sm" ? (
          <div className="flex h-full items-center gap-3">
            <Ring value={life} t={lifeT} thickness={9} className="h-full max-h-28">
              <Num className="text-xl font-semibold">
                {fmt(life, 0)}
                <span className="text-xs text-[color:var(--w-muted)]">%</span>
              </Num>
              <span className="text-[10px] text-[color:var(--w-faint)]">life</span>
            </Ring>
            <div className="grid min-w-0 flex-1 gap-2">
              <Stat label="Read" value={fmtRate(rd)} />
              <Stat label="Write" value={fmtRate(wr)} />
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-3">
            <div className="flex items-end gap-5">
              <Metric value={life} unit="%" scale={size === "lg" ? "xl" : "lg"} sub="Drive life" t={lifeT} />
              <div className="grid flex-1 grid-cols-3 gap-3">
                <Stat label="Read" value={fmtRate(rd)} />
                <Stat label="Write" value={fmtRate(wr)} />
                <Stat label="Activity" value={`${fmt(k("total_activity"), 0)}%`} />
              </div>
            </div>
            <RateGraph rH={rH} wH={wH} rd={rd} wr={wr} />
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px] text-[color:var(--w-muted)]">
                <span>{fmtGB(k("free_space"))} free</span>
                <span className="tabular-nums">{fmt(k("used_space"), 0)}% used</span>
              </div>
              <Bar value={k("used_space")} className="h-1.5" />
            </div>
            {size === "lg" && (
              <StatGrid
                cols={4}
                items={[
                  { label: "Written", value: fmtGB(k("data_written")) },
                  { label: "Read total", value: fmtGB(k("data_read")) },
                  { label: "Power-on", value: `${fmt(k("power_on_hours"))} h` },
                  { label: Number.isFinite(k("available_spare")) ? "Spare" : "Power cycles", value: Number.isFinite(k("available_spare")) ? `${fmt(k("available_spare"))}%` : fmt(k("power_on_count")) },
                ]}
              />
            )}
          </div>
        )
      }
    </Widget>
  );
}
