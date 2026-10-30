import { useState } from "react";
import { audioAct, audioRefusal, useAudio, type AudioState } from "@/lib/audio-control";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, num, fmt, clamp, Icon, Num, Empty, hue, type ShellProps } from "./kit";
import { allChannels, iconOf, pickChannels, type AudioSource } from "./StreamMixer/channels";
import { setVolume, toggleMute } from "./StreamMixer/control";
import { MixFader, type FaderMode } from "./StreamMixer/Fader";
import { OutputPicker } from "./StreamMixer/OutputPicker";
import { ReadOnly } from "./ReadOnly";
import { meta } from "./meta/StreamMixer";

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
}

/** The other channels' colours: the accent turned by these degrees, in order. */
const MIX_HUES = [95, -115, -75, 40, 140, -150];
const MASTER_COLOR = "#e4e4e7";
const MUTED_COLOR = "#52525b";

const btn = "flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100";

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
        const gap = 8,
          minRow = size === "lg" ? 50 : 38;
        const n = Math.max(1, Math.min(rows.length, Math.floor((h + gap) / (minRow + gap))));
        const rowH = (h - gap * (n - 1)) / n;
        const tile = Math.round(clamp(rowH * 0.8, 28, 52));
        const showName = w >= 240,
          showSub = rowH >= 44 && w > 300;
        const nameW = showName ? Math.round(clamp(w * 0.26, 72, 210)) : 0;
        const valW = w > 300 ? 42 : 30;
        const faderW = w - tile - nameW - valW - (showName ? 3 : 2) * 14;
        const segs = Math.round(clamp(faderW / 5.5, 10, 64));
        const fh = clamp(rowH * 0.42, 10, 28),
          big = rowH > 50;
        // The tile's corner follows the shell's.
        const corner = p.radius === undefined ? "calc(var(--radius, 1rem) * 0.62)" : `${p.radius * 0.62}px`;
        return (
          <ReadOnly on={readOnly}>
          <ul className="flex h-full flex-col" style={{ gap }}>
            {rows.slice(0, n).map(({ c, color, icon }) => (
              <li
                key={c.id}
                title={c.name}
                className="grid min-h-0 flex-1 items-center gap-x-3.5"
                style={{ gridTemplateColumns: showName ? `${tile}px ${nameW}px minmax(0,1fr) ${valW}px` : `${tile}px minmax(0,1fr) ${valW}px` }}
              >
                <button
                  type="button"
                  onClick={() => toggleMute(c)}
                  aria-label={c.mute ? `Unmute ${c.name}` : `Mute ${c.name}`}
                  className="flex items-center justify-center bg-white/[0.05] transition hover:bg-white/[0.09] active:scale-95"
                  style={{ width: tile, height: tile, color, borderRadius: corner }}
                >
                  <Icon name={icon} className={tile >= 40 ? "text-[22px]" : "text-[17px]"} />
                </button>
                {showName && (
                  <div className="min-w-0">
                    <div className={`truncate font-semibold leading-tight ${c.mute ? "text-zinc-500" : ""}`} style={{ fontSize: big ? 16 : 13.5 }}>
                      {c.name}
                    </div>
                    {showSub && (c.mute || c.sub) && <div className="mt-0.5 truncate text-[11px] text-zinc-500">{c.mute ? "Muted" : c.sub}</div>}
                  </div>
                )}
                <div style={{ height: fh }}>
                  <MixFader value={clamp(num(c.vol))} color={color} segs={segs} mode={p.fader === "bar" ? "bar" : "leds"} onChange={(v) => setVolume(c, v)} />
                </div>
                <Num className={`text-right leading-none ${c.mute ? "text-zinc-500" : ""}`} style={{ fontSize: big ? 20 : 15 }}>
                  {fmt(c.vol)}
                </Num>
              </li>
            ))}
          </ul>
          </ReadOnly>
        );
      }}
    </Widget>
  );
}
