// StreamMixer's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "StreamMixer",
  name: "Stream Mixer",
  category: "Audio",
  icon: "headphones",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [2, 1],
  blurb: "Touch faders for Windows audio or Wave Link",
  tags: "volume mute fader mixer stream wave link discord apps",
  description: "Large touch faders per device or app: icon, name, status line, LED fader and level, with tap-to-mute. Controls this PC's Windows audio or Elgato Wave Link.",
};
