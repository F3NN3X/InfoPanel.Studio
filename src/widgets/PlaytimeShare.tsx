import { Widget, shell, get, num, fmt, rows, hue, Num, LegendRow, type ShellProps, type WidgetMeta } from "./kit";

export const meta: WidgetMeta = {
  id: "PlaytimeShare",
  name: "Playtime Share",
  category: "Gaming",
  icon: "stacked_bar_chart",
  prefixes: [],
  defaultSize: [3, 2],
  minSize: [1, 1],
  blurb: "Two weeks of play, split by game",
  tags: "steam hours",
  description: "How the last two weeks of play split between games — one bar, segments sized by share — with sessions and library totals.",
};

export const PALETTE = [hue(0), hue(70), hue(140), hue(210), hue(280), "rgba(255,255,255,0.35)"];

export interface PlaytimeShareProps extends ShellProps {
  /** Segment colours; default = accent-derived palette. */
  colors?: string[];
}

export default function PlaytimeShare(p: PlaytimeShareProps) {
  const d = p.data;
  const Lb = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Library.${s}`);
  const games = rows(Lb("recent-games")).map(([name, two, total]) => ({ name, two: num(two), total: num(total) }));
  const sum = games.reduce((a, g) => a + (g.two || 0), 0) || 1;
  const pal = p.colors?.length ? p.colors : PALETTE;
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Playtime"}
      icon="stacked_bar_chart"
      studio={{ label: "Playtime · 2 weeks", value: num(Lb("recent-playtime")), d: 1, unit: "h", rows: games.map((g) => ({ n: g.name, v: `${fmt(g.two, 1)} h`, pct: (g.two / sum) * 100 })) }}
      compact={{ label: "Last 2 weeks", value: num(Lb("recent-playtime")), d: 1, unit: "h", sub: games[0]?.name, pct: ((games[0]?.two || 0) / sum) * 100 }}
    >
      {({ w, h }) => {
        // what the figures, the share bar and the lifetime line leave of the height, in 20px rows 6px apart
        const footer = h > 170,
          slim = h > 0 && h < 110;
        const rowsN = slim || (w > 0 && w < 150) ? 0 : Math.max(0, Math.floor((h - 99 - (footer ? 28 : 0) + 6) / 28));
        return (
          <div className={`flex h-full min-w-0 flex-col ${slim ? "justify-center gap-2" : "gap-3"}`}>
            {slim ? (
              <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs text-[color:var(--w-muted)]">
                <Num className="text-xl font-semibold leading-none text-[color:var(--w-fg)]">{fmt(num(Lb("recent-playtime")), 1)}</Num>h
                <span className="truncate">· {fmt(num(Lb("recent-sessions")))} sessions · 2 weeks</span>
              </span>
            ) : (
            <div className="flex items-end gap-6">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[color:var(--w-muted)]">Last 2 weeks</span>
                <span className="text-[28px]">
                  <Num className="leading-none">{fmt(num(Lb("recent-playtime")), 1)}</Num>
                  <span className="ml-1 text-sm text-[color:var(--w-muted)]">h</span>
                </span>
              </div>
              {w >= 240 && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[color:var(--w-muted)]">Sessions</span>
                <span className="text-[28px]">
                  <Num className="leading-none">{fmt(num(Lb("recent-sessions")))}</Num>
                </span>
              </div>
              )}
            </div>
            )}
            <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-md">
              {games.map((g, i) => (
                <span key={g.name} title={`${g.name} · ${fmt(g.two, 1)} h`} className="h-full first:rounded-l-md last:rounded-r-md" style={{ flexGrow: g.two, background: pal[i % pal.length] }} />
              ))}
            </div>
            {rowsN > 0 && (
              <ul className="flex min-h-0 flex-col gap-1.5 overflow-hidden">
                {games.slice(0, rowsN).map((g, i) => (
                  <li key={g.name}>
                    <LegendRow
                      color={pal[i % pal.length]}
                      label={<span className="text-[color:var(--w-fg)]">{g.name}</span>}
                      className="text-[13px]"
                      value={
                        <span className="whitespace-nowrap font-normal text-[color:var(--w-muted)]">
                          <b className="font-medium text-[color:var(--w-fg)]">
                            {fmt(g.two, 1)}
                            {w >= 160 && " h"}
                          </b>
                          {w > 300 && ` · ${fmt(g.total, 1)} h total`}
                        </span>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
            {footer && (
              <span className="mt-auto truncate text-xs text-[color:var(--w-faint)]">
                Library: {fmt(num(Lb("total-games")))} games · {fmt(num(Lb("total-playtime")))} h lifetime
              </span>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
