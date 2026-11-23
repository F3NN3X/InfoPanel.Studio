import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, fmt, Chip, Dot, Empty, Metric, Spark, Stat, roomy, useHistory, type ShellProps } from "../kit";
import { clock } from "../stream-control/layout";
import { useExtras, useInStudio } from "../time-hooks";
import { meta } from "./meta";
import { useUptime } from "./uptime";

export { meta };

export interface StreamStatsProps extends ShellProps {
  look?: ModuleSettings;
  /** The viewers stat, from Twitch and YouTube when signed in (default on). */
  showViewers?: boolean;
  /** The bitrate's recent trend under the number (default on). */
  showTrend?: boolean;
}

export default function StreamStats(p: StreamStatsProps) {
  const extras = useExtras();
  const obs = extras.obs;
  const studio = useInStudio();
  const live = obs.connected && obs.streaming;
  const uptime = useUptime(live, obs.uptime);
  const tw = extras.twitch?.signedIn ? extras.twitch.viewers : undefined;
  const yt = extras.youtube?.signedIn ? extras.youtube.viewers : undefined;
  const viewers = tw === undefined && yt === undefined ? undefined : (tw ?? 0) + (yt ?? 0);
  // Until OBS answers there is nothing to graph (a NaN adds no sample), so a page that mounted before the stream arrived draws what one that mounted after it does.
  const bitrate = useHistory(!obs.connected ? Number.NaN : live ? obs.kbps : 0, 48, 1);
  const word = !obs.connected ? "Not connected" : live ? "Live" : "Offline";
  const showViewers = p.showViewers !== false && viewers !== undefined;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Stream stats"}
      icon="query_stats"
      right={
        <Chip>
          <Dot ok={live} />
          {word}
        </Chip>
      }
      compact={{ label: word, value: live ? fmt(obs.kbps) : "–", unit: live ? "kbps" : undefined, sub: live ? `${fmt(obs.fps)} fps · ${clock(uptime)}` : undefined, icon: "videocam", hist: bitrate, min: 0, kind: "spark", t: live ? "ok" : undefined }}
    >
      {({ size, outerW, outerH }) => {
        if (!obs.connected)
          return (
            <Empty
              icon="videocam_off"
              label="OBS not connected"
              hint={studio && !obs.configured ? "Connect OBS under Settings › Connections" : undefined}
            />
          );
        const big = roomy(outerW, outerH);
        const trend = p.showTrend !== false && size !== "xs" && size !== "sm";
        return (
          <div className="flex h-full min-w-0 flex-col justify-center gap-2">
            <Metric label="Bitrate" value={live ? fmt(obs.kbps) : "–"} unit={live ? "kbps" : undefined} scale={big ? "xl" : "lg"} />
            {trend && <Spark values={bitrate} min={0} className="min-h-6 flex-1" />}
            <div className={`grid gap-3 border-t border-[color:var(--w-track)] pt-2.5 ${showViewers ? "grid-cols-3" : "grid-cols-2"}`}>
              <Stat label="Frame rate" value={live ? fmt(obs.fps) : "–"} unit={live ? "fps" : undefined} />
              <Stat label="Uptime" value={live ? clock(uptime) : "–"} />
              {showViewers && <Stat label="Viewers" value={fmt(viewers ?? 0)} />}
            </div>
          </div>
        );
      }}
    </Widget>
  );
}
