import { useState } from "react";
import { meterKey, useWavelinkMeter } from "@/lib/wavelink";
import { audioAct, audioRefusal, useAudio, type AudioState } from "@/lib/audio-control";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, num, fmt, clamp, Icon, ChannelRow, CHANNEL_TRACK, Empty, hue, type ShellProps } from "../kit";
import type { MixerLook } from "../core/mixer-look";
import { useDeviceLevel } from "../core/level-source";
import { MixerViewBody, PERCENT, fitMixer, toneOf, type StripChannel } from "../core/mixer-views";
import { audioIds } from "../shared/audio-data";
import { allChannels, iconOf, MASTER_COLOR, pickChannels, type AudioSource, type MixChannel } from "./channels";
import { setVolume, toggleMute } from "./control";
import { MixFader, type FaderMode } from "./Fader";
import { OutputPicker } from "./OutputPicker";
import { ReadOnly } from "../shared/ReadOnly";
import { meta } from "./meta";

export { meta };

export interface StreamMixerProps extends ShellProps {
  look?: ModuleSettings;
  /** Windows' audio (default) or Elgato Wave Link. */
  source?: AudioSource;
  /** Wave Link's mix: an id, "all" for the channels' own levels, unset for the first mix. */
  mix?: string;
  /** The channels shown, in order (the ids are in `StreamMixer/channels.ts`); none = all. */
  channels?: string[];
  /** Per-channel name, status line and icon (a Material Symbols name) overrides, by channel id. */
  labels?: Record<string, string>;
  subs?: Record<string, string>;
  icons?: Record<string, string>;
  fader?: FaderMode;
  /** The view (rows, strips or LCD) and its options; unset = the rows view. */
  mixerLook?: MixerLook;
}

/** The other channels' colours: the accent turned by these degrees, in order. */
const MIX_HUES = [95, -115, -75, 40, 140, -150];
const MUTED_COLOR = "#52525b";

const btn = "flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100 lite:text-[color:var(--w-muted)] lite:hover:bg-[color:var(--w-track)] lite:hover:text-[color:var(--w-fg)]";

/** What a source says when it has nothing to show. */
function emptyLabel(source: AudioSource, audio: AudioState): string {
  if (source === "wavelink") return audio.wavelink.status === "up" ? "Wave Link has no channels" : "Wave Link isn't running";
  return audio.windows.available ? "No audio devices" : "Audio control isn't available";
}

export default function StreamMixer(p: StreamMixerProps) {
  const audio = useAudio();
  const readOnly = audioRefusal.use();
  const source = p.source ?? "windows";
  const [picking, setPicking] = useState(false);
  let ci = 0;
  const rows = pickChannels(allChannels(audio, source, p.mix), p.channels ?? []).map((c) => {
    const icon = p.icons?.[c.id] ?? c.icon;
    const base = c.master ? MASTER_COLOR : hue(MIX_HUES[ci++ % MIX_HUES.length]);
    return { c: { ...c, name: p.labels?.[c.id] ?? c.name, sub: p.subs?.[c.id] ?? c.sub }, color: c.mute ? MUTED_COLOR : base, icon: iconOf({ icon, mute: c.mute }) };
  });
  const first = rows.find((r) => r.c.master) ?? rows[0];
  // The audiocn views: masters first (after the separator), the fader writes as the rows' does. The meter is the channel's own level:
  // a Wave Link channel's or mix's meter, or the level-meter plugin's for the default output and input; an app has none (its meter
  // stays at silence).
  const look = p.mixerLook;
  const deviceOf = (container: string) => () => useDeviceLevel((d) => (audioIds(d).includes(container) ? container : undefined));
  const useLevelOf = (c: MixChannel): StripChannel["useLevel"] => {
    const r = c.route;
    if (r.t === "wl-channel") return () => useWavelinkMeter(meterKey.channel(r.id));
    if (r.t === "wl-mix") return () => useWavelinkMeter(meterKey.mix(r.id));
    return c.id === "master" ? deviceOf("default-audio") : c.id === "mic" ? deviceOf("default-input") : undefined;
  };
  const strips: StripChannel[] = [...rows.filter((r) => r.c.master), ...rows.filter((r) => !r.c.master)].map(({ c, color, icon }) => ({
    id: c.id,
    name: c.name,
    sub: c.mute ? "Muted" : c.sub,
    icon,
    muted: c.mute,
    color,
    master: c.master,
    value: clamp(num(c.vol)),
    readout: `${fmt(c.vol)}%`,
    useLevel: useLevelOf(c),
    onChange: readOnly ? undefined : (v) => setVolume(c, Math.round(v)),
    onMute: () => toggleMute(c),
    locked: readOnly,
  }));
  const right =
    source === "windows" && audio.windows.available ? (
      <span className="relative flex items-center gap-0.5">
        <button type="button" onClick={() => setPicking((v) => !v)} className={btn} title="Output device" aria-label="Output device">
          <Icon name="expand_more" className="text-[18px]" />
        </button>
        <button type="button" onClick={() => void audioAct({ target: "windows", op: "settings" })} className={btn} title="Sound settings" aria-label="Sound settings">
          <Icon name="settings" className="text-[17px]" />
        </button>
        {picking && <OutputPicker outputs={audio.windows.outputs} onDone={() => setPicking(false)} />}
      </span>
    ) : undefined;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Mixer"}
      icon="headphones"
      right={right}
      compact={first && { label: first.c.name, value: first.c.vol, unit: "%", pct: first.c.mute ? 0 : first.c.vol, kind: "ring", sub: first.c.mute ? "Muted" : first.c.sub, icon: first.icon }}
      studio={first && { label: "Mix", value: first.c.vol, unit: "%", sub: first.c.name, pct: first.c.vol, meters: rows.filter((r) => !r.c.master).map((r) => ({ n: r.c.name, v: r.c.mute ? 0 : r.c.vol })) }}
    >
      {({ w, h, size }) => {
        if (!rows.length) return <Empty icon="volume_off" label={emptyLabel(source, audio)} />;
        const fit = look && fitMixer(look, w, h, strips);
        if (look && fit && fit.view !== "rows")
          return (
            <ReadOnly on={readOnly}>
              <MixerViewBody look={look} fit={fit} channels={strips} unit={PERCENT} tone={toneOf(p)} live={source === "wavelink" ? audio.wavelink.status === "up" : audio.windows.available} />
            </ReadOnly>
          );
        const gap = 8,
          minRow = size === "lg" ? 50 : 38;
        const n = Math.max(1, Math.min(rows.length, Math.floor((h + gap) / (minRow + gap))));
        const rowH = (h - gap * (n - 1)) / n;
        const tile = Math.round(clamp(rowH * 0.8, 28, 52));
        const showName = w >= 240,
          showSub = rowH >= 44 && w > 300;
        const nameW = showName ? Math.round(clamp(w * 0.26, 72, 210)) : 0;
        const valW = w > 300 ? 42 : 34;
        const faderW = w - tile - nameW - valW - (showName ? 3 : 2) * 14;
        const segs = Math.round(clamp(faderW / 5.5, 10, 64));
        // The tile's corner follows the shell's.
        const corner = p.radius === undefined ? "calc(var(--radius, 1rem) * 0.62)" : `${p.radius * 0.62}px`;
        return (
          <ReadOnly on={readOnly}>
          <ul className="flex h-full flex-col" style={{ gap }}>
            {rows.slice(0, n).map(({ c, color, icon }) => (
              <ChannelRow
                key={c.id}
                title={c.name}
                className="min-h-0 flex-1 !gap-x-3.5"
                muted={c.mute}
                big={rowH > 50}
                lead={
                  <button
                    type="button"
                    onClick={() => toggleMute(c)}
                    disabled={readOnly}
                    aria-label={c.mute ? `Unmute ${c.name}` : `Mute ${c.name}`}
                    className="flex items-center justify-center bg-white/[0.05] transition hover:bg-white/[0.09] lite:bg-[color:var(--w-track)] lite:hover:bg-[color:var(--w-track)] active:scale-95"
                    style={{ width: tile, height: tile, color, borderRadius: corner }}
                  >
                    <Icon name={icon} className={tile >= 40 ? "text-[22px]" : "text-[17px]"} />
                  </button>
                }
                leadW={tile}
                name={c.name}
                sub={showSub && (c.mute || c.sub) ? (c.mute ? "Muted" : c.sub) : undefined}
                nameW={nameW}
                bar={
                  <div style={{ height: p.fader === "bar" ? CHANNEL_TRACK : clamp(rowH * 0.42, 10, 28) }}>
                    <MixFader label={c.name} value={clamp(num(c.vol))} color={color} segs={segs} mode={p.fader === "bar" ? "bar" : "leds"} onChange={readOnly ? undefined : (v) => setVolume(c, v)} />
                  </div>
                }
                value={fmt(c.vol)}
                valueW={valW}
              />
            ))}
          </ul>
          </ReadOnly>
        );
      }}
    </Widget>
  );
}
