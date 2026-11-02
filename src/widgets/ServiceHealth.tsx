import type { ModuleSettings } from "@/modules/types";
import { bodyGap, useFitRows, Widget, shell, get, num, has, Dot, Pill, type ShellProps } from "./kit";
import { meta } from "./meta/ServiceHealth";

export { meta };

export interface ServiceHealthProps extends ShellProps {
  look?: ModuleSettings;
  layout?: "list" | "pills";
}

interface Service {
  label: string;
  ok: boolean;
  note: string;
  idle?: boolean;
}

export default function ServiceHealth(p: ServiceHealthProps) {
  const d = p.data;
  const g = (k: string) => get(d, k);
  const anyKey = (re: RegExp) => Object.keys(d || {}).some((k) => re.test(k));
  const list: Service[] = [
    { label: "Data API", ok: g("system.bridge.status") === "running", note: g("system.bridge.time") },
    { label: "LibreHardwareMonitor", ok: anyKey(/^libre\./), note: "sensors" },
    { label: "RTSS", ok: num(g("plugins.InfoPanel.RTSS.rtss.fps")) > 0, note: num(g("plugins.InfoPanel.RTSS.rtss.fps")) > 0 ? "capturing" : "idle", idle: true },
    { label: "Wave Link", ok: g("plugins.wavelink-plugin.wavelink.status") === "up", note: g("plugins.wavelink-plugin.wavelink.status") },
    { label: "Spotify", ok: num(g("plugins.spotify-plugin.spotify.auth-state")) === 2, note: /idle/i.test(g("plugins.spotify-plugin.spotify.current-track")) ? "idle" : "playing" },
    { label: "Media session", ok: num(g("plugins.media-plugin.media.session-state")) >= 1, note: g("plugins.media-plugin.media.current-track") ? "active" : "none" },
    { label: "Steam", ok: has(g("plugins.InfoPanel.SteamAPI.SteamAPI-Profile.player-name")), note: g("plugins.InfoPanel.SteamAPI.SteamAPI-Profile.online-status") },
    { label: "Weather · Yr", ok: anyKey(/^plugins\.yr-weather-plugin\..+\.temp$/), note: "updated" },
    { label: "Weather · OWM", ok: has(g("plugins.weather-plugin.weather.weather")), note: has(g("plugins.weather-plugin.weather.weather")) ? "ok" : "no API key" },
    { label: "Public IP", ok: has(g("plugins.network-info-plugin.public-ip.ipv4")), note: "online" },
  ];
  const okN = list.filter((x) => x.ok).length;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Sources"}
      icon="health_and_safety"
      studio={{ label: "Sources", live: okN === list.length, value: `${okN}/${list.length}`, sub: "online", pct: (okN / list.length) * 100, rows: list.map((x) => ({ n: x.label, v: x.note, dot: x.ok })) }}
      right={
        <span className="tabular-nums text-[color:var(--w-muted)]">
          {okN}/{list.length}
        </span>
      }
      compact={{ label: "Sources", value: `${okN}/${list.length}`, sub: okN === list.length ? "All online" : `${list.filter((x) => !x.ok).map((x) => x.label).slice(0, 2).join(", ")} off`, pct: (okN / list.length) * 100, kind: "bar", icon: "health_and_safety" }}
    >
      {({ h, w }) => {
        // a 16px row plus the 8px row gap, or the look's gap
        const g = bodyGap(p.look, 8, h);
        return p.layout === "pills" ? (
          <div className="flex h-full flex-wrap content-start gap-1.5 overflow-hidden">
            {list.map((x) => (
              <Pill key={x.label} state={x.ok ? "ok" : "off"}>
                {x.label}
                {x.note && <span className="opacity-70">{x.note}</span>}
              </Pill>
            ))}
          </div>
        ) : (
          <ul className="grid h-full content-start gap-x-4 gap-y-2" style={{ gridTemplateColumns: w > 420 ? "repeat(2, minmax(0,1fr))" : "minmax(0,1fr)" }}>
            {list.slice(0, (w > 420 ? 2 : 1) * useFitRows(h - 8 + g, 16 + g)).map((x) => (
              <li key={x.label} className="flex min-w-0 items-center gap-2 text-xs">
                <Dot ok={x.ok} className={!x.ok && x.idle ? "!bg-amber-400" : ""} />
                <span className="truncate text-[color:var(--w-fg)]">{x.label}</span>
                <span className="ml-auto shrink-0 text-[11px] text-[color:var(--w-faint)]">{x.note}</span>
              </li>
            ))}
          </ul>
        );
      }}
    </Widget>
  );
}
