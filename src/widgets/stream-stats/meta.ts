// StreamStats's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "StreamStats",
  name: "Stream Stats",
  category: "Streaming",
  icon: "query_stats",
  prefixes: [],
  defaultSize: [3, 2],
  minSize: [1, 1],
  blurb: "OBS bitrate, frame rate, uptime and viewers",
  tags: "obs stream streaming bitrate kbps fps uptime viewers twitch youtube live stats",
  description: "How the stream is doing: OBS's bitrate with its recent trend, frame rate and time on air, and the viewers on Twitch and YouTube. Connect OBS under Settings › Connections.",
};
