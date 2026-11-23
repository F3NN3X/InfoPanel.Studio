import { audioRefusal, useAudio } from "@/lib/audio-control";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, ButtonTile, type ShellProps } from "../kit";
import { ReadOnly } from "../shared/ReadOnly";
import { allChannels, mixOf, sourceOf } from "../stream-mixer/channels";
import { toggleMute } from "../stream-mixer/control";
import { isSoloed, loadMemory, othersOf, pressSolo, saveMemory } from "./solo";
import { meta } from "./meta";

export { meta };

export interface MixerSoloProps extends ShellProps {
  look?: ModuleSettings;
  /** The channel to solo: `mic`, `app:<exe>`, `wl:<channel>` (see `stream-mixer/channels.ts`); default `master`, which silences every app. */
  channel?: string;
  /** Wave Link's mix for a `wl:` channel: an id, "all", or unset for the first. */
  mix?: string;
  /** Replaces the name under the symbol. */
  name?: string;
}

/** What each solo muted, for its second tap (shared by the widgets of a page, and kept across a reload). */
const memory = loadMemory();

export default function MixerSolo(p: MixerSoloProps) {
  const audio = useAudio();
  const readOnly = audioRefusal.use();
  const id = p.channel ?? "master";
  const channels = allChannels(audio, sourceOf(id), p.mix);
  const channel = channels.find((c) => c.id === id);
  const others = othersOf(channels, id);
  const soloed = isSoloed(channels, id);
  const name = p.name || channel?.name || "Solo";
  const status = !channel ? undefined : soloed ? `Solo · ${others.length} muted` : others.length ? "Tap to solo" : "Nothing to mute";
  const key = `${id}|${mixOf(audio, p.mix) ?? ""}`;
  return (
    <Widget {...shell(p)} title={p.title ?? name} icon="headphones" showHeader={p.showHeader ?? false} bleed>
      {({ w, h }) => {
        const corner = p.radius === undefined ? "calc(var(--radius, 1rem) * 0.62)" : `${p.radius * 0.62}px`;
        return (
          <ReadOnly on={readOnly}>
            <ButtonTile
              w={w}
              h={h}
              icon="headphones"
              name={name}
              status={status}
              tint="var(--w-accent)"
              active={soloed}
              outline={soloed ? "var(--w-accent)" : undefined}
              disabled={!channel || others.length === 0}
              corner={corner}
              onPress={() => {
                pressSolo(channels, id, memory, key, toggleMute);
                saveMemory(memory);
              }}
              label={channel ? `${soloed ? "End solo of" : "Solo"} ${name}` : undefined}
            />
          </ReadOnly>
        );
      }}
    </Widget>
  );
}
