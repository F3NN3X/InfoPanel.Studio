import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, fmt, fitRows, Icon, Bar, hw, Num, type ShellProps, type WidgetMeta } from "./kit";

export const meta: WidgetMeta = {
  id: "Fans",
  name: "Fans",
  category: "Hardware",
  icon: "mode_fan",
  prefixes: [],
  defaultSize: [2, 1],
  minSize: [1, 1],
  blurb: "Fan speeds and duty",
  tags: "rpm cooling",
  description: "GPU fans 1–3 with duty %, plus CPU fan. Icons spin at a speed proportional to RPM.",
};

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
    .concat([{ id: "cpu", label: "CPU", rpm: num(get(d, "libre.embedded_controller_cpu_optional_fan")), duty: NaN }])
    .filter((f) => Number.isFinite(f.rpm));
  const max = p.maxRpm ?? 3000;
  const avg = fans.filter((f) => f.rpm > 0).reduce((a, f, _, arr) => a + f.rpm / arr.length, 0);
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Fans"}
      icon="mode_fan"
      studio={{ label: "Fans", value: avg, unit: "rpm", rows: fans.map((f) => ({ n: f.label, v: f.rpm > 0 ? `${fmt(f.rpm)} rpm` : "off", pct: (f.rpm / max) * 100 })) }}
      compact={{ label: "Fans", value: avg, unit: "rpm", sub: `${fans.filter((f) => f.rpm > 0).length} spinning`, pct: (avg / max) * 100, icon: "mode_fan" }}
    >
      {({ size, w, h }) => {
        // Tiles while each gets ~64px of width and ~80px of height; otherwise one line per fan, as many as fit.
        const cols = Math.max(1, Math.min(fans.length, Math.floor((w + 8) / 72)));
        const tileRows = fitRows(h, 80, 8);
        if (h < 80 || (cols < 2 && fans.length > 1 && tileRows < fans.length))
          return (
            <ul className="flex h-full flex-col justify-center gap-1">
              {fans.slice(0, fitRows(h, 22, 4)).map((f) => (
                <li key={f.id} className="flex min-w-0 items-center gap-2 text-sm">
                  <Icon name="mode_fan" className={`shrink-0 text-base ${f.rpm > 0 ? "text-[color:var(--accent)]" : "text-[color:var(--w-faint)]"}`} />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-[color:var(--w-faint)]">{f.label}</span>
                  <Num className="shrink-0 font-semibold">{f.rpm > 0 ? fmt(f.rpm) : "Off"}</Num>
                </li>
              ))}
            </ul>
          );
        const shown = fans.slice(0, Math.min(size === "sm" ? 2 : 8, cols * tileRows));
        return (
          <div className="grid h-full gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(cols, shown.length)}, minmax(0,1fr))` }}>
            {shown.map((f) => (
              <div key={f.id} className="flex min-w-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-[color:var(--w-track)] p-2">
                <span className={`inline-flex ${p.spin !== false && f.rpm > 0 ? "animate-spin" : ""}`} style={{ animationDuration: `${Math.max(0.25, 600 / (f.rpm || 1)).toFixed(2)}s` }}>
                  <Icon name="mode_fan" className={`${size === "lg" ? "text-5xl" : "text-3xl"} ${f.rpm > 0 ? "text-[color:var(--accent)]" : "text-[color:var(--w-faint)]"}`} />
                </span>
                <Num className="text-sm font-semibold">{f.rpm > 0 ? fmt(f.rpm) : "Off"}</Num>
                <span className="max-w-full truncate text-[10.5px] text-[color:var(--w-faint)]">
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
