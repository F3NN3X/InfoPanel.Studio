// AudioButton's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "AudioButton",
  name: "Audio Button",
  category: "Audio",
  icon: "volume_up",
  prefixes: [],
  defaultSize: [1, 1],
  minSize: [1, 1],
  blurb: "One tap: mute a channel or switch output",
  tags: "mute unmute output device switch speakers headphones button",
  description: "A tile that mutes a channel (Master, Mic, an app or a Wave Link channel) or switches the default output device. It lights while muted or while it is the active output.",
};
