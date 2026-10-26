// StreamDeck's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

/** The plugin's key prefix. */
export const P = "plugins.InfoPanel.StreamDeck.";

export const meta: WidgetMeta = {
  id: "StreamDeck",
  name: "Stream Deck",
  category: "Generic",
  icon: "grid_view",
  prefixes: [P],
  defaultSize: [4, 3],
  minSize: [3, 2],
  blurb: "Stream Deck keys with icons and labels",
  tags: "elgato buttons keys",
  description: "Elgato Stream Deck keys with their icons and labels, one grid per connected device.",
};
