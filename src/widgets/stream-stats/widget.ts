// Stream Stats: how the stream is doing. What the registry needs; the component is its own chunk.
// It reads the server's OBS connection and the Twitch and YouTube viewers (`useExtras()`), not sensor data.
import { BOTH, defineWidget } from "../define";
import { boolOf, boolSetting } from "../shared/settings-kit";
import type { StreamStatsProps } from "./StreamStats";
import { meta } from "./meta";

export default defineWidget({
  meta,
  inspector: { header: "yes", compact: BOTH },
  settings: [
    boolSetting("showViewers", "Show viewers", true, { group: "Stats", hint: "Needs Twitch or YouTube signed in under Settings › Connections" }),
    boolSetting("showTrend", "Bitrate trend", true, { group: "Stats" }),
  ],
  render: {
    load: () => import("./StreamStats"),
    toProps: (s): Pick<StreamStatsProps, "showViewers" | "showTrend"> => ({ showViewers: boolOf(s.showViewers), showTrend: boolOf(s.showTrend) }),
  },
});
