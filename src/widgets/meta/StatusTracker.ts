// StatusTracker's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "StatusTracker",
  name: "Status Tracker",
  category: "System",
  icon: "view_week",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [2, 1],
  blurb: "State history, one block per reading",
  tags: "history tracker load",
  description: "History of a state, one block per reading (Tremor Tracker style): OK, 50–80 %, above 80 %, no data. Hover a block for its value.",
};
