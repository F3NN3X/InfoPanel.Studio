// SteamNews's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "SteamNews",
  name: "Game News",
  category: "Gaming",
  icon: "newspaper",
  prefixes: [],
  defaultSize: [3, 1],
  minSize: [1, 1],
  blurb: "Headlines for your games",
  tags: "steam news",
  description: "Latest headlines for the current game and your library. Long titles clamp to fit.",
};
