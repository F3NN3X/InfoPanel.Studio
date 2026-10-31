// StreamDeck's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "StreamDeck",
  name: "Elgato Stream Deck",
  category: "Streaming",
  icon: "grid_view",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [1, 1],
  blurb: "A virtual Stream Deck with real keys",
  tags: "elgato stream deck keys buttons macro hotkeys virtual pages",
  description: "A virtual Elgato Stream Deck: its keys come from the Stream Deck app, a press runs the real action. Turn it on under Settings › Connections, then pick or create a device.",
};
