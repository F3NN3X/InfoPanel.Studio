// FrameHistogram's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "FrameHistogram",
  name: "Frame Histogram",
  category: "Gaming",
  icon: "equalizer",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [2, 1],
  blurb: "Frame-time bins with 1% and 0.1% lows",
  tags: "frametime stutter distribution histogram lows fps",
  description: "Frame times of the last minute in bins, with the 1% and 0.1% lows marked and the 60 and 120 fps frame budgets as guides. A tall bar to the right of the guides is stutter. A friendly empty state when no game runs.",
};
