import { Widget, shell, get, num, fmt, has, Ring, Img, Icon, useSkin, numFont, type ShellProps } from "./kit";
import { widgetImage } from "./data-adapter";
import { meta } from "./meta/Achievements";

export { meta };

export interface AchievementsProps extends ShellProps {
  /** `pips` shows one square per achievement instead of the ring. */
  display?: "ring" | "pips";
}

export default function Achievements(p: AchievementsProps) {
  const d = p.data;
  const sk = useSkin();
  const A = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Achievements.${s}`);
  const game = get(d, "plugins.InfoPanel.SteamAPI.SteamAPI-Session.current-game");
  const un = num(A("achievements-unlocked")),
    tot = num(A("achievements-total")),
    pct = (un / tot) * 100;
  const latestIcon = widgetImage(A("latest-achievement-icon"));
  return (
    <Widget {...shell(p)} title={p.title ?? game} icon="trophy" compact={{ label: "Achievements", value: pct, unit: "%", sub: `${fmt(un)} / ${fmt(tot)}`, pct, kind: "ring", icon: "trophy" }}>
      {({ size, w, h }) =>
        p.display === "pips" ? (
          <div className="flex h-full min-w-0 flex-col gap-2.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-bold leading-none tabular-nums" style={{ ...numFont(sk) }}>
                {fmt(un)} / {fmt(tot)}
              </span>
              <span className="text-sm text-[color:var(--w-muted)]">{fmt(pct, 0)}%</span>
            </div>
            <div className="grid min-h-0 gap-[3px]" style={{ gridTemplateColumns: `repeat(${Math.min(tot || 1, Math.max(10, Math.floor(w / 14)))}, minmax(0,1fr))` }}>
              {Array.from({ length: tot || 0 }, (_, i) => (
                <span key={i} className="aspect-square rounded-[3px] transition-colors duration-500" style={{ background: i < un ? "var(--accent)" : "var(--w-track)" }} />
              ))}
            </div>
            {h > 150 && has(A("latest-achievement")) && (
              <div className="mt-auto flex min-w-0 flex-col gap-0.5 text-xs">
                <span className="text-micro uppercase tracking-[0.06em] text-[color:var(--w-faint)]">Latest unlock</span>
                <span className="truncate font-medium">{A("latest-achievement")}</span>
                <span className="text-[color:var(--w-faint)]">{fmt(tot - un)} left to 100%</span>
              </div>
            )}
          </div>
        ) : (
          <div className={`flex h-full min-w-0 items-center gap-4 ${w < 230 ? "justify-center" : ""}`}>
            <div className="shrink-0" style={{ width: Math.max(40, Math.min(h, 150, w < 230 ? w : w * 0.45)) }}>
            <Ring value={pct} thickness={9}>
              <span className={`${size === "lg" ? "text-3xl" : Math.min(h, w) < 76 ? "text-base" : "text-xl"} font-semibold tabular-nums`}>
                {fmt(pct, 0)}
                <span className="text-xs text-[color:var(--w-muted)]">%</span>
              </span>
              {Math.min(h, w) >= 76 && (
                <span className="text-micro text-[color:var(--w-faint)]">
                  {fmt(un)}/{fmt(tot)}
                </span>
              )}
            </Ring>
            </div>
            {w >= 230 && has(A("latest-achievement")) && (
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-micro uppercase tracking-[0.08em] text-[color:var(--w-faint)]">Latest unlock</span>
                <div className="flex min-w-0 items-center gap-2.5">
                  <Img src={latestIcon} icon="trophy" className={`${size === "lg" ? "h-12 w-12" : "h-9 w-9"} shrink-0 rounded-lg`} />
                  <span className={`${size === "lg" ? "text-base" : "text-sm"} line-clamp-2 font-medium leading-snug`}>{A("latest-achievement")}</span>
                </div>
                {size === "lg" && (
                  <span className="flex items-center gap-1 text-xs text-[color:var(--w-muted)]">
                    <Icon name="lock_open" className="text-sm" />
                    {fmt(tot - un)} still locked
                  </span>
                )}
              </div>
            )}
          </div>
        )
      }
    </Widget>
  );
}
