import type { ModuleSettings } from "@/modules/types";
import { alignOf } from "@/modules/setting-readers";
import { bodyGap, fillRows, roomy, clamp, ChannelBar, ChannelRow, useFitRows, Widget, shell, get, num, fmt, Num, Ring, Icon, Dot, Chip, STATE, meterColour, type ShellProps } from "../kit";
import { t3Tokens } from "../core/t3-tokens";
import { inFlow, levelContainerOf, volumeFlowOf, volumePicked, type FlowFilter } from "../shared/audio-data";
import type { MixerLook } from "../core/mixer-look";
import { useDeviceLevel } from "../core/level-source";
import { MixerViewBody, PERCENT, fitMixer, toneOf, type StripChannel } from "../core/mixer-views";
import { meta } from "./meta";

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
  /** The level colour is the widget's own (`levelOwnOf`): it does not give way to the Look's meter colour. */
  levelOwn?: boolean;
  /** The view (rows, strips or LCD) and its options; unset = the rows view. */
  mixerLook?: MixerLook;
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
  const fill = meterColour(t3Tokens(p.t3), p.levelColor, p.levelOwn);
  const wl = get(d, "plugins.wavelink-plugin.wavelink.status") === "up";
  // The audiocn views: read-only (the plugin has no write path), a knobless fader beside the device's level meter. A device the
  // level-meter plugin doesn't report draws its meter at silence.
  const look = p.mixerLook;
  const strips: StripChannel[] = list.map((c) => {
    const color = c.mute ? "var(--w-faint)" : fill;
    return {
      id: c.id,
      name: showDevice ? c.name : "",
      sub: c.dev ? String(c.dev) : undefined,
      icon: c.mute ? "volume_off" : c.vol < 35 ? "volume_down" : "volume_up",
      muted: c.mute,
      color,
      value: clamp(c.vol),
      readout: `${fmt(c.vol)}%`,
      useLevel: () => useDeviceLevel((levels) => levelContainerOf(levels, c.id)),
    };
  });
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
        const fit = look && fitMixer(look, w, h, strips);
        if (look && fit && fit.view !== "rows") return <MixerViewBody look={look} fit={fit} channels={strips} unit={PERCENT} tone={toneOf(p)} live />;
        if (size === "xs" || size === "sm")
          return (
            <div className={`flex h-full min-w-0 items-center ${w < 170 ? "flex-col justify-center gap-1" : "gap-3"}`}>
              <div className="shrink-0" style={{ width: Math.max(28, Math.min(96, w < 170 ? Math.min(w, h - 34) : h)) }}>
                <Ring value={def.mute ? 0 : def.vol}>
                  <Icon name={def.mute ? "volume_off" : "volume_up"} className="text-xl" />
                </Ring>
              </div>
              <div className={`flex min-w-0 flex-col ${w < 170 ? "items-center" : ""}`}>
                <Num className={`${w < 170 ? "text-lg" : "text-2xl"} font-semibold leading-tight`}>
                  {fmt(def.vol)}
                  <span className="text-sm font-normal text-[color:var(--w-muted)]">%</span>
                </Num>
                {showDevice && w >= 170 && <span className="truncate text-micro text-[color:var(--w-muted)]">{def.name}</span>}
              </div>
            </div>
          );
        // The look's gap spaces the rows; a placed or spread list (or a custom gap) moves rows to the edges, so leave it a little room.
        const g = bodyGap(p.look, 10, h),
          align = alignOf(p.look ?? {}),
          placed = align.alignX === "between" || align.alignY !== "auto" || g !== 10,
          n = useFitRows(h - (placed ? 6 : 0), size === "lg" ? 34 : 30, g);
        const rowFill = fillRows(h, Math.min(list.length, n), 34, g, roomy(w, h) && !placed);
        return (
          <ul className={`flex h-full flex-col gap-2.5 overflow-hidden ${rowFill.spread ? "justify-evenly" : ""}`}>
            {list.slice(0, n).map((c) => (
              <ChannelRow
                key={c.id}
                title={c.full}
                minHeight={rowFill.rowH}
                muted={c.mute}
                lead={
                  <span className="flex items-center justify-center" style={{ color: c.mute ? STATE.crit : "var(--w-muted)" }}>
                    <Icon name={c.mute ? "volume_off" : c.vol < 35 ? "volume_down" : "volume_up"} className="text-[17px]" />
                  </span>
                }
                name={showDevice ? c.name : ""}
                sub={showDevice && size === "lg" ? c.dev : undefined}
                nameW={showDevice ? (w >= 300 ? 110 : 76) : 0}
                bar={<ChannelBar thumb label={c.name} value={c.vol} color={c.mute ? "var(--w-faint)" : fill} />}
                value={fmt(c.vol)}
                valueW={36}
              />
            ))}
          </ul>
        );
      }}
    </Widget>
  );
}
