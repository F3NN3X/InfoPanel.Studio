import { Widget, shell, get, num, fmt, rows, Metric, Bar, Icon, type ShellProps } from "../kit";
import { meta } from "./meta";

export { meta };

export interface SteamLibraryProps extends ShellProps {
  /** Show the news block; default = at the lg tier only. */
  showNews?: boolean;
}

export default function SteamLibrary(p: SteamLibraryProps) {
  const d = p.data;
  const libOf = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Library.${s}`);
  const newsOf = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-News.${s}`);
  const recent = rows(libOf("recent-games")).map(([name, two, total]) => ({ name, two: num(two), total: num(total) }));
  const news = rows(newsOf("library-news")).map((r) => ({ game: r[0], title: r.slice(1, -1).join(", "), date: r.at(-1) }));
  const maxTwo = Math.max(1, ...recent.map((r) => r.two));
  return (
    <Widget {...shell(p)} title={p.title ?? "Library"} icon="library_books" compact={{ label: "Steam library", value: num(libOf("total-games")), unit: "games", sub: `${fmt(num(libOf("total-playtime")))} hrs played`, kind: "value" }}>
      {({ size, h }) => {
        // xs: the numerals by height (the big-numeral skins step them up a size); the sub line from 80px, the label from 48px
        if (size === "xs")
          return (
            <Metric
              value={num(libOf("total-games"))}
              scale={h === 0 || h >= 100 ? "lg" : h >= 60 ? "md" : "sm"}
              sub={h === 0 || h >= 80 ? `${fmt(num(libOf("total-playtime")))} hrs played` : undefined}
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
              <Metric label="Games" value={num(libOf("total-games"))} scale={size === "sm" ? "md" : "lg"} hero={false} />
              <Metric label="Total hrs" value={num(libOf("total-playtime"))} scale={size === "sm" ? "md" : "lg"} hero={false} />
              <Metric label="2 weeks" value={num(libOf("recent-playtime"))} unit="h" scale={size === "sm" ? "md" : "lg"} hero={false} />
            </div>
            {size !== "sm" && (
              <div className="flex flex-col gap-2.5">
                <div className="flex justify-between text-micro text-[color:var(--w-faint)]">
                  <span>Recently played · {libOf("recent-sessions")}</span>
                  <span>2 wk / total</span>
                </div>
                {recent.slice(0, recentN).map((r) => (
                  <div key={r.name} className="flex flex-col gap-1">
                    <div className="flex justify-between gap-2 text-caption leading-[1.333]">
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
                <span className="flex items-center gap-1 text-micro text-[color:var(--w-faint)]">
                  <Icon name="newspaper" className="text-sm" />
                  News
                </span>
                {news.slice(0, newsN).map((n, i) => (
                  <div key={i} className="flex min-w-0 flex-col">
                    <span className="line-clamp-1 text-caption leading-[1.333] text-[color:var(--w-fg)]">{n.title}</span>
                    <span className="text-micro text-[color:var(--w-faint)]">
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
