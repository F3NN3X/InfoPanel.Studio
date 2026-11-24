// SteamFriends's catalog entry: pure data, so the registry and the generator read it without the component.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "SteamFriends",
  name: "Steam Friends",
  category: "Gaming",
  icon: "group",
  prefixes: ["plugins.InfoPanel.SteamAPI.SteamAPI-Social."],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Friends by status, in-game first",
  tags: "steam online",
  description: "Your Steam friends as a list or a table, color-coded by status: in-game, online, away, busy.",
  views: [
    { id: "list", name: "List" },
    { id: "table", name: "Table", blurb: "Friends in columns: status, game, last seen", tags: "columns grid" },
  ],
  layouts: [
    { id: "standard", name: "Standard" },
    { id: "crew", name: "Crew roster" },
  ],
};
