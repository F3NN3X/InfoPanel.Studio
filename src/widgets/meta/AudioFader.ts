// AudioFader's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "AudioFader",
  name: "Audio Fader",
  category: "Audio",
  icon: "tune",
  prefixes: [],
  defaultSize: [1, 2],
  minSize: [1, 1],
  blurb: "One touch fader for a channel",
  tags: "volume fader slider mixer",
  description: "A single fader for one channel (Master, Mic, an app or a Wave Link channel), vertical in a tall zone and horizontal in a wide one.",
};
