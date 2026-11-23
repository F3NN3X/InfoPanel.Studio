// MixerSolo's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "MixerSolo",
  name: "Mixer Solo",
  category: "Audio",
  icon: "headphones",
  prefixes: [],
  defaultSize: [1, 1],
  minSize: [1, 1],
  blurb: "One tap: hear only one channel",
  tags: "solo isolate mute others mixer channel focus discord game stream",
  description: "A tile that solos a channel (an app, the mic or a Wave Link channel): it mutes every other channel except Master, and a second tap unmutes them again.",
};
