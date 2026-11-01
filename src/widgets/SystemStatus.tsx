import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, fmt, Metric, BarRow, Ring, Spark, Dot, useHistory, tone, TONES, Num, type ShellProps } from "./kit";
import { meta } from "./meta/SystemStatus";

export { meta };

export interface SystemStatusProps extends ShellProps {
  look?: ModuleSettings;
  warn?: number;
  crit?: number;
}

/** The content height (px) under which CPU and RAM share one line. */
const ONE_LINE_H = 50;

export default function SystemStatus(p: SystemStatusProps) {
  const d = p.data;
  const cpu = num(get(d, "system.cpu.load")),
    ram = num(get(d, "system.ram.load")),
    free = num(get(d, "system.ram.free"));
  const ok = get(d, "system.bridge.status") === "running";
  const cpuH = useHistory(cpu),
    ramH = useHistory(ram);
  const warn = p.warn ?? 75,
    crit = p.crit ?? 90;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "System"}
      icon="monitor_heart"
      compact={{ label: "CPU", value: cpu, unit: "%", sub: `RAM ${fmt(ram, 0)}%`, hist: cpuH, min: 0, max: 100, t: tone(cpu, warn, crit) }}
      right={
        <span className="flex items-center gap-1.5 font-mono text-micro text-[color:var(--w-muted)]">
          <Dot ok={ok} />
          {get(d, "system.bridge.time")}
        </span>
      }
    >
      {({ size, h }) => {
        // Too low for a label over the number: CPU and RAM on one line.
        if (h > 0 && h < ONE_LINE_H)
          return (
            <div className="flex h-full items-center gap-4 whitespace-nowrap leading-none">
              {[
                { l: "CPU", v: cpu },
                { l: "RAM", v: ram },
              ].map(({ l, v }) => (
                <span key={l} className="flex min-w-0 items-baseline gap-1.5">
                  <span className="text-[11px] font-medium text-[color:var(--w-muted)]">{l}</span>
                  <Num className="text-xl font-semibold" style={tone(v, warn, crit) !== "ok" ? { color: TONES[tone(v, warn, crit)] } : undefined}>
                    {fmt(v, 0)}
                    <span className="ml-0.5 text-[0.6em] font-medium text-[color:var(--w-muted)]">%</span>
                  </Num>
                </span>
              ))}
            </div>
          );
        if (size === "xs")
          return (
            <div className="grid h-full grid-cols-2 items-center gap-2">
              <Metric label="CPU" value={cpu} unit="%" scale="md" t={tone(cpu, warn, crit)} />
              <Metric label="RAM" value={ram} unit="%" scale="md" t={tone(ram, warn, crit)} />
            </div>
          );
        if (size === "sm")
          return (
            <div className="flex h-full flex-col justify-center gap-3">
              <BarRow label="CPU" value={cpu} warn={warn} crit={crit} />
              <BarRow label="RAM" value={ram} hint={`${fmt(free, 0)}% free`} warn={warn} crit={crit} />
            </div>
          );
        if (size === "md")
          return (
            <div className="grid h-full min-h-0 grid-cols-2 gap-4" style={{ gridTemplateRows: "minmax(0,1fr)" }}>
              {[
                { l: "CPU", v: cpu, h: cpuH },
                { l: "RAM", v: ram, h: ramH },
              ].map(({ l, v, h }) => (
                <div key={l} className="flex min-h-0 min-w-0 flex-col">
                  {/* the unit sits on the baseline here: a superscript unit rides up into the label above in the wide skins */}
                  <span className="truncate text-[11px] font-medium text-[color:var(--w-muted)]">{l}</span>
                  <Num className="shrink-0 whitespace-nowrap text-4xl font-semibold leading-none" style={tone(v, warn, crit) !== "ok" ? { color: TONES[tone(v, warn, crit)] } : undefined}>
                    {fmt(v, 0)}
                    <span className="ml-0.5 text-base font-medium text-[color:var(--w-muted)]">%</span>
                  </Num>
                  <Spark values={h} min={0} max={100} className="mt-2 min-h-0 flex-1" />
                </div>
              ))}
            </div>
          );
        return (
          <div className="grid h-full min-h-0 grid-cols-2 gap-5">
            {[
              { l: "CPU load", v: cpu, h: cpuH, sub: "Processor" },
              { l: "RAM load", v: ram, h: ramH, sub: `${fmt(free, 1)}% free` },
            ].map(({ l, v, h, sub }) => (
              <div key={l} className="flex min-h-0 min-w-0 flex-col items-center gap-2">
                <Ring value={v} t={tone(v, warn, crit)} thickness={7} className="min-h-0 max-w-full flex-1">
                  <Num className="text-4xl font-semibold">
                    {fmt(v, 0)}
                    <span className="text-base text-[color:var(--w-muted)]">%</span>
                  </Num>
                  <span className="text-[11px] text-[color:var(--w-muted)]">{l}</span>
                </Ring>
                <Spark values={h} min={0} max={100} className="h-10 shrink-0" />
                <span className="shrink-0 text-[11px] text-[color:var(--w-faint)]">{sub}</span>
              </div>
            ))}
          </div>
        );
      }}
    </Widget>
  );
}
