import { Widget, shell, get, num, fmt, has, roomy, Ring, RING_TEXT, Img, Icon, useSkin, numFont, type ShellProps } from "../kit";
import { widgetImage } from "../shared/data-adapter";
import { meta } from "./meta";

export { meta };

export interface AchievementsProps extends ShellProps {
  /** `pips` shows one square per achievement instead of the ring. */
  display?: "ring" | "pips";
}

export default function Achievements(p: AchievementsProps) {
  const d = p.data;
  const sk = useSkin();
  const achOf = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Achievements.${s}`);
  const game = get(d, "plugins.InfoPanel.SteamAPI.SteamAPI-Session.current-game");
  const un = num(achOf("achievements-unlocked")),
    tot = num(achOf("achievements-total")),
    pct = (un / tot) * 100;
  const latestIcon = widgetImage(achOf("latest-achievement-icon"));
  return (
    <Widget {...shell(p)} title={p.title ?? game} icon="trophy" compact={{ label: "Achievements", value: pct, unit: "%", sub: `${fmt(un)} / ${fmt(tot)}`, pct, kind: "ring", icon: "trophy" }}>
      {({ size, w, h, outerW, outerH }) =>
        p.display === "pips" ? (
          <div className="flex h-full min-w-0 flex-col gap-2.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-bold leading-none tabular-nums" style={{ ...numFont(sk) }}>
                {fmt(un)} / {fmt(tot)}
              </span>
              <span className="text-sm text-[color:var(--w-muted)]">{fmt(pct, 0)}%</span>
            </div>
            <div className="grid min-h-0 gap-0.75" style={{ gridTemplateColumns: `repeat(${Math.min(tot || 1, Math.max(10, Math.floor(w / 14)))}, minmax(0,1fr))` }}>
              {Array.from({ length: tot || 0 }, (_, i) => (
                <span key={i} className="aspect-square rounded-3 transition-colors duration-500" style={{ background: i < un ? "var(--w-accent)" : "var(--w-track)" }} />
              ))}
            </div>
            {h > 150 && has(achOf("latest-achievement")) && (
              <div className="mt-auto flex min-w-0 flex-col gap-0.5 text-xs">
                <span className="text-micro uppercase tracking-[0.06em] text-[color:var(--w-faint)]">Latest unlock</span>
                <span className="truncate font-medium">{achOf("latest-achievement")}</span>
                <span className="text-[color:var(--w-faint)]">{fmt(tot - un)} left to 100%</span>
              </div>
            )}
          </div>
        ) : roomy(outerW, outerH) ? (
          // 4x4: the ring up top, the latest unlock under it (the plugin reports only the latest)
          <div className="flex h-full min-w-0 flex-col items-center gap-4">
            <div className="shrink-0" style={{ width: Math.max(40, Math.min(w, h * 0.55)) }}>
              <Ring value={pct}>
                <span className="font-semibold tabular-nums" style={RING_TEXT.value}>
                  {fmt(pct, 0)}
                  <span className="text-[color:var(--w-muted)]" style={RING_TEXT.unit}>%</span>
                </span>
                <span className="text-[color:var(--w-faint)]" style={RING_TEXT.sub}>
                  {fmt(un)}/{fmt(tot)}
                </span>
              </Ring>
            </div>
            {has(achOf("latest-achievement")) && (
              <div className="mt-auto flex w-full min-w-0 flex-col gap-2 border-t border-[color:var(--w-track)] pt-3">
                <span className="text-micro uppercase tracking-[0.08em] text-[color:var(--w-faint)]">Latest unlock</span>
                <div className="flex min-w-0 items-center gap-3">
                  <Img src={latestIcon} icon="trophy" className="h-8 w-8 shrink-0 rounded-lg" />
                  <span className="line-clamp-2 min-w-0 flex-1 text-body font-medium leading-snug">{achOf("latest-achievement")}</span>
                  <span className="shrink-0 text-caption text-[color:var(--w-muted)]">{fmt(tot - un)} locked</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={`flex h-full min-w-0 items-center gap-4 ${w < 230 ? "justify-center" : ""}`}>
            <div className="shrink-0" style={{ width: Math.max(40, Math.min(h, 150, w < 230 ? w : w * 0.45)) }}>
            <Ring value={pct}>
              <span className="font-semibold tabular-nums" style={RING_TEXT.value}>
                {fmt(pct, 0)}
                <span className="text-[color:var(--w-muted)]" style={RING_TEXT.unit}>%</span>
              </span>
              {Math.min(h, w) >= 76 && (
                <span className="text-[color:var(--w-faint)]" style={RING_TEXT.sub}>
                  {fmt(un)}/{fmt(tot)}
                </span>
              )}
            </Ring>
            </div>
            {w >= 230 && has(achOf("latest-achievement")) && (
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-micro uppercase tracking-[0.08em] text-[color:var(--w-faint)]">Latest unlock</span>
                <div className="flex min-w-0 items-center gap-2.5">
                  <Img src={latestIcon} icon="trophy" className={`${size === "lg" ? "h-12 w-12" : "h-9 w-9"} shrink-0 rounded-lg`} />
                  <span className={`${size === "lg" ? "text-base" : "text-sm"} line-clamp-2 font-medium leading-snug`}>{achOf("latest-achievement")}</span>
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
