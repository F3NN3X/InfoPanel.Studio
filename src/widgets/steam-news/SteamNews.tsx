import { roomy, SummaryHero, SUMMARY_H, useFitRows, Widget, shell, get, rows, has, type ShellProps } from "../kit";
import { MotionRow } from "@/looks/motion-render";
import { meta } from "./meta";

export { meta };

export interface SteamNewsProps extends ShellProps {
  /** Title line clamp; default 2. */
  lines?: number;
}

interface NewsItem {
  game?: string;
  title?: string;
  date?: string;
}

export default function SteamNews(p: SteamNewsProps) {
  const d = p.data;
  const newsOf = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-News.${s}`);
  const lines = p.lines ?? 2;
  const library: NewsItem[] = rows(newsOf("library-news")).map((r) => ({ game: r[0], title: r.slice(1, -1).join(", "), date: r.at(-1) }));
  const items: NewsItem[] = !library.length && has(newsOf("current_game_news_title")) ? [{ game: get(d, "plugins.InfoPanel.SteamAPI.SteamAPI-Session.current-game"), title: newsOf("current_game_news_title") }] : library;
  const first = items[0] ?? {};
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "News"}
      icon="newspaper"
      // the studio value is one nowrap line, so it carries the headline count and the first headline goes in `sub` and the rows
      studio={{ label: first.game ?? "News", value: items.length, unit: items.length === 1 ? "headline" : "headlines", sub: first.title, rows: items.map((n) => ({ n: n.title ?? "", v: n.date ?? "" })) }}
      compact={{ label: first.game ?? "News", value: first.title, sub: first.date, kind: "text", icon: "newspaper" }}
    >
      {({ size, w, h: boxH }) => {
        // roomy: the headline count on top as the summary; a few headlines are not spread over the height, they grow instead, bigger type and a line more
        const big = roomy(w, boxH),
          h = big && items.length ? boxH - SUMMARY_H : boxH;
        const games = new Set(items.map((n) => n.game).filter(Boolean)).size;
        const list = (
          <ul className={`flex ${big && items.length ? "min-h-0 flex-1" : "h-full"} flex-col gap-3 overflow-hidden`}>
            {items.slice(0, useFitRows(h, 18 + 22 * lines, 12)).map((n, i) => (
              <MotionRow as="li" rowKey={`${n.game ?? ""} ${n.title ?? ""}`} key={i} className="flex min-w-0 gap-3">
                <span className="mt-1 h-auto w-0.5 shrink-0 rounded-full" style={{ background: i === 0 ? "var(--w-accent)" : "var(--w-track)" }} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-micro font-medium uppercase tracking-[0.06em] text-[color:var(--w-faint)]">
                    {n.game}
                    {n.date ? ` · ${n.date}` : ""}
                  </span>
                  <span className={`${big ? "text-title" : size === "lg" ? "text-base" : "text-body"} leading-snug text-[color:var(--w-fg)]`} style={{ display: "-webkit-box", WebkitLineClamp: big ? lines + 1 : lines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {n.title}
                  </span>
                </div>
              </MotionRow>
            ))}
          </ul>
        );
        return big && items.length ? (
          <div className="flex h-full flex-col gap-3">
            <SummaryHero value={items.length} label={items.length === 1 ? "headline" : "headlines"} sub={games > 1 ? `from ${games} games` : first.game} />
            {list}
          </div>
        ) : (
          list
        );
      }}
    </Widget>
  );
}
