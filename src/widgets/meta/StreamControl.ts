// StreamControl's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "StreamControl",
  name: "Stream Control",
  category: "Streaming",
  icon: "videocam",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [2, 1],
  blurb: "OBS scenes, live timer, mic mute and replay",
  tags: "obs stream streaming scene scenes live mic mute replay twitch youtube viewers",
  description: "OBS scene buttons, a live tile with the timer and viewers, mic mute with its level and replay save. Connect OBS under Island › On air.",
};
