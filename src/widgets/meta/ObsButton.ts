// ObsButton's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "ObsButton",
  name: "OBS Button",
  category: "Streaming",
  icon: "videocam",
  prefixes: [],
  defaultSize: [1, 1],
  minSize: [1, 1],
  blurb: "Switch scene, mute the mic or save a replay",
  tags: "obs scene mic mute replay button stream",
  description: "A tile that switches OBS to a scene, flips the mic's mute or saves the replay buffer. It rings while its scene is on air and lights while the mic is muted.",
};
