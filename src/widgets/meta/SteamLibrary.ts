// SteamLibrary's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "SteamLibrary",
  name: "Steam Library",
  category: "Gaming",
  icon: "library_books",
  prefixes: ["plugins.InfoPanel.SteamAPI.SteamAPI-Library.", "plugins.InfoPanel.SteamAPI.SteamAPI-News."],
  defaultSize: [3, 2],
  minSize: [1, 1],
  blurb: "Games owned and recent playtime",
  tags: "steam games",
  description: "Games owned, total + recent playtime, recent games with 2-week hours, and game news.",
};
