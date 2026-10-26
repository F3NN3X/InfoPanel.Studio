// FpsMonitor's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "FpsMonitor",
  name: "FPS Monitor",
  category: "Gaming",
  icon: "speed",
  prefixes: ["plugins.InfoPanel.RTSS.", "plugins.fps-plugin."],
  defaultSize: [3, 2],
  minSize: [1, 1],
  blurb: "Frame rate, 1% low and frame time",
  tags: "rtss framerate",
  description: "RTSS or PresentMon frame rate, 1% low, frame time graph, game and display info.",
  views: [
    // The frame-time graph draws none of the toggles, so any of their values suits it.
    { id: "frametime", name: "Frame-time graph", applies: {} },
    { id: "gauge", name: "Gauge", blurb: "Frame rate on a ring with 1% low", tags: "ring dial", applies: { sparkline: false } },
    { id: "trend", name: "Trend", blurb: "Frame rate ring with a trend sparkline", tags: "ring sparkline history", applies: { sparkline: true } },
  ],
};
