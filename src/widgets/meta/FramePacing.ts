// FramePacing's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "FramePacing",
  name: "Frame Pacing",
  category: "Gaming",
  icon: "timeline",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [2, 1],
  blurb: "Frame-time graph with budget lines",
  tags: "stutter fps frametime",
  description: "Frame-time graph with refresh-rate and 60 Hz budget lines — average FPS hides stutter, frame-time spikes show it. Friendly empty state when no game runs.",
};
