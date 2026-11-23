import type { CSSProperties } from "react";
import { Widget, shell, get, num, fmt, has, Img, Bar, Stat, GlassPill, Icon, type ShellProps } from "../kit";
import { widgetImage } from "../shared/data-adapter";
import { hoursText } from "../game-spotlight/GameSpotlight";
import { meta } from "./meta";

export { meta };

// The text sits on artwork behind a dark scrim, so it stays light on every surface.
const ON_ART = { color: "#f4f4f5", "--w-fg": "#f4f4f5", "--w-muted": "#d4d4d8", "--w-faint": "#a1a1aa", "--w-track": "rgba(255,255,255,0.15)" } as CSSProperties;

// The playtime figures read over the art, so they are a step above the shared stat value.
const BIG_VALUE = "[&>span:last-child]:text-[20px]";

export interface SteamGameProps extends ShellProps {
  art?: "banner" | "grid" | "none";
  /** Scrim strength 0-1; default 0.55. */
  scrim?: number;
}

export default function SteamGame(p: SteamGameProps) {
  const d = p.data;
  const sessOf = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Session.${s}`);
  const achOf = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Achievements.${s}`);
  const profOf = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Profile.${s}`);
  const art = p.art ?? "banner";
  const bg = widgetImage(art === "grid" ? profOf("game_grid_url") : profOf("current_game_banner_url"));
  const unlocked = num(achOf("achievements-unlocked")),
    total = num(achOf("achievements-total"));
  const scrim = p.scrim ?? 0.55;
  return (
    <Widget
      {...shell(p)}
      bleed
      showHeader={false}
      compact={{ label: "Playing", value: sessOf("current-game"), kind: "text", sub: `${sessOf("current-session-time")} session · ${hoursText(sessOf("current-game-playtime"))}`, img: widgetImage(profOf("current_game_banner_url")), pct: (unlocked / total) * 100, icon: "stadia_controller" }}
    >
      {({ size }) => (
        <div className="relative h-full w-full" style={ON_ART}>
          {art !== "none" && <Img src={bg} icon="sports_esports" className="absolute inset-0 h-full w-full" />}
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, rgb(0 0 0 / ${scrim}) 0, transparent 28%, transparent 55%, rgb(0 0 0 / ${Math.min(1, +(scrim + 0.2).toFixed(2))}) 100%)` }} />
          <div className={`relative flex h-full flex-col ${size === "xs" ? "p-2.5" : "p-4"}`}>
            <div className="flex items-center gap-2">
              {size !== "xs" && <Img src={widgetImage(profOf("game_icon_url"))} icon="stadia_controller" className="h-6 w-6 shrink-0 rounded-md" />}
              <span className="truncate text-micro font-medium uppercase tracking-[0.08em] text-[color:var(--w-muted)]">{profOf("game-status-text") || "Now playing"}</span>
              {size !== "xs" && <GlassPill className="ml-auto">⏱ {sessOf("current-session-time")}</GlassPill>}
            </div>
            <div className="mt-auto flex flex-col gap-2">
              <span className={`${{ xs: "text-base", sm: "text-xl", md: "text-3xl", lg: "text-4xl" }[size]} truncate font-bold leading-tight tracking-tight drop-shadow`}>{sessOf("current-game")}</span>
              {size === "xs" ? (
                <span className="text-xs text-[color:var(--w-muted)]">{sessOf("current-session-time")} session</span>
              ) : (
                <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                  <Stat className={BIG_VALUE} label="Playtime" value={hoursText(sessOf("current-game-playtime"))} />
                  {size !== "sm" && <Stat className={BIG_VALUE} label="Avg session" value={sessOf("avg-session-time")} />}
                  {size === "lg" && <Stat label="Started" value={sessOf("session-start-time")} />}
                  {size !== "sm" && Number.isFinite(total) && (
                    <div className="flex min-w-35 flex-1 flex-col gap-1">
                      <div className="flex justify-between text-micro">
                        <span className="text-[color:var(--w-faint)]">Achievements</span>
                        <span className="tabular-nums text-[color:var(--w-fg)]">
                          {fmt(unlocked)}/{fmt(total)} · {achOf("current-achievements")}
                        </span>
                      </div>
                      <Bar value={unlocked} max={total} className="h-1.5" track="bg-white/15" />
                    </div>
                  )}
                </div>
              )}
              {size === "lg" && has(achOf("latest-achievement")) && (
                <div className="mt-1 flex items-center gap-2.5 rounded-lg bg-black/35 p-2 backdrop-blur-[min(8px,var(--wp-blur-cap,8px))]" data-wp-inner-blur="">
                  <Img src={widgetImage(achOf("latest-achievement-icon"))} icon="trophy" className="h-8 w-8 rounded-md" />
                  <div className="flex min-w-0 flex-col">
                    <span className="text-micro text-[color:var(--w-faint)]">Latest achievement</span>
                    <span className="truncate text-xs font-medium">{achOf("latest-achievement")}</span>
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
