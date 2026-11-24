// Steam Friends' `crew` layout (look.json `layouts`, src/widgets/layouts.ts): the kit's crew roster. Underline tabs that filter the
// list (In-game, Online, All) with their counter, the online count as a readout beside a tone chip of how many are playing, then one
// ruled row per friend: a hexagon badge with their initials, the name over the game or status in its colour, and when they were last
// online. The first friend in a game is the list's current row. The data and colours are the standard layout's.
import { useState } from "react";
import { Empty, Num, Part, Widget, fitRows, get, has, seriesColour, shell } from "../kit";
import { t3Tokens } from "../core/t3-tokens";
import { FRIEND_COLORS, friendsOf, type Friend } from "../shared/friends-data";
import { HexBadge, KitTabs, ToneChip, initials } from "../shared/layout-kit";
import type { SteamFriendsProps } from "./SteamFriends";

type Tab = "ingame" | "online" | "all";
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "ingame", label: "In-game" },
  { id: "online", label: "Online" },
  { id: "all", label: "All" },
];

/** The friends a tab lists: playing, not offline, or everyone. */
export const crewOf = (friends: readonly Friend[], tab: Tab): Friend[] =>
  tab === "ingame" ? friends.filter((f) => !!f.game) : tab === "online" ? friends.filter((f) => f.status !== "offline") : [...friends];

export function FriendsCrew(p: SteamFriendsProps) {
  const socialOf = (s: string) => get(p.data, `plugins.InfoPanel.SteamAPI.SteamAPI-Social.${s}`);
  const marks = t3Tokens(p.t3);
  const colors = { ...FRIEND_COLORS, ingame: seriesColour(marks, 1, FRIEND_COLORS.ingame), offline: seriesColour(marks, 2, FRIEND_COLORS.offline), ...p.colors };
  const colorOf = (f: Friend) => (f.idle ? `color-mix(in srgb, ${colors.ingame} 60%, transparent)` : colors[f.status]);
  const friends = friendsOf(socialOf("friends-activity"), p.sort ?? "status", p.ingameOnly ?? false);
  const playing = friends.filter((f) => !!f.game).length;
  const [picked, setTab] = useState<Tab | null>(null);
  // the first tab with anyone in it, unless the user picked one
  const tab: Tab = picked ?? (playing ? "ingame" : "online");
  const shown = crewOf(friends, tab);
  const online = socialOf("friends-online");
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Friends"}
      icon="group"
      compact={{ label: "Friends", value: online, unit: "online", sub: `${socialOf("friends-ingame")} in-game`, icon: "group" }}
    >
      {({ w, h }) => {
        const badge = h >= 220 ? 34 : 28;
        const rowH = badge * 1.1 + 10;
        const head = 30 + (h >= 160 ? 34 : 0);
        const n = Math.min(shown.length, fitRows(h - head, rowH, 0));
        const lead = shown.findIndex((f) => !!f.game);
        return (
          <div data-layout="crew" className="flex h-full min-h-0 min-w-0 flex-col gap-2">
            <KitTabs tabs={TABS} active={tab} onPick={(id) => setTab(id as Tab)} />
            {h >= 160 && (
              <div className="flex min-w-0 items-center justify-between gap-2">
                <Num className="truncate text-title leading-none">
                  {has(online) ? String(online).padStart(2, "0") : "–"}
                  <span className="ml-1.5 text-micro uppercase tracking-[0.08em] text-[color:var(--w-muted)]">Online</span>
                </Num>
                {playing > 0 && <ToneChip tone="warn">{`${playing} in-game`}</ToneChip>}
              </div>
            )}
            {shown.length === 0 ? (
              <Empty icon="group" label={tab === "ingame" ? "No friends in-game" : "No friends online"} />
            ) : (
              <ul className="flex min-h-0 flex-col overflow-hidden">
                {shown.slice(0, n).map((f, i) => (
                  <Part as="li" kind="row" current={i === lead} rowKey={f.name} key={`${f.name}${i}`} className="flex min-w-0 items-center gap-2.5 py-1.25" style={{ height: rowH }}>
                    <HexBadge text={initials(f.name)} color={colorOf(f)} size={badge} />
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate text-caption font-semibold text-[color:var(--w-fg)]">{f.name}</span>
                      <span className="truncate text-micro" style={{ color: colorOf(f) }}>
                        {f.game || f.state || f.status}
                      </span>
                    </div>
                    {(p.showTime ?? true) && w >= 200 && <span data-part="mono" className="shrink-0 text-micro tabular-nums text-[color:var(--w-muted)]">{f.when}</span>}
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
