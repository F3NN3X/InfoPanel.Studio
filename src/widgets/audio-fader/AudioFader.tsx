import { audioRefusal, useAudio } from "@/lib/audio-control";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, fmt, clamp, roomy, Icon, Num, Empty, hue, type ShellProps } from "../kit";
import { findChannel, iconOf } from "../stream-mixer/channels";

/** The master channel's colour, as Stream Mixer draws it: near white on a dark card, `--w-master` on light and theme cards. */
const MASTER_COLOR = "var(--w-master, #e4e4e7)";
import { setVolume, toggleMute } from "../stream-mixer/control";
import { MixFader, type FaderMode } from "../stream-mixer/Fader";
import { ReadOnly } from "../shared/ReadOnly";
import { meta } from "./meta";

export { meta };

export interface AudioFaderProps extends ShellProps {
  look?: ModuleSettings;
  /** The channel: `master`, `mic`, `app:<exe>`, `wl:<channel>` (see `stream-mixer/channels.ts`). */
  channel?: string;
  /** Wave Link's mix for a `wl:` channel: an id, "all", or unset for the first. */
  mix?: string;
  fader?: FaderMode;
  /** Replaces the channel's name. */
  name?: string;
}

export default function AudioFader(p: AudioFaderProps) {
  const audio = useAudio();
  const readOnly = audioRefusal.use();
  const c = findChannel(audio, p.channel ?? "master", p.mix);
  const color = !c || c.mute ? "#52525b" : c.master ? MASTER_COLOR : hue(95);
  const name = p.name || c?.name || "Audio";
  return (
    <Widget {...shell(p)} title={p.title ?? name} icon="tune" showHeader={p.showHeader ?? false}>
      {({ w, h, outerW, outerH }) => {
        if (!c) return <Empty icon="volume_off" label="Channel not found" />;
        const vertical = h > w * 1.15;
        const mode = p.fader === "bar" ? "bar" : "leds";
        // Across a narrow box the value and the gaps come first: the mute tile shrinks to leave the fader some room.
        const wanted = Math.round(clamp(Math.min(w, h) * 0.5, 28, 44));
        const tile = vertical ? wanted : Math.min(wanted, Math.max(24, w - 60));
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
        const fader = <MixFader label={name} value={clamp(c.vol)} color={color} segs={vertical ? clamp(h / 8, 8, 40) : clamp(w / 8, 8, 40)} mode={mode} vertical={vertical} onChange={readOnly ? undefined : (v) => setVolume(c, v)} />;
        // 4x4: a tall fader (64px wide, 70% of the height) with the mute tile and a 56px value beside it
        const big = roomy(outerW, outerH);
        const body = big ? (
          <div className="flex h-full items-center justify-center gap-6">
            <div className="w-16" style={{ height: "70%" }}>
              <MixFader label={name} value={clamp(c.vol)} color={color} segs={clamp(h * 0.7 / 8, 8, 40)} mode={mode} vertical onChange={readOnly ? undefined : (v) => setVolume(c, v)} />
            </div>
            <div className="flex flex-col items-center gap-4">
              <Num className={`leading-none ${c.mute ? "text-zinc-500" : ""}`} style={{ fontSize: 56 }}>
                {fmt(c.vol)}
              </Num>
              {mute}
            </div>
          </div>
        ) : vertical ? (
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
        return <ReadOnly on={readOnly}>{body}</ReadOnly>;
      }}
    </Widget>
  );
}
