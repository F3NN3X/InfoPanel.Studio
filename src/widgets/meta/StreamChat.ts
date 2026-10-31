// StreamChat's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "StreamChat",
  name: "Stream Chat",
  category: "Streaming",
  icon: "forum",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [2, 2],
  blurb: "Live Twitch chat with a send box",
  tags: "chat twitch youtube stream streaming messages viewers send",
  description: "Live Twitch chat with badge squares, name colours, viewer count, @mention highlight and an optional send box. Sign in under Settings › Connections.",
};
