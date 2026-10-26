// GameSpotlight's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "GameSpotlight",
  name: "Game Spotlight",
  category: "Gaming",
  icon: "stadia_controller",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [1, 1],
  blurb: "Steam art for the game you’re playing",
  tags: "steam banner",
  description: "Now-playing for games: Steam hero banner with slow Ken Burns motion, game logo, poster art and icon, plus session, playtime, FPS, achievements, friends — and an optional music overlay.",
  viewKey: "spotlightLayout",
  views: [
    { id: "hero", name: "Hero" },
    { id: "poster", name: "Poster", blurb: "Game poster art beside its stats", tags: "cover grid art" },
    { id: "logo", name: "Logo", blurb: "The game’s logo over its banner", tags: "title art" },
    { id: "ticker", name: "Ticker", blurb: "One row: icon, logo and session pills", tags: "strip bar row", defaultSize: [4, 1] },
    { id: "combo", name: "Combo (with music)", blurb: "Game banner with a music card", tags: "spotify media music" },
    { id: "composite", name: "Composite (profile, stats, news)", blurb: "Game, profile, stats and news in one", tags: "profile news stats dashboard" },
  ],
};
