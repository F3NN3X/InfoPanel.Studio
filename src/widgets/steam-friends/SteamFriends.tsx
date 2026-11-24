import { Empty, fillRows, fitRows, roomy, Widget, shell, get, has, useIpTag, seriesColour, Part, type ShellProps } from "../kit";
import { t3Tokens } from "../core/t3-tokens";
import { meta } from "./meta";
import { FRIEND_COLORS, friendsOf, friendStatus, type Friend, type FriendSort, type FriendStatus } from "../shared/friends-data";

export { meta, FRIEND_COLORS, friendsOf, friendStatus, type Friend, type FriendSort, type FriendStatus };

export interface SteamFriendsProps extends ShellProps {
  /** List (initials, name, game) or table (one column each); default list. */
  view?: "list" | "table";
  /** Status (in-game first), name, or the plugin's order; default status. */
  sort?: FriendSort;
  /** Online / in-game / total line above the list; default off. */
  showCounts?: boolean;
  /** Only friends playing something; default off. */
  ingameOnly?: boolean;
  /** The "Last online" time; default on. */
  showTime?: boolean;
  /** Status colours; an unset status keeps Steam's. */
  colors?: Partial<Record<FriendStatus, string>>;
}

const LABEL: Record<FriendStatus, string> = { ingame: "In-game", online: "Online", away: "Away", busy: "Busy", offline: "Offline" };
/** What the status column and the list's sub line say: Steam's own word, or "In-game". */
const stateText = (f: Friend) => (f.status === "ingame" && !f.idle ? LABEL.ingame : has(f.state) ? f.state : LABEL[f.status]);

export default function SteamFriends(p: SteamFriendsProps) {
  const d = p.data;
  const socialOf = (s: string) => get(d, `plugins.InfoPanel.SteamAPI.SteamAPI-Social.${s}`);
  // in-game and offline are the theme's Series 1 and 2 (widget.ts): the Look's series colours come before Steam's own
  const marks = t3Tokens(p.t3);
  const colors = { ...FRIEND_COLORS, ingame: seriesColour(marks, 1, FRIEND_COLORS.ingame), offline: seriesColour(marks, 2, FRIEND_COLORS.offline), ...p.colors };
  const colorOf = (f: Friend) => (f.idle ? `color-mix(in srgb, ${colors.ingame} 60%, transparent)` : colors[f.status]);
  const friends = friendsOf(socialOf("friends-activity"), p.sort ?? "status", p.ingameOnly ?? false);
  const showTime = p.showTime ?? true;
  const counts = `${socialOf("friends-online")} online · ${socialOf("friends-ingame")} in-game · ${socialOf("total-friends")} friends`;
  const tag = useIpTag();
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Friends"}
      icon="group"
      studio={{ label: "Friends", value: socialOf("friends-online"), unit: "online", sub: `${socialOf("friends-ingame")} in-game`, rows: friends.map((f) => ({ n: f.name, v: f.game || stateText(f), dot: true })) }}
      compact={{ label: "Friends", value: socialOf("friends-online"), unit: "online", sub: `${socialOf("friends-ingame")} in-game`, icon: "group" }}
    >
      {({ size, w: w0, h }) => {
        // an unmeasured box (0, server render) lays out as a roomy one
        const w = w0 || Infinity;
        const body = h ? h - (p.showCounts ? 28 : 0) : Infinity;
        if (!friends.length)
          return (
            <div className="flex h-full flex-col gap-2">
              {p.showCounts && <div className="truncate text-caption leading-[1.333] text-[color:var(--w-muted)]">{counts}</div>}
              <Empty icon="group" label={p.ingameOnly ? "No friends in-game" : "No friends online"} />
            </div>
          );
        // the table needs its header and one row (44px); below that it is the one-line list
        const table = p.view === "table" && body >= 44;
        // two-line list rows need 33px; below that, one line of 18px
        const twoLine = !table && body >= 33 && size !== "xs";
        const n = table ? fitRows(body - 22, 22) : twoLine ? fitRows(body, 33, 10) : fitRows(body, 18, 6);
        const shown = friends.slice(0, n);
        // A roomy box keeps the table's rows and shares the spare height between them and the header.
        const rowH = table ? (fillRows(body, shown.length + 1, 22, 0, roomy(w0, h)).rowH ?? 22) : 22;
        return (
          <div className="flex h-full min-h-0 flex-col gap-3">
            {p.showCounts && <div className="shrink-0 truncate text-caption leading-4 text-[color:var(--w-muted)]">{counts}</div>}
            {table ? (
              <FriendTable friends={shown} colorOf={colorOf} showTime={showTime} w={w} rowH={rowH} ip={tag("plugins.InfoPanel.SteamAPI.SteamAPI-Social.friends-activity", { kind: "table", rows: shown.length })} />
            ) : (
              <ul className={`flex min-h-0 flex-col overflow-hidden ${twoLine ? "gap-2.5" : "gap-1.5"}`}>
                {shown.map((f, i) => (
                  <Part as="li" kind="row" current={!!f.game} key={i} className="flex min-w-0 items-center gap-2 text-caption leading-[1.333]">
                    {twoLine ? (
                      <Part
                        as="span"
                        kind="avatar"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-micro font-semibold"
                        style={{ background: `color-mix(in srgb, ${colorOf(f)} 22%, transparent)`, color: colorOf(f) }}
                      >
                        {f.name[0]}
                      </Part>
                    ) : (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(f) }} />
                    )}
                    <div className={`flex min-w-0 ${twoLine ? "flex-col" : "items-baseline gap-2"}`}>
                      {/* on one line the name keeps up to 70% and the game takes the rest */}
                      <span className={`truncate text-[color:var(--w-fg)] ${twoLine ? "" : "max-w-[70%] shrink-0"}`}>{f.name}</span>
                      <span className={`truncate ${twoLine ? "text-micro" : "text-micro"}`} style={{ color: colorOf(f) }}>
                        {f.game || stateText(f)}
                      </span>
                    </div>
                    {showTime && w >= 160 && <span className="ml-auto shrink-0 text-micro text-[color:var(--w-faint)]">{f.when}</span>}
                  </Part>
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </Widget>
  );
}

function FriendTable({ friends, colorOf, showTime, w, rowH, ip }: { friends: Friend[]; colorOf: (f: Friend) => string; showTime: boolean; w: number; rowH: number; ip: Record<string, string | number> }) {
  // columns drop from the right as the box narrows: status from 300px, time from 220px, game from 160px
  const status = w >= 300;
  const time = showTime && w >= 220;
  const game = w >= 160;
  const cols = ["10px", "minmax(0,1.2fr)", status && "minmax(0,0.8fr)", game && "minmax(0,1.4fr)", time && "auto"].filter(Boolean).join(" ");
  const cell = "truncate";
  // Tagged for InfoPanel, each header names the plugin's column it heads.
  const col = (i: number) => (ip["data-ip-key"] ? { "data-ip-col": i } : {});
  return (
    <div {...ip} className="grid min-h-0 content-start items-center gap-x-3 overflow-hidden text-caption leading-[1.333]" style={{ gridTemplateColumns: cols, gridAutoRows: `${rowH}px` }}>
      <span />
      <Part as="span" kind="row-head" className={`${cell} text-micro font-medium uppercase tracking-[0.06em] text-[color:var(--w-faint)]`} {...col(0)}>Friend</Part>
      {status && <Part as="span" kind="row-head" className={`${cell} text-micro font-medium uppercase tracking-[0.06em] text-[color:var(--w-faint)]`} {...col(1)}>Status</Part>}
      {game && <Part as="span" kind="row-head" className={`${cell} text-micro font-medium uppercase tracking-[0.06em] text-[color:var(--w-faint)]`} {...col(2)}>Playing</Part>}
      {time && <Part as="span" kind="row-head" className={`${cell} text-right text-micro font-medium uppercase tracking-[0.06em] text-[color:var(--w-faint)]`} {...col(3)}>Last online</Part>}
      {friends.map((f, i) => (
        <FriendRow key={i} f={f} color={colorOf(f)} status={status} game={game} time={time} cell={cell} />
      ))}
    </div>
  );
}

function FriendRow({ f, color, status, game, time, cell }: { f: Friend; color: string; status: boolean; game: boolean; time: boolean; cell: string }) {
  return (
    <>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className={`${cell} text-[color:var(--w-fg)]`}>{f.name}</span>
      {status && (
        <span className={cell} style={{ color }}>
          {stateText(f)}
        </span>
      )}
      {game && (
        <span className={cell} style={{ color: f.game ? color : "var(--w-faint)" }}>
          {f.game || "–"}
        </span>
      )}
      {time && <span className={`${cell} text-right text-micro text-[color:var(--w-faint)]`}>{f.when}</span>}
    </>
  );
}
