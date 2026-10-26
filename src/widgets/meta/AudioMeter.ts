// AudioMeter's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

/** The amber and hot zones' defaults in dBFS: the LED ladder's 72 % and 90 % of full scale (before config v8 fixed). */
export const AUDIO_WARN_DB = 20 * Math.log10(0.72);
export const AUDIO_HOT_DB = 20 * Math.log10(0.9);

export const meta: WidgetMeta = {
  id: "AudioMeter",
  name: "Audio Meter",
  category: "Audio",
  icon: "graphic_eq",
  prefixes: ["plugins.audio-level-meter."],
  defaultSize: [2, 1],
  minSize: [1, 1],
  blurb: "Left and right level with peak hold",
  tags: "level db sound",
  description: "L/R level, peak, RMS and peak-hold for one device, or a meter bridge for all devices.",
  viewKey: "mode",
  views: [
    { id: "single", name: "One device" },
    { id: "bridge", name: "All devices", blurb: "A meter bridge for every audio device", tags: "bridge mixer devices", defaultSize: [3, 2] },
  ],
};
