import { useState } from "react";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, fmt, fmtGB, fmtRate, adapterOf, firstDisk, Spark, useHistory, tone, TONES, useSkin, numFont, hw, type RateUnit, type ShellProps, type WidgetMeta } from "./kit";

export const meta: WidgetMeta = {
  id: "MenuBar",
  name: "Menu Bar",
  category: "System",
  icon: "more_horiz",
  prefixes: [],
  defaultSize: [6, 1],
  minSize: [2, 1],
  blurb: "Glance strip of labels and values",
  tags: "strip istat bar top",
  description: "Always-visible glance strip (iStat Menus style): label stacked over value, mini bars, click an item (or pick an active one) to open its detail.",
};

export type Key = "cpu" | "gpu" | "temp" | "mem" | "down" | "up" | "nvme";
interface Item {
  k: string;
  /** The reading (bars and tones scale by it). */
  v: number;
  u: string;
  /** The value as shown, when it is not `fmt(v, 0)` + `u` (a rate in the chosen unit). */
  text?: [value: string, unit: string];
  max?: number;
  warn?: number;
  crit?: number;
  more: [string, string][];
}

export interface MenuBarProps extends ShellProps {
  look?: ModuleSettings;
  items?: Key[];
  stacked?: boolean;
  dropdown?: boolean;
  /** The item shown selected, with its detail, until one is clicked (for screens nobody touches). */
  active?: Key;
  /** Network adapter for Down / Up; default = the busiest. */
  adapter?: string;
  /** The Down / Up unit, as Network Traffic's Speed units. */
  rateUnit?: RateUnit;
}

/** A rate as [value, unit] for the item's two-part readout. */
const rateText = (bytesPerSec: number, unit: RateUnit | undefined): [string, string] => {
  const s = fmtRate(bytesPerSec, unit);
  const at = s.lastIndexOf(" ");
  return at < 0 ? [s, ""] : [s.slice(0, at), s.slice(at + 1)];
};

export default function MenuBar(p: MenuBarProps) {
  const d = p.data;
  const sk = useSkin();
  const cpu = hw(d).cpu,
    gpu = hw(d).gpu;
  const disk = firstDisk(hw(d).disks);
  const L = (k: string) => num(get(d, `libre.${k}`));
  // the same adapter, readings (bytes per second) and units as Network Traffic
  const net = adapterOf(d, p.adapter);
  const N = (k: string) => (net ? L(`${net}_${k}`) : NaN);
  const dn = N("download_speed"),
    up = N("upload_speed");
  const ALL: Record<Key, Item> = {
    cpu: { k: "CPU", v: L(`${cpu}_cpu_total`), u: "%", max: 100, more: [["Package", `${fmt(L(`${cpu}_package`), 0)} W`], ["Max core", `${fmt(L(`${cpu}_cpu_core_max`), 0)}%`], ["Clock", `${fmt(L(`${cpu}_cores__average_effective`) / 1000, 2)} GHz`]] },
    gpu: { k: "GPU", v: L(`${gpu}_gpu_core_load`), u: "%", max: 100, more: [["Power", `${fmt(L(`${gpu}_gpu_package`), 0)} W`], ["Clock", `${fmt(L(`${gpu}_gpu_core_clock`), 0)} MHz`], ["VRAM", `${fmt(L(`${gpu}_gpu_memory_used`) / 1024, 1)} GB`]] },
    temp: { k: "Temp", v: L(`${gpu}_gpu_core`), u: "°", max: 100, warn: 75, crit: 85, more: [["CPU", `${fmt(L(`${cpu}_core__tctl_tdie`), 0)}°C`], ["Hotspot", `${fmt(L(`${gpu}_gpu_memory_junction`), 0)}°C`]] },
    mem: { k: "Mem", v: L("total_memory_memory"), u: "%", max: 100, warn: 85, crit: 95, more: [["Used", `${fmt(L("total_memory_memory_used"), 1)} GB`], ["Free", `${fmt(L("total_memory_memory_available"), 1)} GB`]] },
    down: { k: "↓ Down", v: dn, u: "", text: rateText(dn, p.rateUnit), more: [["Downloaded", fmtGB(N("data_downloaded"))], ["Utilisation", `${fmt(N("network_utilization"), 1)}%`]] },
    up: { k: "↑ Up", v: up, u: "", text: rateText(up, p.rateUnit), more: [["Uploaded", fmtGB(N("data_uploaded"))], ["Utilisation", `${fmt(N("network_utilization"), 1)}%`]] },
    nvme: { k: "NVMe", v: L(`${disk}_composite_temperature`) || L(`${disk}_temperature`), u: "°", max: 90, warn: 70, crit: 80, more: [["Life", `${fmt(L(`${disk}_life`), 0)}%`], ["Read", fmtRate(L(`${disk}_read_rate`))]] },
  };
  const keys = p.items ?? (Object.keys(ALL) as Key[]);
  const H: Record<Key, number[]> = {
    cpu: useHistory(ALL.cpu.v, 40, 0.5),
    gpu: useHistory(ALL.gpu.v, 40, 0.5),
    temp: useHistory(ALL.temp.v, 40, 0.5),
    mem: useHistory(ALL.mem.v, 40, 0.5),
    down: useHistory(ALL.down.v, 40, 0.5),
    up: useHistory(ALL.up.v, 40, 0.5),
    nvme: useHistory(ALL.nvme.v, 40, 0.5),
  };
  // A click overrides the active item until the setting changes (the pick is kept per active value).
  const [picked, setPicked] = useState<{ for: Key | undefined; key: Key | null } | null>(null);
  const open = picked && picked.for === p.active ? picked.key : (p.active ?? null);
  const setOpen = (key: Key | null) => setPicked({ for: p.active, key });
  const shown = (m: Item): [string, string] => m.text ?? [fmt(m.v, 0), m.u];
  return (
    <Widget
      {...shell(p)}
      showHeader={false}
      compact={(box) => (box.shape === "strip" ? undefined : { label: "CPU · GPU", value: ALL.cpu.v, unit: "%", sub: `GPU ${fmt(ALL.gpu.v, 0)}% · Mem ${fmt(ALL.mem.v, 0)}%`, hist: H.cpu, min: 0, max: 100 })}
      studio={{ label: "Glance", value: ALL.cpu.v, unit: "%", sub: "CPU", hist: H.cpu, min: 0, max: 100, rows: keys.map((key) => ({ n: ALL[key].k, v: shown(ALL[key]).join(ALL[key].text ? " " : ""), pct: ALL[key].max ? (ALL[key].v / ALL[key].max!) * 100 : undefined })) }}
    >
      {({ w, h }) => {
        const stacked = p.stacked ?? h >= 40;
        const per = stacked ? 74 : 92,
          n = Math.max(1, Math.min(keys.length, Math.floor((w - 8) / per)));
        // a tall zone shows a detail card even before an item is picked (the first one), so it is never an empty card
        const detailKey = open ?? keys[0];
        const it = detailKey ? ALL[detailKey] : undefined;
        // the items that fit; the open one always stays among them (it takes the last place)
        const first = keys.slice(0, n);
        const visible = open && keys.includes(open) && !first.includes(open) ? [...first.slice(0, n - 1), open] : first;
        return (
          <div className="flex h-full flex-col gap-2.5">
            <div className="flex shrink-0 flex-wrap gap-[2px] rounded-lg border border-[color:var(--w-track)] bg-[color:var(--w-track)] p-1">
              {visible.map((key) => {
                const m = ALL[key],
                  t = tone(m.v, m.warn, m.crit),
                  on = open === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => p.dropdown !== false && setOpen(on ? null : key)}
                    className={`flex min-h-[34px] min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1 text-left transition-colors ${on ? "bg-[var(--accent)] text-[#0E1014]" : "hover:bg-[color:var(--w-track)]"}`}
                  >
                    <span className={`grid min-w-0 leading-[1.05] ${stacked ? "" : "grid-flow-col items-baseline gap-1.5"}`}>
                      <span className={`truncate text-[9px] font-semibold uppercase tracking-[0.08em] ${on ? "opacity-80" : "text-[color:var(--w-muted)]"}`}>{m.k}</span>
                      <span className="whitespace-nowrap text-[14px] font-semibold tabular-nums" style={{ ...numFont(sk), color: !on && t !== "ok" ? TONES[t] : undefined }}>
                        {shown(m)[0]}
                        <small className={`text-[11px] font-medium ${m.text ? "ml-0.5" : ""}`}>{shown(m)[1]}</small>
                      </span>
                    </span>
                    {w / n > 120 && (
                      <span className="ml-auto flex h-[22px] w-[42px] shrink-0 items-end gap-px">
                        {H[key].slice(-14).map((v, i) => (
                          <i key={i} className="min-h-px flex-1 rounded-t-[1px] bg-current opacity-80" style={{ height: `${Math.max(4, (v / (m.max ?? Math.max(1, ...H[key]))) * 100)}%` }} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* the detail needs the bar (~44px) plus its own ~110px; shorter zones keep just the selected tab */}
            {it && detailKey && h >= 160 && (
              <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-[10px] border border-[color:var(--w-track)] bg-black/25 p-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,.5)]">
                <div className="flex items-baseline justify-between gap-3">
                  <b className="text-sm font-semibold">{it.k}</b>
                  <span className="text-[22px] font-bold leading-none tabular-nums" style={{ ...numFont(sk) }}>
                    {shown(it)[0]}
                    <span className={`text-[0.6em] font-semibold ${it.text ? "ml-1" : ""}`}>{shown(it)[1]}</span>
                  </span>
                </div>
                <Spark values={H[detailKey]} min={0} max={it.max} className="min-h-[24px] flex-1" />
                <div className="grid gap-x-4 gap-y-1 text-xs" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))" }}>
                  {it.more.map(([a, b]) => (
                    <div key={a} className="flex flex-col">
                      <span className="text-[10.5px] uppercase tracking-[0.06em] text-[color:var(--w-faint)]">{a}</span>
                      <span className="font-medium tabular-nums">{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
