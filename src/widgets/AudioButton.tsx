import { audioAct, audioRefusal, useAudio } from "@/lib/audio-control";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, Icon, STATE, type ShellProps } from "./kit";
import { findChannel, iconOf } from "./StreamMixer/channels";
import { toggleMute } from "./StreamMixer/control";
import { ReadOnly } from "./ReadOnly";
import { meta } from "./meta/AudioButton";

export { meta };

export interface AudioButtonProps extends ShellProps {
  look?: ModuleSettings;
  /** `mute` flips a channel's mute; `output` makes a device the default output. */
  action?: "mute" | "output";
  /** The channel to mute: `master`, `mic`, `app:<exe>`, `wl:<channel>` (see `StreamMixer/channels.ts`). */
  channel?: string;
  /** Wave Link's mix for a `wl:` channel: an id, "all", or unset for the first. */
  mix?: string;
  /** The output device's id (`output`). */
  device?: string;
  /** Replaces the name under the symbol. */
  name?: string;
  /** Replaces the symbol (a Material Symbols name). */
  symbol?: string;
}

export default function AudioButton(p: AudioButtonProps) {
  const audio = useAudio();
  const readOnly = audioRefusal.use();
  const output = p.action === "output";
  const device = output ? audio.windows.outputs.find((d) => d.id === p.device) : undefined;
  const channel = output ? undefined : findChannel(audio, p.channel ?? "master", p.mix);
  const active = output ? !!device?.default : !!channel?.mute;
  const name = p.name || (output ? (device?.name ?? "Output") : (channel?.name ?? "Audio"));
  const icon = p.symbol || (output ? "volume_up" : channel ? iconOf(channel) : "volume_off");
  const tint = output ? "var(--accent)" : STATE.crit;
  const ready = output ? !!device : !!channel;
  const press = () => {
    if (output && device) void audioAct({ target: "windows", op: "default", id: device.id });
    else if (channel) toggleMute(channel);
  };
  return (
    <Widget {...shell(p)} title={p.title ?? name} icon="volume_up" showHeader={p.showHeader ?? false} bleed>
      {({ w, h }) => {
        const small = Math.min(w, h) < 90;
        const corner = p.radius === undefined ? "calc(var(--radius, 1rem) * 0.62)" : `${p.radius * 0.62}px`;
        return (
          <ReadOnly on={readOnly}>
          <button
            type="button"
            disabled={!ready}
            onClick={press}
            aria-pressed={active}
            aria-label={name}
            className="flex h-full w-full flex-col items-center justify-center gap-1 transition active:scale-[0.97] disabled:opacity-50"
            style={{
              borderRadius: corner,
              color: active ? tint : "var(--w-fg)",
              background: active ? `color-mix(in oklab, ${tint} 16%, transparent)` : "transparent",
              boxShadow: output && active ? `inset 0 0 0 2px ${tint}` : undefined,
            }}
          >
            <Icon name={icon} className={small ? "text-[26px]" : "text-[34px]"} />
            <span className="max-w-full truncate px-1 text-[12px] font-semibold leading-tight">{name}</span>
            {!small && ready && <span className="text-[11px] text-[color:var(--w-muted)]">{output ? (active ? "Active" : "Switch") : active ? "Muted" : "Live"}</span>}
          </button>
          </ReadOnly>
        );
      }}
    </Widget>
  );
}
