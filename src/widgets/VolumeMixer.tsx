import type { ModuleSettings } from "@/modules/types";
import { alignOf } from "@/modules/setting-readers";
import { bodyGap, useFitRows, Widget, shell, get, num, fmt, Num, Ring, Icon, Dot, Chip, STATE, type ShellProps } from "./kit";
import { inFlow, volumeFlowOf, volumePicked, type FlowFilter } from "./audio-data";
import { meta } from "./meta/VolumeMixer";

export { meta };

export interface VolumeMixerProps extends ShellProps {
  look?: ModuleSettings;
  /** The devices listed: level-meter container ids (matched to their volume entries by GUID) or "default-audio"; default all. */
  devices?: string[];
  /** Outputs or inputs only; an entry's flow is its level-meter container's. Default both. */
  flow?: FlowFilter;
  /** Device names; default on. */
  showDevice?: boolean;
  /** The muted state (icon and dimmed bar); read-only, the plugin has no write path. Default on. */
  showMute?: boolean;
  /** Fader fill colour, default the accent. */
  levelColor?: string;
}

export default function VolumeMixer(p: VolumeMixerProps) {
  const d = p.data;
  const keys = [...new Set(Object.keys(d || {}).map((k) => k.match(/^plugins\.volume-plugin\.(.+)\.short_name$/)?.[1]).filter((id): id is string => !!id))];
  const showMute = p.showMute !== false,
    showDevice = p.showDevice !== false;
  const ch = keys.map((id) => {
    const k = (s: string) => get(d, `plugins.volume-plugin.${id}.${s}`);
    return { id, name: String(k("short_name")).replace(/\s*\(.+$/, ""), full: k("friendly_name"), dev: k("device_friendly_name"), vol: num(k("volume")), mute: showMute && k("mute") === "True" };
  });
  const def = ch.find((c) => c.id === "default") ?? ch[0];
  const flow = p.flow ?? "all";
  const list = ch.filter((c) => (p.devices ? volumePicked(c.id, p.devices) : c.id !== "default") && inFlow(c.id === "default" ? "output" : volumeFlowOf(d, c.id), flow));
  const fill = p.levelColor || "var(--accent)";
  const wl = get(d, "plugins.wavelink-plugin.wavelink.status") === "up";
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Volume"}
      icon="tune"
      studio={def && { label: "Volume", live: wl, value: def.vol, unit: "%", sub: def.name, pct: def.vol, meters: list.map((c) => ({ n: c.name, v: c.mute ? 0 : c.vol })) }}
      compact={def && { label: showDevice ? def.name : "Volume", value: def.vol, unit: "%", pct: def.mute ? 0 : def.vol, kind: "ring", sub: def.mute ? "Muted" : "Default device", icon: def.mute ? "volume_off" : "volume_up" }}
      right={
        <Chip>
          <Dot ok={wl} />
          Wave Link
        </Chip>
      }
    >
      {({ size, w, h }) => {
        if (!def) return null;
        if (size === "xs" || size === "sm")
          return (
            <div className={`flex h-full min-w-0 items-center ${w < 170 ? "flex-col justify-center gap-1" : "gap-3"}`}>
              <div className="shrink-0" style={{ width: Math.max(28, Math.min(96, w < 170 ? Math.min(w, h - 34) : h)) }}>
                <Ring value={def.mute ? 0 : def.vol} thickness={10}>
                  <Icon name={def.mute ? "volume_off" : "volume_up"} className="text-xl" />
                </Ring>
              </div>
              <div className={`flex min-w-0 flex-col ${w < 170 ? "items-center" : ""}`}>
                <Num className={`${w < 170 ? "text-lg" : "text-2xl"} font-semibold leading-tight`}>
                  {fmt(def.vol)}
                  <span className="text-sm font-normal text-[color:var(--w-muted)]">%</span>
                </Num>
                {showDevice && w >= 170 && <span className="truncate text-[11px] text-[color:var(--w-muted)]">{def.name}</span>}
              </div>
            </div>
          );
        // The look's gap spaces the rows; a placed or spread list (or a custom gap) moves rows to the edges, so leave it a little room.
        const g = bodyGap(p.look, 10, h),
          align = alignOf(p.look ?? {}),
          placed = align.alignX === "between" || align.alignY !== "auto" || g !== 10,
          n = useFitRows(h - (placed ? 6 : 0), size === "lg" ? 34 : 30, g);
        return (
          <ul className="flex h-full flex-col gap-2.5 overflow-hidden">
            {list.slice(0, n).map((c) => (
              <li key={c.id} className="grid grid-cols-[18px_minmax(0,1fr)_36px] items-center gap-x-2.5" title={c.full}>
                <span className="flex items-center justify-center" style={{ color: c.mute ? STATE.crit : "var(--w-muted)" }}>
                  <Icon name={c.mute ? "volume_off" : c.vol < 35 ? "volume_down" : "volume_up"} className="text-[17px]" />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  {showDevice && (
                    <span className="truncate text-xs text-[color:var(--w-fg)]">
                      {c.name}
                      {size === "lg" && <span className="text-[color:var(--w-faint)]"> · {c.dev}</span>}
                    </span>
                  )}
                  <div className="relative h-1.5 rounded-full bg-[color:var(--w-track)]">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${c.vol}%`, background: c.mute ? "var(--w-faint)" : fill }} />
                    <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--w-fg)] shadow" style={{ left: `${c.vol}%` }} />
                  </div>
                </div>
                <span className="text-right text-xs tabular-nums text-[color:var(--w-muted)]">{fmt(c.vol)}</span>
              </li>
            ))}
          </ul>
        );
      }}
    </Widget>
  );
}
