import type { CSSProperties } from "react";
import { Widget, shell, get, num, fmt, has, Img, Bar, Stat, GlassPill, Icon, type ShellProps, type WidgetMeta } from "./kit";
import { widgetImage } from "./data-adapter";
import { hoursText } from "./GameSpotlight";

export const meta: WidgetMeta = {
  id: "SteamGame",
  name: "Current Game",
  category: "Gaming",
  icon: "stadia_controller",
  prefixes: ["plugins.InfoPanel.SteamAPI.SteamAPI-Session.", "plugins.InfoPanel.SteamAPI.SteamAPI-Achievements.", "plugins.InfoPanel.SteamAPI.SteamAPI-Profile.current_game_banner_url", "plugins.InfoPanel.SteamAPI.SteamAPI-Profile.game_"],
  defaultSize: [4, 2],
  minSize: [2, 1],
  blurb: "Session and total playtime",
  tags: "steam session",
  description: "Game hero art, session time, total playtime, average session and achievement progress.",
};

// The text sits on artwork behind a dark scrim, so it stays light on every surface.
const ON_ART = { color: "#f4f4f5", "--w-fg": "#f4f4f5", "--w-muted": "#d4d4d8", "--w-faint": "#a1a1aa", "--w-track": "rgba(255,255,255,0.15)" } as CSSProperties;

export interface SteamGameProps extends ShellProps {
  art?: "banner" | "grid" | "none";
  /** Scrim strength 0-1; default 0.55. */
  scrim?: number;
}

export default function SteamGame(p: SteamGameProps) {
  const d = p.data;
  const S = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Session.${s}`);
  const A = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Achievements.${s}`);
  const P = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Profile.${s}`);
  const art = p.art ?? "banner";
  const bg = widgetImage(art === "grid" ? P("game_grid_url") : P("current_game_banner_url"));
  const unlocked = num(A("achievements-unlocked")),
    total = num(A("achievements-total"));
  const scrim = p.scrim ?? 0.55;
  return (
    <Widget
      {...shell(p)}
      bleed
      showHeader={false}
      compact={{ label: "Playing", value: S("current-game"), kind: "text", sub: `${S("current-session-time")} session · ${hoursText(S("current-game-playtime"))}`, img: widgetImage(P("current_game_banner_url")), pct: (unlocked / total) * 100, icon: "stadia_controller" }}
    >
      {({ size }) => (
        <div className="relative h-full w-full" style={ON_ART}>
          {art !== "none" && <Img src={bg} icon="sports_esports" className="absolute inset-0 h-full w-full" />}
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(10,10,12,${scrim * 0.3}) 0%, rgba(10,10,12,${Math.min(1, scrim + 0.35)}) 100%)` }} />
          <div className={`relative flex h-full flex-col ${size === "xs" ? "p-2.5" : "p-4"}`}>
            <div className="flex items-center gap-2">
              {size !== "xs" && <Img src={widgetImage(P("game_icon_url"))} icon="stadia_controller" className="h-6 w-6 rounded-md" />}
              <span className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--w-muted)]">{P("game-status-text") || "Now playing"}</span>
              {size !== "xs" && <GlassPill className="ml-auto">⏱ {S("current-session-time")}</GlassPill>}
            </div>
            <div className="mt-auto flex flex-col gap-2">
              <span className={`${{ xs: "text-base", sm: "text-xl", md: "text-3xl", lg: "text-4xl" }[size]} truncate font-bold leading-tight tracking-tight drop-shadow`}>{S("current-game")}</span>
              {size === "xs" ? (
                <span className="text-xs text-[color:var(--w-muted)]">{S("current-session-time")} session</span>
              ) : (
                <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                  <Stat label="Playtime" value={hoursText(S("current-game-playtime"))} />
                  {size !== "sm" && <Stat label="Avg session" value={S("avg-session-time")} />}
                  {size === "lg" && <Stat label="Started" value={S("session-start-time")} />}
                  {size !== "sm" && Number.isFinite(total) && (
                    <div className="flex min-w-[140px] flex-1 flex-col gap-1">
                      <div className="flex justify-between text-[10.5px]">
                        <span className="text-[color:var(--w-faint)]">Achievements</span>
                        <span className="tabular-nums text-[color:var(--w-fg)]">
                          {fmt(unlocked)}/{fmt(total)} · {A("current-achievements")}
                        </span>
                      </div>
                      <Bar value={unlocked} max={total} className="h-1.5" track="bg-white/15" />
                    </div>
                  )}
                </div>
              )}
              {size === "lg" && has(A("latest-achievement")) && (
                <div className="mt-1 flex items-center gap-2.5 rounded-lg bg-black/35 p-2 backdrop-blur" data-wp-inner-blur="">
                  <Img src={widgetImage(A("latest-achievement-icon"))} icon="trophy" className="h-8 w-8 rounded-md" />
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[10.5px] text-[color:var(--w-faint)]">Latest achievement</span>
                    <span className="truncate text-xs font-medium">{A("latest-achievement")}</span>
                  </div>
                  <Icon name="trophy" className="ml-auto text-lg text-amber-300" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Widget>
  );
}
