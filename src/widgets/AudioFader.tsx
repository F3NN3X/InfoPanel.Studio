import { useAudio } from "@/lib/audio-control";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, fmt, clamp, Icon, Num, Empty, hue, type ShellProps } from "./kit";
import { findChannel, iconOf } from "./StreamMixer/channels";
import { setVolume, toggleMute } from "./StreamMixer/control";
import { MixFader, type FaderMode } from "./StreamMixer/Fader";
import { meta } from "./meta/AudioFader";

export { meta };

export interface AudioFaderProps extends ShellProps {
  look?: ModuleSettings;
  /** The channel: `master`, `mic`, `app:<exe>`, `wl:<channel>` (see `StreamMixer/channels.ts`). */
  channel?: string;
  /** Wave Link's mix for a `wl:` channel: an id, "all", or unset for the first. */
  mix?: string;
  fader?: FaderMode;
  /** Replaces the channel's name. */
  name?: string;
}

export default function AudioFader(p: AudioFaderProps) {
  const audio = useAudio();
  const c = findChannel(audio, p.channel ?? "master", p.mix);
  const color = !c || c.mute ? "#52525b" : c.master ? "#e4e4e7" : hue(95);
  const name = p.name || c?.name || "Audio";
  return (
    <Widget {...shell(p)} title={p.title ?? name} icon="tune" showHeader={p.showHeader ?? false}>
      {({ w, h }) => {
        if (!c) return <Empty icon="volume_off" label="Channel not found" />;
        const vertical = h > w * 1.15;
        const mode = p.fader === "bar" ? "bar" : "leds";
        const tile = Math.round(clamp(Math.min(w, h) * 0.5, 28, 44));
        const mute = (
          <button type="button" onClick={() => toggleMute(c)} aria-label={c.mute ? `Unmute ${name}` : `Mute ${name}`} className="flex shrink-0 items-center justify-center rounded-lg bg-white/[0.05] active:scale-95" style={{ width: tile, height: tile, color }}>
            <Icon name={iconOf(c)} className="text-[20px]" />
          </button>
        );
        const value = (
          <Num className={`text-center leading-none ${c.mute ? "text-zinc-500" : ""}`} style={{ fontSize: 15 }}>
            {fmt(c.vol)}
          </Num>
        );
        const fader = <MixFader value={c.vol} color={color} segs={vertical ? clamp(h / 8, 8, 40) : clamp(w / 8, 8, 40)} mode={mode} vertical={vertical} onChange={(v) => setVolume(c, v)} />;
        return vertical ? (
          <div className="flex h-full flex-col items-center gap-2">
            {mute}
            <div className="min-h-0 w-full flex-1 px-2">{fader}</div>
            {value}
          </div>
        ) : (
          <div className="flex h-full items-center gap-3">
            {mute}
            <div className="h-6 min-w-0 flex-1">{fader}</div>
            <span className="w-9 shrink-0">{value}</span>
          </div>
        );
      }}
    </Widget>
  );
}
