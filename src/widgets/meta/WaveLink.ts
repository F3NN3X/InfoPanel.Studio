// WaveLink's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "WaveLink",
  name: "Wave Link",
  category: "Audio",
  icon: "mic",
  prefixes: [],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Elgato Wave Link channels and gain",
  tags: "elgato microphone",
  description: "The Elgato Wave Link mixer: software channels with live L/R meters, fader, mute and mix routes, output devices and the app's mixes.",
};
