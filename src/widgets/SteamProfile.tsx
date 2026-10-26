import { Widget, shell, get, rows, has, Img, Dot, Stat, Chip, type ShellProps } from "./kit";
import { widgetImage } from "./data-adapter";
import { meta } from "./meta/SteamProfile";

export { meta };

export type SteamProfileProps = ShellProps;

export default function SteamProfile(p: SteamProfileProps) {
  const d = p.data;
  const P = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Profile.${s}`);
  const S = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Social.${s}`);
  const online = /online|in-game/i.test(P("online-status"));
  const friends = rows(S("friends-activity")).map(([name, state, game, when]) => ({ name, state, game, when }));
  const avatar = widgetImage(P("profile_image_url"));
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Steam"}
      icon="sports_esports"
      compact={{ label: "Steam", value: P("player-name"), kind: "text", sub: `${P("online-status")} · Lv ${P("steam-level")}`, img: avatar, icon: "person" }}
      right={<Chip>Lv {P("steam-level")}</Chip>}
    >
      {({ size, h }) => {
        const head = (
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <Img src={avatar} icon="person" className={`${size === "xs" ? "h-10 w-10" : size === "lg" ? "h-16 w-16" : "h-12 w-12"} rounded-xl`} />
              <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[#141418] p-[3px]">
                <Dot ok={online} className="!h-2 !w-2" />
              </span>
            </div>
            <div className="flex min-w-0 flex-col">
              <span className={`${size === "lg" ? "text-xl" : "text-base"} truncate font-semibold`}>{P("player-name")}</span>
              <span className="truncate text-xs" style={{ color: online ? "#4ade80" : "var(--w-muted)" }}>
                {P("online-status")}
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
                  <span className="font-semibold text-[color:var(--w-fg)]">{S("friends-online")}</span> friends online · {S("friends-ingame")} in-game
                </div>
              )}
            </div>
          );
        // the head, the stats box and the gaps (16px) first; then friend rows of 33px, 10px apart
        const n = Math.max(0, Math.floor((h - ((size === "lg" ? 64 : 48) + 61 + 32) + 10) / 43));
        return (
          <div className="flex h-full flex-col gap-4">
            {head}
            <div className="grid grid-cols-3 gap-3 rounded-xl bg-[color:var(--w-track)] p-3">
              <Stat label="Online" value={S("friends-online")} />
              <Stat label="In-game" value={S("friends-ingame")} />
              <Stat label="Friends" value={S("total-friends")} />
            </div>
            {n > 0 && friends.length > 0 && (
              <ul className="flex min-h-0 flex-col gap-2.5 overflow-hidden">
                {friends.slice(0, n).map((f, i) => (
                  <li key={i} className="flex min-w-0 items-center gap-2 text-xs">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[color:var(--w-track)] text-[10px] font-semibold text-[color:var(--w-fg)]">{f.name?.[0]}</span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[color:var(--w-fg)]">{f.name}</span>
                      <span className="truncate text-[11px] text-[color:var(--w-faint)]">{has(f.game) ? f.game : f.state}</span>
                    </div>
                    <span className="ml-auto shrink-0 text-[10.5px] text-[color:var(--w-faint)]">{f.when}</span>
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
