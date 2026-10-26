import type { ModuleSettings } from "@/modules/types";
import { StatGrid, Widget, shell, get, num, fmt, pretty, Metric, Ring, Spark, Stat, BarRow, useHistory, tone, Empty, hw, STATE, Num, type ShellProps } from "./kit";
import { meta } from "./meta/GpuMonitor";

export { meta };

export interface GpuMonitorProps extends ShellProps {
  look?: ModuleSettings;
  gpu?: string;
  warnTemp?: number;
  critTemp?: number;
}

export default function GpuMonitor(p: GpuMonitorProps) {
  const d = p.data;
  const id = p.gpu ?? hw(d).gpu;
  const k = (s: string) => num(get(d, `libre.${id}_${s}`));
  const loadKey = `libre.${id}_gpu_core_load`;
  const load = k("gpu_core_load"),
    temp = k("gpu_core"),
    hot = k("gpu_memory_junction"),
    watts = k("gpu_package");
  const used = k("gpu_memory_used"),
    total = k("gpu_memory_total");
  const fans = [1, 2, 3].map((i) => k(`gpu_fan_${i}`)).filter(Number.isFinite);
  const engines: [string, number][] = [["3D", k("d3d_3d")], ["Copy", k("d3d_copy")], ["Decode", k("d3d_video_decode")], ["Encode", k("d3d_video_encode")], ["Mem ctrl", k("gpu_memory_controller")], ["Video eng", k("gpu_video_engine")]];
  const hist = useHistory(load);
  if (!id)
    return (
      <Widget {...shell(p)} title="GPU" icon="developer_board">
        <Empty />
      </Widget>
    );
  const name = p.title ?? (get(d, "plugins.InfoPanel.RTSS.rtss.gpu-name") || pretty(id)).replace(/^NVIDIA GeForce /i, "");
  const warnT = p.warnTemp ?? 75,
    critT = p.critTemp ?? 85;
  const tt = tone(temp, warnT, critT);
  return (
    <Widget
      {...shell(p)}
      title={name}
      icon="developer_board"
      compact={{ label: "GPU", value: load, unit: "%", sub: `${fmt(temp, 0)}°C · ${fmt(watts, 0)} W`, hist, min: 0, max: 100 }}
      right={
        <span className="tabular-nums" style={{ color: tt === "ok" ? "var(--w-fg)" : STATE[tt] }}>
          {fmt(temp, 0)}°C
        </span>
      }
    >
      {({ size }) =>
        size === "xs" ? (
          <div className="flex h-full items-center justify-between gap-2">
            <Metric ipKey={loadKey} label="GPU" value={load} unit="%" scale="lg" />
            <div className="text-right text-[11px] leading-tight text-[color:var(--w-muted)]">
              <div className="tabular-nums text-[color:var(--w-fg)]">{fmt(watts, 0)} W</div>
              {fmt(temp, 0)}°C
            </div>
          </div>
        ) : size === "sm" ? (
          <div className="flex h-full items-center gap-3">
            <Ring ipKey={loadKey} value={load} thickness={9} className="h-full max-h-28">
              <Num ipKey={loadKey} ipUnit="%" className="text-xl font-semibold">
                {fmt(load, 0)}
                <span className="text-xs text-[color:var(--w-muted)]">%</span>
              </Num>
            </Ring>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <BarRow label="VRAM" value={used} max={total} display={`${fmt(used / 1024, 1)} GB`} />
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Power" value={`${fmt(watts, 0)} W`} />
                <Stat label="Clock" value={`${fmt(k("gpu_core_clock"), 0)}`} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-3">
            <div className="flex items-end gap-5">
              <Metric ipKey={loadKey} value={load} unit="%" scale={size === "lg" ? "xl" : "lg"} sub="Core load" />
              <div className="grid flex-1 grid-cols-3 gap-3">
                <Stat label="Power" value={`${fmt(watts, 1)} W`} />
                <Stat label="Core" value={`${fmt(k("gpu_core_clock"), 0)} MHz`} />
                <Stat label="Hotspot" value={`${fmt(hot, 0)} °C`} />
              </div>
            </div>
            <BarRow label="VRAM" value={used} max={total} hint={`of ${fmt(total / 1024, 0)} GB`} display={`${fmt(used / 1024, 1)} GB`} />
            {size === "md" ? (
              <Spark ipKey={loadKey} values={hist} min={0} max={100} className="min-h-0 flex-1" />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-x-4 gap-y-2.5">
                  {engines.map(([l, v]) => (
                    <BarRow key={l} label={l} value={v} />
                  ))}
                </div>
                <Spark ipKey={loadKey} values={hist} min={0} max={100} className="min-h-0 flex-1" />
                <StatGrid
                  cols={4}
                  items={[
                    { label: "Mem clock", value: `${fmt(k("gpu_memory_clock"), 0)} MHz` },
                    { label: "Voltage", value: `${fmt(k("gpu_core_voltage"), 3)} V` },
                    { label: "Board power", value: `${fmt(k("gpu_board_power"), 1)}%` },
                    { label: "Fans", value: fans.length ? `${fmt(fans.reduce((a, b) => a + b, 0) / fans.length, 0)} RPM` : "–" },
                  ]}
                />
              </>
            )}
          </div>
        )
      }
    </Widget>
  );
}
