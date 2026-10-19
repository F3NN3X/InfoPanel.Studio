// GameSpotlight's composite layout: everything the old Steam card showed in one card (banner and logo,
// profile and status, level, session and playtime, library total, achievements, friends, news).
import type { CSSProperties, ReactNode } from "react";
import { Icon, Img, KenBurns, Logo, Num, clamp } from "./kit";

export type CompositeVariant = "card" | "standard" | "compact" | "simple";

export interface CompositeProps {
  w: number;
  h: number;
  /** A forced variant from the standard Density (`sizeTier`, the old `layout`); anything else adapts to the zone. */
  forced?: unknown;
  /** Colour of the big playtime when the accent was set explicitly. */
  accent?: string;
  name: string;
  status: string;
  level: number;
  avatar?: string;
  game: string;
  playtime: number;
  sessionTime: string;
  sessionStart: string;
  banner?: string;
  logo?: string;
  icon?: string;
  totalGames: number;
  achPct: number;
  latestAch: string;
  achIcon?: string;
  friendsOnline: number;
  totalFriends: number;
  news: string;
  showStats: boolean;
  showNews: boolean;
  motion: boolean;
  scrim: number;
}

const VARIANTS: readonly CompositeVariant[] = ["card", "standard", "compact", "simple"];
/** The variant each Density tier forces (Roomy = card … Minimal = simple). */
const TIER_VARIANT: Readonly<Record<string, CompositeVariant>> = { lg: "card", md: "standard", sm: "compact", xs: "simple" };

/** The legacy pick: forced by the standard Density (a tier or an old layout name), else from the zone's size and shape. */
export function pickVariant(w: number, h: number, forced?: unknown): CompositeVariant {
  const f = TIER_VARIANT[String(forced)] ?? VARIANTS.find((v) => v === forced);
  if (f) return f;
  if (!w || !h) return "standard";
  if (h <= 72) return "compact";
  if (w < 300 && h < 150) return "simple";
  if (h >= w * 0.72) return "card";
  return "standard";
}

/** The dark gradients over the banner per variant, at the template's default scrim (0.6) strength. */
const OVERLAYS: Record<CompositeVariant, [string, number[]]> = {
  card: ["180deg", [0.84, 0.18, 0.24, 0.9]],
  standard: ["90deg", [0.87, 0.4, 0.62]],
  compact: ["90deg", [0.82, 0.48, 0.68]],
  simple: ["180deg", [0.5, 0.88]],
};
const STOPS: Record<CompositeVariant, string[]> = { card: ["0%", "34%", "62%", "100%"], standard: ["0%", "45%", "100%"], compact: ["0%", "55%", "100%"], simple: ["0%", "100%"] };

export function overlay(v: CompositeVariant, scrim: number): string | undefined {
  if (scrim <= 0) return undefined;
  const [dir, alphas] = OVERLAYS[v];
  const k = scrim / 0.6;
  return `linear-gradient(${dir}, ${alphas.map((a, i) => `rgba(3,6,16,${Math.min(1, a * k).toFixed(2)}) ${STOPS[v][i]}`).join(", ")})`;
}

const ON_ART = { "--w-fg": "#ffffff", "--w-muted": "rgba(255,255,255,0.72)", "--w-faint": "rgba(255,255,255,0.6)", "--w-track": "rgba(255,255,255,0.15)" } as CSSProperties;

function Avatar({ src, size }: { src?: string; size: number }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-full ring-1 ring-white/25" style={{ width: size, height: size }}>
      <Img src={src} icon="person" className="h-full w-full !bg-white/15" />
    </div>
  );
}

const Text = ({ children, className = "" }: { children?: ReactNode; className?: string }) => <div className={`truncate ${className}`}>{children}</div>;

export function CompositeView(p: CompositeProps) {
  const { w, h, name, status, level, game, playtime, sessionTime, sessionStart, totalGames, achPct, latestAch, friendsOnline, totalFriends, news } = p;
  const v = pickVariant(w, h, p.forced);
  const onBanner = !!p.banner;
  const statusLine = [status || "Offline", Number.isFinite(level) ? `Level ${Math.round(level)}` : ""].filter(Boolean).join(" · ");
  const sessionLine = [game ? `In ${game}` : status || "Offline", sessionTime && game ? `(${sessionTime})` : ""].filter(Boolean).join(" ");
  const total = Number.isFinite(playtime) ? `${Math.round(playtime)}h` : "—";
  const games = Number.isFinite(totalGames) ? `${Math.round(totalGames)} games` : "";
  const friends = Number.isFinite(friendsOnline) ? (Number.isFinite(totalFriends) ? `${Math.round(friendsOnline)}/${Math.round(totalFriends)} online` : `${Math.round(friendsOnline)} online`) : "";
  const ach = Number.isFinite(achPct) ? `${Math.round(achPct)}%` : "—";
  const bigColor = p.accent ? "var(--accent)" : undefined;
  const dim = overlay(v, p.scrim);

  const profile = (size: number) => (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar src={p.avatar} size={size} />
      <div className="min-w-0">
        <Text className="text-sm font-semibold text-[color:var(--w-fg)]">{name || "Steam"}</Text>
        <Text className="text-xs text-[color:var(--w-muted)]">{statusLine}</Text>
      </div>
    </div>
  );
  const gameMark = (cls: string) =>
    p.logo || p.icon ? (
      <Img src={p.logo ?? p.icon} icon="stadia_controller" className={`!bg-transparent object-contain ${cls}`} />
    ) : null;
  const achIcon = p.achIcon && <img src={p.achIcon} alt="" className="h-5 w-5 rounded object-cover" />;

  let body: ReactNode;
  if (v === "card") {
    body = (
      <div className="flex h-full flex-col justify-between gap-2 p-4">
        {profile(clamp(h * 0.08, 34, 52))}
        <div className="flex min-h-0 flex-1 items-center justify-center px-2 py-1">
          {p.logo ? (
            <Logo src={p.logo} name={game} className="max-h-full max-w-[76%] !object-center" />
          ) : p.icon ? (
            <Img src={p.icon} icon="stadia_controller" className="aspect-square max-h-[70%] rounded-2xl" />
          ) : (
            <div className="max-w-full text-center">
              <Text className="text-2xl font-bold text-[color:var(--w-fg)]">{game || "Not playing"}</Text>
              {sessionTime && <div className="mt-1 text-sm text-[color:var(--w-muted)]">session {sessionTime}</div>}
            </div>
          )}
        </div>
        <div className="shrink-0">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <Num className="block text-[30px] leading-none" style={{ color: bigColor }}>
                {total}
              </Num>
              <Text className="mt-1 text-xs text-[color:var(--w-muted)]">
                {game ? `total in ${game}` : "Not playing"}
                {sessionStart ? ` · ${sessionStart}` : ""}
              </Text>
            </div>
            {p.showStats && (
              <div className="max-w-[45%] shrink-0 text-right">
                <div className="flex items-center justify-end gap-1.5 text-sm font-semibold tabular-nums text-[color:var(--w-fg)]">
                  {achIcon}
                  {ach}
                  <span className="text-xs font-normal text-[color:var(--w-muted)]">achievements</span>
                </div>
                <Text className="mt-0.5 text-xs text-[color:var(--w-muted)]">{latestAch || friends || games}</Text>
                {!latestAch && friends && games && <Text className="text-xs text-[color:var(--w-muted)]">{games}</Text>}
              </div>
            )}
          </div>
          {p.showNews && news && (
            <Text className="mt-2 text-[10px] text-[color:var(--w-muted)]">{news}</Text>
          )}
        </div>
      </div>
    );
  } else if (v === "compact") {
    body = (
      <div className="flex h-full items-center gap-3 px-4">
        <Avatar src={p.avatar} size={clamp(h * 0.45, 16, 28)} />
        <Text className="min-w-0 text-sm text-[color:var(--w-fg)]">
          <span className="font-semibold">{name || "Steam"}</span>
          <span className="ml-2 text-[color:var(--w-muted)]">{sessionLine}</span>
        </Text>
        <div className="ml-auto shrink-0 text-right">
          <Num className="block text-sm leading-tight" style={{ color: bigColor }} weight={600}>
            {total}
          </Num>
          <Text className="text-[10px] tabular-nums text-[color:var(--w-muted)]">
            {[games, friends, Number.isFinite(achPct) ? `${Math.round(achPct)}% ach` : ""].filter(Boolean).join(" · ") || "offline"}
          </Text>
        </div>
      </div>
    );
  } else if (v === "simple") {
    body = (
      <div className="flex h-full items-center gap-3 p-3">
        <Avatar src={p.avatar} size={clamp(h * 0.45, 28, 44)} />
        <div className="min-w-0">
          <Text className="text-sm font-semibold text-[color:var(--w-fg)]">{name || "Steam"}</Text>
          <Text className="text-xs text-[color:var(--w-muted)]">{sessionLine}</Text>
        </div>
        {Number.isFinite(achPct) && (
          <div className="ml-auto shrink-0 text-right">
            <Num className="block text-sm leading-tight" weight={600}>
              {Math.round(achPct)}%
            </Num>
            <div className="text-[9px] text-[color:var(--w-muted)]">ach</div>
          </div>
        )}
      </div>
    );
  } else if (w > 0 && w < 460) {
    // too narrow for three columns (they would overlap): profile on the left, the total and the stats stacked on the right
    body = (
      <div className="flex h-full items-center gap-4 p-4">
        <div className="w-[40%] min-w-0 shrink-0">
          {profile(clamp(h * 0.25, 32, 48))}
          {gameMark("mt-2.5 h-9 w-full !object-left")}
        </div>
        <div className="min-w-0 flex-1 text-right">
          <Num className="block leading-none" style={{ color: bigColor, fontSize: clamp(h * 0.2, 24, 40) }}>
            {total}
          </Num>
          <Text className="mt-1 text-xs text-[color:var(--w-muted)]">{game ? `total in ${game}` : "Not playing"}</Text>
          {p.showStats && (
            <>
              <Text className="mt-1.5 text-xs tabular-nums text-[color:var(--w-muted)]">{[games, friends].filter(Boolean).join(" · ") || "—"}</Text>
              <div className="flex items-center justify-end gap-1.5 text-sm font-semibold tabular-nums text-[color:var(--w-fg)]">
                {achIcon}
                {ach}
              </div>
              <Text className="text-xs text-[color:var(--w-muted)]">{latestAch ? `latest: ${latestAch}` : "achievements"}</Text>
            </>
          )}
          {p.showNews && news && h >= 180 && <Text className="mt-1 text-[10px] text-[color:var(--w-muted)]">{news}</Text>}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex h-full items-center gap-4 p-4">
        <div className="w-[28%] min-w-[150px] max-w-[280px] shrink">
          {profile(clamp(h * 0.3, 36, 56))}
          {gameMark("mt-2.5 h-9 w-full !object-left")}
        </div>
        <div className="min-w-0 flex-1 text-center">
          <Num className="block leading-none" style={{ color: bigColor, fontSize: clamp(h * 0.3, 28, 56) }}>
            {total}
          </Num>
          <Text className="mt-1.5 text-sm text-[color:var(--w-muted)]">{game ? `total in ${game}` : "Not playing"}</Text>
          {(sessionTime || sessionStart) && (
            <Text className="text-xs text-[color:var(--w-muted)]">{[sessionTime && `session ${sessionTime}`, sessionStart].filter(Boolean).join(" · ")}</Text>
          )}
          {p.showNews && news && h >= 120 && <Text className="mt-1.5 text-[10px] text-[color:var(--w-muted)]">{news}</Text>}
        </div>
        {p.showStats && (
          <div className="w-[26%] min-w-[140px] max-w-[240px] shrink text-right">
            <Text className="text-xs tabular-nums text-[color:var(--w-muted)]">{[games, friends].filter(Boolean).join(" · ") || "—"}</Text>
            <div className="mt-1 flex items-center justify-end gap-1.5 text-base font-semibold tabular-nums text-[color:var(--w-fg)]">
              {achIcon}
              {ach}
            </div>
            <Text className="text-xs text-[color:var(--w-muted)]">{latestAch ? `latest: ${latestAch}` : "achievements"}</Text>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden" style={onBanner ? ON_ART : undefined}>
      {onBanner ? (
        <>
          <KenBurns src={p.banner} on={p.motion} />
          {dim && <div className="absolute inset-0" style={{ background: dim }} />}
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon name="stadia_controller" className="text-5xl text-[color:var(--w-faint)] opacity-30" />
        </div>
      )}
      <div className="relative z-10 h-full w-full">
        {body}
      </div>
    </div>
  );
}

