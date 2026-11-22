import { roomy, Widget, shell, get, rows, has, Img, Dot, Stat, Chip, type ShellProps } from "../kit";
import { widgetImage } from "../shared/data-adapter";
import { meta } from "./meta";

export { meta };

export type SteamProfileProps = ShellProps;

export default function SteamProfile(p: SteamProfileProps) {
  const d = p.data;
  const profOf = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Profile.${s}`);
  const socialOf = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Social.${s}`);
  const online = /online|in-game/i.test(profOf("online-status"));
  const friends = rows(socialOf("friends-activity")).map(([name, state, game, when]) => ({ name, state, game, when }));
  const avatar = widgetImage(profOf("profile_image_url"));
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Steam"}
      icon="sports_esports"
      // a 2x2 or 2x1 draws the avatar and the name itself; only a 1x1 is the summary
      compact={(box) => (box.shape === "tile" && box.w >= 200 ? undefined : { label: "Steam", value: profOf("player-name"), kind: "text", sub: `${profOf("online-status")} · Lv ${profOf("steam-level")}`, img: avatar, icon: "person" })}
      right={<Chip>Lv {profOf("steam-level")}</Chip>}
    >
      {({ size, w, h }) => {
        const head = (
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <Img src={avatar} icon="person" className={`${size === "xs" ? "h-10 w-10" : size === "lg" ? "h-16 w-16" : "h-14 w-14"} shrink-0 rounded-xl`} />
              <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-w-badge p-[3px]">
                <Dot ok={online} className="!h-2 !w-2" />
              </span>
            </div>
            <div className="flex min-w-0 flex-col">
              <span className={`${size === "lg" || size === "sm" ? "text-[22px] leading-tight" : "text-base"} truncate font-semibold`}>{profOf("player-name")}</span>
              <span className="truncate text-caption" style={{ color: online ? "#4ade80" : "var(--w-muted)" }}>
                {profOf("online-status")}
                {size === "sm" && ` · Lv ${profOf("steam-level")}`}
              </span>
            </div>
          </div>
        );
        if (size === "xs" || size === "sm")
          return (
            <div className="flex h-full flex-col justify-center gap-3">
              {head}
              {size === "sm" && (
                <div className="text-xs text-[color:var(--w-muted)]">
                  <span className="font-semibold text-[color:var(--w-fg)]">{socialOf("friends-online")}</span> friends online · {socialOf("friends-ingame")} in-game
                </div>
              )}
            </div>
          );
        // the head, the stats box and the gaps (16px) first; then friend rows of 33px, 10px apart
        // (a roomy box grows the type 1.25x: the stats box is 77px and a friend row 38px)
        const big = roomy(w, h);
        const n = Math.max(0, Math.floor((h - ((size === "lg" ? 64 : 48) + (big ? 77 : 64) + 32) + 10) / (big ? 48 : 43)));
        return (
          <div className="flex h-full flex-col gap-4">
            {head}
            <div className="grid grid-cols-3 gap-3 rounded-xl bg-[color:var(--w-track)] p-3">
              <Stat label="Online" value={socialOf("friends-online")} />
              <Stat label="In-game" value={socialOf("friends-ingame")} />
              <Stat label="Friends" value={socialOf("total-friends")} />
            </div>
            {n > 0 && friends.length > 0 && (
              <ul className="flex min-h-0 flex-col gap-2.5 overflow-hidden">
                {friends.slice(0, n).map((f, i) => (
                  <li key={i} className="flex min-w-0 items-center gap-2 text-xs">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[color:var(--w-track)] text-micro font-semibold text-[color:var(--w-fg)]">{f.name?.[0]}</span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[color:var(--w-fg)]">{f.name}</span>
                      <span className="truncate text-micro text-[color:var(--w-faint)]">{has(f.game) ? f.game : f.state}</span>
                    </div>
                    <span className="ml-auto shrink-0 text-micro text-[color:var(--w-faint)]">{f.when}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
