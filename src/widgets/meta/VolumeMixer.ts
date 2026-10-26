// VolumeMixer's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "VolumeMixer",
  name: "Volume Mixer",
  category: "Audio",
  icon: "tune",
  prefixes: ["plugins.volume-plugin.", "plugins.wavelink-plugin."],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Volume and mute per device",
  tags: "sound",
  description: "Per-device volume + mute, default device, and Wave Link status.",
};
