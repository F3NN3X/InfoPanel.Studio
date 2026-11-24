import type { ModuleSettings } from "@/modules/types";
import { MotionRow } from "@/looks/motion-render";
import { bodyGap, fillRows, roomy, SummaryHero, SUMMARY_H, useFitRows, Widget, shell, get, num, has, Dot, Pill, type ShellProps } from "../kit";
import { meta } from "./meta";

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
        // roomy: the summary on top and one column that fills the height under it; the two-column list is for a wide, short box
        const big = roomy(w, h),
          cols = w > 420 && !big ? 2 : 1,
          rowMin = big ? 20 : 16,
          listH = big ? h - SUMMARY_H : h,
          shown = Math.min(list.length, cols * useFitRows(listH - 8 + g, rowMin + g)),
          fill = fillRows(listH, shown, rowMin, g, big);
        const down = list.filter((x) => !x.ok);
        const body = p.layout === "pills" ? (
          <div className="flex h-full flex-wrap content-start gap-1.5 overflow-hidden">
            {list.map((x) => (
              <Pill key={x.label} state={x.ok ? "ok" : "off"}>
                {x.label}
                {x.note && <span className="opacity-70">{x.note}</span>}
              </Pill>
            ))}
          </div>
        ) : (
          <ul className={`grid h-full gap-x-4 gap-y-2 ${fill.spread ? "content-evenly" : "content-start"}`} style={{ gridTemplateColumns: cols === 2 ? "repeat(2, minmax(0,1fr))" : "minmax(0,1fr)" }}>
            {list.slice(0, shown).map((x) => (
              <MotionRow as="li" rowKey={x.label} key={x.label} className="flex min-w-0 items-center gap-2 text-caption leading-[1.333]" style={{ minHeight: fill.rowH }}>
                <Dot ok={x.ok} className={!x.ok && x.idle ? "!bg-amber-400" : ""} />
                <span className="truncate text-[color:var(--w-fg)]">{x.label}</span>
                <span className="ml-auto shrink-0 text-micro text-[color:var(--w-faint)]">{x.note}</span>
              </MotionRow>
            ))}
          </ul>
        );
        return big ? (
          <div className="flex h-full flex-col gap-3">
            <SummaryHero value={`${okN}/${list.length}`} t={down.length ? "warn" : "ok"} label={down.length ? "Sources online" : "All sources online"} sub={down.length ? `${down.map((x) => x.label).slice(0, 2).join(", ")}${down.length > 2 ? ` +${down.length - 2}` : ""} off` : undefined} />
            <div className="min-h-0 flex-1">{body}</div>
          </div>
        ) : (
          body
        );
      }}
    </Widget>
  );
}
