// Departures's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

/** The plugin's key prefix. */
export const P = "plugins.InfoPanel.VBZ.";

export const meta: WidgetMeta = {
  id: "Departures",
  name: "Departures",
  category: "Info",
  icon: "departure_board",
  prefixes: [P],
  defaultSize: [3, 2],
  minSize: [2, 1],
  blurb: "Next departures from your stop",
  tags: "transit bus tram train vbz",
  description: "Public transport departures from the VBZ plugin: time, line and destination, with the station and status.",
};
