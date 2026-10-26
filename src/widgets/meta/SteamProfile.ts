// SteamProfile's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "SteamProfile",
  name: "Steam Profile",
  category: "Gaming",
  icon: "account_circle",
  prefixes: ["plugins.InfoPanel.SteamAPI.SteamAPI-Profile.", "plugins.InfoPanel.SteamAPI.SteamAPI-Social."],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Avatar, status and friends online",
  tags: "steam friends",
  description: "Avatar, persona, status, level and friends online / in-game with recent activity.",
};
