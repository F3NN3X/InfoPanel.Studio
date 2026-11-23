// Mixer Solo: a one-tap solo of a mixer channel. What the registry needs; the component is its own chunk.
// It reads and writes the server's audio control (`src/lib/audio-control.ts`), not sensor data.
import { defineWidget, NONE } from "../define";
import { audioPick, mixSetting } from "../shared/audio-settings";
import { stringOf, textSetting } from "../shared/settings-kit";
import type { MixerSoloProps } from "./MixerSolo";
import { meta } from "./meta";

export default defineWidget({
  meta,
  inspector: { header: "yes", compact: NONE },
  settings: [
    audioPick("channel", "Channel", { group: "Channel" }),
    mixSetting((v) => String(v.channel ?? "").startsWith("wl:")),
    textSetting("name", "Name", "", { group: "Channel", tab: "show" }),
  ],
  render: {
    load: () => import("./MixerSolo"),
    toProps: (s): Pick<MixerSoloProps, "channel" | "mix" | "name"> => ({ channel: stringOf(s.channel), mix: stringOf(s.mix), name: stringOf(s.name) }),
  },
});
