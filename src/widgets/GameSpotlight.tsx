import type { CSSProperties } from "react";
import { Widget, GlassPill, shell, get, num, fmt, has, Img, Icon, Bar, Ring, Dot, MediaProgress, KenBurns, Logo, type ShellProps, type WidgetMeta } from "./kit";
import type { ModuleSettings } from "@/modules/types";
import { sizeTierOf } from "@/modules/setting-readers";
import type { VizStyle } from "./core/viz/types";
import { widgetImage } from "./data-adapter";
import { CompositeView } from "./GameSpotlightComposite";

export const meta: WidgetMeta = {
  id: "GameSpotlight",
  name: "Game Spotlight",
  category: "Gaming",
  icon: "stadia_controller",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [1, 1],
  description: "Now-playing for games: Steam hero banner with slow Ken Burns motion, game logo, poster art and icon, plus session, playtime, FPS, achievements, friends — and an optional music overlay.",
};

// Everything here sits on artwork behind a dark scrim, so the text stays light on every surface.
const ON_ART = { color: "#f4f4f5", "--w-fg": "#f4f4f5", "--w-muted": "#d4d4d8", "--w-faint": "#a1a1aa", "--w-track": "rgba(255,255,255,0.15)" } as CSSProperties;

/** A playtime sensor ("263.3999… hrs") as "263.4 h"; other text passes through. */
export const hoursText = (v: string): string => {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(?:h|hrs?)?\s*$/i.exec(String(v));
  return m ? `${fmt(Number(m[1]), 1)} h` : v;
};

export interface GameSpotlightProps extends ShellProps {
  /** `composite`: the old Steam card in one layout (profile, session, playtime, library, achievements, friends, news). */
  layout?: "hero" | "poster" | "logo" | "ticker" | "combo" | "composite";
  /** Ken Burns motion; default on. */
  motion?: boolean;
  /** Scrim strength 0-1; default 0.6. */
  scrim?: number;
  /** Music overlay source. */
  music?: "media" | "spotify";
  /** Progress of the combo music card. */
  progress?: "wave" | "visualizer";
  vizMode?: VizStyle;
  /** Composite: the achievements / library / friends column; default on. */
  showStats?: boolean;
  /** Composite: the news line; default on. */
  showNews?: boolean;
  /** The zone's resolved look; its Density (`sizeTier`) forces the composite variant. */
  look?: ModuleSettings;
}

/**
 * The smallest content box (px) each layout fits without overflow, measured with `?widget-qa` across the
 * skins: the hero drops its stats below 150px and fits from 110px high (its pills need ~250px wide in the padded skins); the
 * combo's music card and the poster's stats need more height; the ticker's pills need width.
 */
export const LAYOUT_MIN: Record<string, { w: number; h: number }> = {
  hero: { w: 250, h: 110 },
  logo: { w: 160, h: 110 },
  combo: { w: 260, h: 180 },
  poster: { w: 340, h: 200 },
  ticker: { w: 320, h: 0 },
};
/** The tall poster (art above the title) takes over from a poster that is too narrow, from this height. */
const POSTER_TALL_H = 260;

/**
 * The layout to draw: the chosen one while the box can hold it (`LAYOUT_MIN`), else the hero, else the
 * ticker (one row: icon, logo, pills), else the mini card (art, logo, session time); a narrow box gets the tall poster. Decided by what the content
 * needs, not the box's aspect ratio, so a wide short zone on a grid of short rows keeps its layout.
 */
export function fitLayout(chosen: NonNullable<GameSpotlightProps["layout"]>, w: number, h: number, shape: string): string {
  if (!w || !h) return chosen; // not measured yet (first paint, server render)
  const fits = (lay: string) => w >= LAYOUT_MIN[lay].w && h >= LAYOUT_MIN[lay].h;
  if (shape === "column" || (w < LAYOUT_MIN.hero.w && h >= LAYOUT_MIN.poster.h)) return "poster-tall";
  if (chosen in LAYOUT_MIN && fits(chosen)) return chosen;
  if (chosen === "poster" && h >= POSTER_TALL_H) return "poster-tall";
  return fits("hero") ? "hero" : fits("ticker") ? "ticker" : "mini";
}

export default function GameSpotlight(p: GameSpotlightProps) {
  const d = p.data;
  const P = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Profile.${s}`);
  const S = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Session.${s}`);
  const A = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Achievements.${s}`);
  const game = S("current-game"),
    banner = widgetImage(P("current_game_banner_url")),
    logo = widgetImage(P("game_logo_url")),
    poster = widgetImage(P("game_grid_url")),
    icon = widgetImage(P("game_icon_url"));
  const fps = num(get(d, "plugins.InfoPanel.RTSS.rtss.fps"));
  const un = num(A("achievements-unlocked")),
    tot = num(A("achievements-total")),
    ach = (un / tot) * 100;
  const inGame = num(get(d, "plugins.InfoPanel.SteamAPI.SteamAPI-Social.friends-ingame"));
  const ms = p.music === "spotify" ? "plugins.spotify-plugin.spotify" : "plugins.media-plugin.media";
  const track = get(d, `${ms}.current-track`),
    artist = get(d, `${ms}.artist`),
    prog = num(get(d, `${ms}.track-progress`));
  const motion = p.motion !== false,
    scrim = p.scrim ?? 0.6;
  const statusText = P("game-status-text") || "Now playing";
  const stats: [string, string][] = [["Session", S("current-session-time")], ["Playtime", hoursText(S("current-game-playtime"))], ["Avg session", S("avg-session-time")], ...(fps > 0 ? [["FPS", fmt(fps)] as [string, string]] : [])];

  return (
    <Widget
      {...shell(p)}
      bleed
      showHeader={false}
      studio={{ label: statusText, live: true, value: game, sub: `${S("current-session-time")} session · ${hoursText(S("current-game-playtime"))}`, img: poster || banner, kind: "text", progress: { a: "Achievements", pct: ach, b: `${fmt(ach)}%` } }}
      compact={(box) => (box.shape === "tile" && p.layout !== "composite" ? { label: statusText, value: game, kind: "text", sub: `${S("current-session-time")} session`, img: poster || banner, pct: ach, icon: "stadia_controller" } : undefined)}
    >
      {({ w, h, shape }) => {
        if (p.layout === "composite") {
          const N = (container: string, id: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-${container}.${id}`);
          return (
            <CompositeView
              w={w}
              h={h}
              forced={p.look && sizeTierOf(p.look)}
              accent={p.accent}
              name={P("player-name")}
              status={P("online-status")}
              level={num(P("steam-level"))}
              avatar={widgetImage(P("profile_image_url"))}
              game={game}
              playtime={num(S("current-game-playtime"))}
              sessionTime={S("current-session-time")}
              sessionStart={S("session-start-time")}
              banner={banner}
              logo={logo}
              icon={icon}
              totalGames={num(N("Library", "total-games"))}
              achPct={num(A("current-achievements"))}
              latestAch={A("latest-achievement")}
              achIcon={widgetImage(A("latest-achievement-icon"))}
              friendsOnline={num(N("Social", "friends-online"))}
              totalFriends={num(N("Social", "total-friends"))}
              news={N("News", "current_game_news_title")}
              showStats={p.showStats !== false}
              showNews={p.showNews !== false}
              motion={motion}
              scrim={scrim}
            />
          );
        }
        const lay = fitLayout(p.layout ?? "hero", w, h, shape);
        const big = h > 260 ? "text-5xl" : h > 180 ? "text-4xl" : "text-2xl";
        if (lay === "ticker")
          return (
            <div className="relative flex h-full items-center gap-4 overflow-hidden px-4" style={ON_ART}>
              <KenBurns src={banner} on={motion} className="opacity-45" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/20" />
              <Img src={icon} icon="stadia_controller" className="relative aspect-square h-[58%] shrink-0 rounded-xl ring-1 ring-white/15" />
              <div className="relative flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-[color:var(--w-muted)]">
                  <Dot ok />
                  {statusText}
                </span>
                <Logo src={logo} name={game} size="text-xl" className="max-h-9 max-w-full" />
              </div>
              <div className="relative flex shrink-0 items-center gap-2">
                {w > 520 && fps > 0 && (
                  <GlassPill>
                    <Icon name="speed" className="text-sm" />
                    {fmt(fps)} fps
                  </GlassPill>
                )}
                <GlassPill>
                  <Icon name="timer" className="text-sm" />
                  {S("current-session-time")}
                </GlassPill>
                {w > 420 && Number.isFinite(ach) && (
                  <div className="h-9 w-9">
                    <Ring value={ach} thickness={12} className="h-full w-full">
                      <span className="text-[9px] font-semibold">{fmt(ach)}</span>
                    </Ring>
                  </div>
                )}
              </div>
            </div>
          );
        if (lay === "poster" || lay === "poster-tall") {
          const tall = lay === "poster-tall" || h > w;
          return (
            <div className={`relative flex h-full overflow-hidden ${tall ? "flex-col" : "flex-row"}`} style={ON_ART}>
              <KenBurns src={banner} on={false} className="scale-110 opacity-60 blur-2xl" />
              <div className="absolute inset-0 bg-black/55" />
              <div className={`relative p-3 ${tall ? "min-h-0 flex-1" : "h-full shrink-0"}`}>
                <Img src={poster} icon="image" className={`h-full rounded-xl object-cover shadow-2xl ring-1 ring-white/10 ${tall ? "w-full" : "aspect-[2/3]"}`} />
              </div>
              <div className={`relative flex min-w-0 flex-col gap-3 ${tall ? "shrink-0 p-3 pt-0" : "flex-1 justify-between p-4 pl-1"}`}>
                <div className="flex flex-col gap-1">
                  <span className="truncate text-[10.5px] font-medium uppercase tracking-[0.12em] text-[color:var(--w-faint)]">{statusText}</span>
                  <span className={`${tall ? "line-clamp-2 text-sm" : "text-2xl"} font-bold leading-tight`}>{game}</span>
                </div>
                <div className={`grid gap-x-4 gap-y-2 ${tall && w < 150 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {stats.slice(0, tall ? (w < 150 ? 1 : 2) : 4).map(([l, v]) => (
                    <div key={l} className="flex flex-col">
                      <span className="text-[10.5px] text-[color:var(--w-faint)]">{l}</span>
                      <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{v}</span>
                    </div>
                  ))}
                </div>
                {Number.isFinite(ach) && !tall && (
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10.5px] text-[color:var(--w-faint)]">
                      <span>Achievements</span>
                      <span className="tabular-nums">
                        {fmt(un)}/{fmt(tot)}
                      </span>
                    </div>
                    <Bar value={ach} className="h-1.5" track="bg-white/15" />
                  </div>
                )}
              </div>
            </div>
          );
        }
        if (lay === "mini")
          return (
            <div className="relative flex h-full min-w-0 flex-col items-center justify-center gap-1.5 overflow-hidden p-2 text-center" style={ON_ART}>
              <KenBurns src={banner} on={motion} className="opacity-60" />
              <div className="absolute inset-0 bg-black/55" />
              <Logo src={logo} name={game} size="text-sm" className="relative mx-auto max-h-[55%] max-w-full !object-center text-center" />
              {h >= 56 && (
                <span className="relative flex max-w-full items-center gap-1.5 text-[11px] text-[color:var(--w-fg)]">
                  <Dot ok />
                  <span className="truncate tabular-nums">{S("current-session-time")}</span>
                </span>
              )}
            </div>
          );
        if (lay === "logo")
          return (
            <div className="relative flex h-full flex-col items-center justify-center gap-3 overflow-hidden p-5 text-center" style={ON_ART}>
              <KenBurns src={banner} on={motion} className="scale-110 blur-md" />
              <div className="absolute inset-0" style={{ background: `radial-gradient(80% 70% at 50% 50%, rgba(0,0,0,${scrim * 0.3}), rgba(0,0,0,${Math.min(1, scrim + 0.25)}))` }} />
              <Logo src={logo} name={game} size={big} className="relative mx-auto max-h-[45%] max-w-[80%] !object-center text-center" />
              <span className="relative flex items-center gap-2 text-xs text-[color:var(--w-fg)]">
                <Dot ok />
                {S("current-session-time")} this session · {hoursText(S("current-game-playtime"))}
              </span>
            </div>
          );
        return (
          <div className="relative h-full overflow-hidden" style={ON_ART}>
            <KenBurns src={banner} on={motion} />
            <div className="absolute inset-0" style={{ background: `linear-gradient(0deg, rgba(8,8,10,${Math.min(1, scrim + 0.35)}) 0%, rgba(8,8,10,${scrim * 0.5}) 45%, rgba(8,8,10,${scrim * 0.15}) 100%), linear-gradient(90deg, rgba(8,8,10,${scrim * 0.7}), transparent 60%)` }} />
            <div className="relative flex h-full flex-col p-4">
              <div className="flex items-center gap-2">
                <GlassPill>
                  <Dot ok />
                  {statusText}
                </GlassPill>
                {inGame > 0 && w > 380 && (
                  <GlassPill>
                    <Icon name="group" className="text-sm" />
                    {inGame} friend{inGame > 1 ? "s" : ""} in-game
                  </GlassPill>
                )}
                <GlassPill className="ml-auto">
                  <Icon name="timer" className="text-sm" />
                  {S("current-session-time")}
                </GlassPill>
              </div>
              <div className="mt-auto flex flex-col gap-3">
                <Logo src={logo} name={game} size={big} className={`${h > 220 ? "max-h-24" : "max-h-14"} max-w-[65%]`} />
                {lay === "combo" && has(track) ? (
                  <div className="flex max-w-md items-center gap-3 rounded-2xl bg-black/45 p-2.5 ring-1 ring-white/10 backdrop-blur-xl">
                    <Img src={widgetImage(get(d, `${ms}.cover-art`))} icon="music_note" className="h-10 w-10 shrink-0 rounded-lg" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-xs font-semibold">{track}</span>
                      <span className="truncate text-[11px] text-[color:var(--w-faint)]">{has(artist) ? artist : "Now playing"}</span>
                      <MediaProgress
                        mode={p.progress === "visualizer" ? "visualizer" : "wave"}
                        pct={prog > 1 ? prog : prog * 100}
                        data={d}
                        device="default-audio"
                        vizMode={p.vizMode}
                        className="h-6"
                        barClassName="h-2"
                      />
                    </div>
                  </div>
                ) : (
                  h > 150 && (
                    <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                      {stats.slice(0, w > 560 ? 4 : 2).map(([l, v]) => (
                        <div key={l} className="flex flex-col">
                          <span className="text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--w-faint)]">{l}</span>
                          <span className="text-[15px] font-semibold tabular-nums">{v}</span>
                        </div>
                      ))}
                      {Number.isFinite(ach) && w > 420 && (
                        <div className="ml-auto flex min-w-[150px] max-w-[220px] flex-1 flex-col gap-1">
                          <div className="flex justify-between text-[10.5px]">
                            <span className="flex items-center gap-1 text-[color:var(--w-faint)]">
                              <Icon name="trophy" className="text-sm text-amber-300" />
                              {A("latest-achievement")}
                            </span>
                            <span className="shrink-0 tabular-nums text-[color:var(--w-fg)]">{fmt(ach)}%</span>
                          </div>
                          <Bar value={ach} className="h-1.5" track="bg-white/15" />
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        );
      }}
    </Widget>
  );
}
