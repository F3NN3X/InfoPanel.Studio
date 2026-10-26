// Steam Friends' table, read apart from the widget: the island reads it from the kiosk entry.
import { rows } from "./kit";

export type FriendStatus = "ingame" | "online" | "away" | "busy" | "offline";
export type FriendSort = "status" | "name" | "plugin";

/** Steam's own status colours. */
export const FRIEND_COLORS: Record<FriendStatus, string> = { ingame: "#90ba3c", online: "#57cbde", away: "#5a8a9c", busy: "#d94b4b", offline: "#898989" };

export interface Friend {
  name: string;
  state: string;
  game: string;
  when: string;
  status: FriendStatus;
  /** Away or snoozing while in a game: shown in the in-game colour, dimmed. */
  idle: boolean;
}

const ORDER: FriendStatus[] = ["ingame", "online", "away", "busy", "offline"];

/** A friend's status from the plugin's Status and Playing columns; playing wins over away, as in Steam. */
export function friendStatus(state = "", game = ""): FriendStatus {
  if (/offline/i.test(state)) return "offline";
  if (game.trim()) return "ingame";
  if (/busy/i.test(state)) return "busy";
  if (/away|snooze/i.test(state)) return "away";
  return "online";
}

/**
 * The plugin's friends table (Friend, Status, Playing, Last Online), filtered and sorted. An empty table
 * reaches the widget as its value ("0"), a one-cell row, so rows without a status are left out.
 */
export function friendsOf(table: string, sort: FriendSort = "status", ingameOnly = false): Friend[] {
  const all = rows(table)
    .filter((r) => r.length >= 2)
    .map(([name = "", state = "", game = "", when = ""]) => ({
      name,
      state,
      game: game.trim(),
      when,
      status: friendStatus(state, game),
      idle: !!game.trim() && /away|snooze/i.test(state),
    }));
  const shown = ingameOnly ? all.filter((f) => f.status === "ingame") : all;
  if (sort === "name") return [...shown].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  if (sort === "status") return [...shown].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  return shown;
}
