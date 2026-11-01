import { useFitRows, Widget, shell, get, rows, has, type ShellProps } from "./kit";
import { meta } from "./meta/SteamNews";

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
  const N = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-News.${s}`);
  const lines = p.lines ?? 2;
  const library: NewsItem[] = rows(N("library-news")).map((r) => ({ game: r[0], title: r.slice(1, -1).join(", "), date: r.at(-1) }));
  const items: NewsItem[] = !library.length && has(N("current_game_news_title")) ? [{ game: get(d, "plugins.InfoPanel.SteamAPI.SteamAPI-Session.current-game"), title: N("current_game_news_title") }] : library;
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
      {({ size, h }) => (
        <ul className="flex h-full flex-col gap-3 overflow-hidden">
          {items.slice(0, useFitRows(h, 18 + 22 * lines, 12)).map((n, i) => (
            <li key={i} className="flex min-w-0 gap-3">
              <span className="mt-1 h-auto w-0.5 shrink-0 rounded-full" style={{ background: i === 0 ? "var(--accent)" : "var(--w-track)" }} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-micro font-medium uppercase tracking-[0.06em] text-[color:var(--w-faint)]">
                  {n.game}
                  {n.date ? ` · ${n.date}` : ""}
                </span>
                <span className={`${size === "lg" ? "text-base" : "text-[13px]"} leading-snug text-[color:var(--w-fg)]`} style={{ display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {n.title}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}
