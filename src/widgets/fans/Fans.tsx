import { readSystemFlat } from "@/lib/system-metrics";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, fmt, fitRows, roomy, Icon, Bar, hw, Num, type ShellProps } from "../kit";
import { meta } from "./meta";

export { meta };

export interface FansProps extends ShellProps {
  look?: ModuleSettings;
  maxRpm?: number;
  spin?: boolean;
}

interface Fan {
  id: string;
  label: string;
  rpm: number;
  duty?: number;
}

export default function Fans(p: FansProps) {
  const d = p.data;
  const gpu = hw(d).gpu;
  const fans: Fan[] = [1, 2, 3]
    .map((i) => ({ id: `g${i}`, label: `GPU ${i}`, rpm: num(get(d, `libre.${gpu}_gpu_fan_${i}`)), duty: num(get(d, `libre.${gpu}_gpu_fan_${i}_control`)) }))
    .concat([{ id: "cpu", label: "CPU", rpm: readSystemFlat(d ?? {}).board.cpuFan ?? NaN, duty: NaN }])
    .filter((f) => Number.isFinite(f.rpm));
  const max = p.maxRpm ?? 3000;
  const avg = fans.filter((f) => f.rpm > 0).reduce((a, f, _, arr) => a + f.rpm / arr.length, 0);
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Fans"}
      icon="mode_fan"
      studio={{ label: "Fans", value: avg, unit: "RPM", rows: fans.map((f) => ({ n: f.label, v: f.rpm > 0 ? `${fmt(f.rpm)} RPM` : "Off", pct: (f.rpm / max) * 100 })) }}
      compact={{ label: "Fans", value: avg, unit: "RPM", sub: `${fans.filter((f) => f.rpm > 0).length} spinning`, pct: (avg / max) * 100, icon: "mode_fan" }}
    >
      {({ size, w, h, outerW, outerH }) => {
        // Tiles while each gets ~64px of width and ~80px of height; otherwise one line per fan, as many as fit.
        const cols = Math.max(1, Math.min(fans.length, Math.floor((w + 8) / 72)));
        const tileRows = fitRows(h, 80, 8);
        if (h < 80 || (cols < 2 && fans.length > 1 && tileRows < fans.length))
          return (
            <ul className="flex h-full flex-col justify-center gap-1">
              {fans.slice(0, fitRows(h, 22, 4)).map((f) => (
                <li key={f.id} className="flex min-w-0 items-center gap-2 text-sm">
                  <Icon name="mode_fan" className={`shrink-0 text-base ${f.rpm > 0 ? "text-[color:var(--w-accent)]" : "text-[color:var(--w-faint)]"}`} />
                  <span className="min-w-0 flex-1 truncate text-micro text-[color:var(--w-faint)]">{f.label}</span>
                  <Num className="shrink-0 font-semibold">{f.rpm > 0 ? fmt(f.rpm) : "Off"}</Num>
                </li>
              ))}
            </ul>
          );
        const shown = fans.slice(0, Math.min(size === "sm" ? 2 : 8, cols * tileRows));
        if (roomy(outerW, outerH))
          return (
            // 4x4: each fan is a vertical meter, filled from the bottom by its duty (else its share of the top speed)
            <div className="grid h-full gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(cols, shown.length)}, minmax(0,1fr))` }}>
              {shown.map((f) => {
                const fill = Math.max(0, Math.min(100, Number.isFinite(f.duty) ? (f.duty ?? 0) : (f.rpm / max) * 100));
                return (
                  <div key={f.id} className="relative flex min-w-0 flex-col items-center justify-between overflow-hidden rounded-xl bg-[color:var(--w-track)] px-2 py-3">
                    <div aria-hidden className="absolute inset-x-0 bottom-0 transition-[height] duration-700" style={{ height: `${f.rpm > 0 ? fill : 0}%`, background: "linear-gradient(to top, color-mix(in oklab, var(--w-accent) 40%, transparent), color-mix(in oklab, var(--w-accent) 22%, transparent))" }} />
                    <Num className="relative text-stat font-bold">{f.rpm > 0 ? fmt(f.rpm) : "Off"}</Num>
                    <span className={`relative inline-flex ${p.spin !== false && f.rpm > 0 ? "animate-spin" : ""}`} style={{ animationDuration: `${Math.max(0.25, 600 / (f.rpm || 1)).toFixed(2)}s` }}>
                      <Icon name="mode_fan" className={`text-5xl ${f.rpm > 0 ? "text-[color:var(--w-accent)]" : "text-[color:var(--w-faint)]"}`} />
                    </span>
                    <span className="relative max-w-full truncate text-micro text-[color:var(--w-muted)]">
                      {f.label}
                      {Number.isFinite(f.duty) ? ` · ${fmt(f.duty ?? NaN)}%` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        return (
          <div className="grid h-full gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(cols, shown.length)}, minmax(0,1fr))` }}>
            {shown.map((f) => (
              <div key={f.id} className="flex min-w-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-[color:var(--w-track)] p-2">
                <span className={`inline-flex ${p.spin !== false && f.rpm > 0 ? "animate-spin" : ""}`} style={{ animationDuration: `${Math.max(0.25, 600 / (f.rpm || 1)).toFixed(2)}s` }}>
                  <Icon name="mode_fan" className={`${size === "lg" ? "text-5xl" : "text-3xl"} ${f.rpm > 0 ? "text-[color:var(--w-accent)]" : "text-[color:var(--w-faint)]"}`} />
                </span>
                <Num className="text-sm font-semibold">{f.rpm > 0 ? fmt(f.rpm) : "Off"}</Num>
                <span className="max-w-full truncate text-micro text-[color:var(--w-faint)]">
                  {f.label}
                  {Number.isFinite(f.duty) ? ` · ${fmt(f.duty ?? NaN)}%` : ""}
                </span>
                {size === "lg" && <Bar value={f.rpm} max={max} className="h-1 w-3/4" />}
              </div>
            ))}
          </div>
        );
      }}
    </Widget>
  );
}
