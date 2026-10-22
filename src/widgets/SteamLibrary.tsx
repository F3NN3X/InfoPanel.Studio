import { Widget, shell, get, num, fmt, rows, Metric, Bar, Icon, type ShellProps, type WidgetMeta } from "./kit";

export const meta: WidgetMeta = {
  id: "SteamLibrary",
  name: "Steam Library",
  category: "Gaming",
  icon: "library_books",
  prefixes: ["plugins.InfoPanel.SteamAPI.SteamAPI-Library.", "plugins.InfoPanel.SteamAPI.SteamAPI-News."],
  defaultSize: [3, 2],
  minSize: [1, 1],
  blurb: "Games owned and recent playtime",
  tags: "steam games",
  description: "Games owned, total + recent playtime, recent games with 2-week hours, and game news.",
};

export interface SteamLibraryProps extends ShellProps {
  /** Show the news block; default = at the lg tier only. */
  showNews?: boolean;
}

export default function SteamLibrary(p: SteamLibraryProps) {
  const d = p.data;
  const L = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Library.${s}`);
  const N = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-News.${s}`);
  const recent = rows(L("recent-games")).map(([name, two, total]) => ({ name, two: num(two), total: num(total) }));
  const news = rows(N("library-news")).map((r) => ({ game: r[0], title: r.slice(1, -1).join(", "), date: r.at(-1) }));
  const maxTwo = Math.max(1, ...recent.map((r) => r.two));
  return (
    <Widget {...shell(p)} title={p.title ?? "Library"} icon="library_books" compact={{ label: "Steam library", value: num(L("total-games")), unit: "games", sub: `${fmt(num(L("total-playtime")))} hrs played`, kind: "value" }}>
      {({ size, h }) => {
        // xs: the numerals by height (the big-numeral skins step them up a size); the sub line from 80px, the label from 48px
        if (size === "xs")
          return (
            <Metric
              value={num(L("total-games"))}
              scale={h === 0 || h >= 100 ? "lg" : h >= 60 ? "md" : "sm"}
              sub={h === 0 || h >= 80 ? `${fmt(num(L("total-playtime")))} hrs played` : undefined}
              label={h === 0 || h >= 48 ? "Games" : undefined}
              className="h-full justify-center"
            />
          );
        // The recent-games rows and then the news rows take what the metrics leave of the height.
        const recentN = size === "sm" ? 0 : Math.max(1, Math.floor((h - 110) / 34));
        const newsN = (p.showNews ?? size === "lg") ? Math.max(0, Math.floor((h - 110 - recentN * 34 - 50) / 32)) : 0;
        return (
          <div className="flex h-full flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Games" value={num(L("total-games"))} scale={size === "sm" ? "md" : "lg"} />
              <Metric label="Total hrs" value={num(L("total-playtime"))} scale={size === "sm" ? "md" : "lg"} />
              <Metric label="2 weeks" value={num(L("recent-playtime"))} unit="h" scale={size === "sm" ? "md" : "lg"} />
            </div>
            {size !== "sm" && (
              <div className="flex flex-col gap-2.5">
                <div className="flex justify-between text-[11px] text-[color:var(--w-faint)]">
                  <span>Recently played · {L("recent-sessions")}</span>
                  <span>2 wk / total</span>
                </div>
                {recent.slice(0, recentN).map((r) => (
                  <div key={r.name} className="flex flex-col gap-1">
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="truncate text-[color:var(--w-fg)]">{r.name}</span>
                      <span className="shrink-0 tabular-nums text-[color:var(--w-muted)]">
                        {fmt(r.two, 1)}h / {fmt(r.total, 1)}h
                      </span>
                    </div>
                    <Bar value={r.two} max={maxTwo} className="h-1" />
                  </div>
                ))}
              </div>
            )}
            {newsN > 0 && news.length > 0 && (
              <div className="flex min-h-0 flex-col gap-2 overflow-hidden border-t border-[color:var(--w-track)] pt-3">
                <span className="flex items-center gap-1 text-[11px] text-[color:var(--w-faint)]">
                  <Icon name="newspaper" className="text-sm" />
                  News
                </span>
                {news.slice(0, newsN).map((n, i) => (
                  <div key={i} className="flex min-w-0 flex-col">
                    <span className="line-clamp-1 text-xs text-[color:var(--w-fg)]">{n.title}</span>
                    <span className="text-[10.5px] text-[color:var(--w-faint)]">
                      {n.game} · {n.date}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
