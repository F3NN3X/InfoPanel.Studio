// Which readings a Ping widget reads: the server (`ips-server ping.rs`, `target_id`) publishes a target under its host and port
// as lowercase words and hyphens, so both ends spell the key the same way.

/** The port the server tries when none is set. */
export const PORT_DEFAULT = 443;

/** `ping.<id>.`'s id: `1.1.1.1` and 443 is `1-1-1-1-443`. */
export const targetId = (host: string, port: number): string =>
  `${host.trim()} ${port}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The prefix of a target's readings, or "" for no host. */
export const targetPrefix = (host: string, port: number): string => (host.trim() ? `ping.${targetId(host, port)}.` : "");

export type PingStatus = "ok" | "slow" | "down" | "waiting";

/** What a reading says: `down` and `waiting` come from the server; an answer is `slow` at `warn` ms or more. */
export function statusOf(server: string, ms: number, warn: number): PingStatus {
  if (server === "down" || server === "waiting") return server;
  if (server !== "ok" || !Number.isFinite(ms)) return "waiting";
  return ms >= warn ? "slow" : "ok";
}

/** The tone of a status: an answer at `crit` ms or more, or none, is critical; a slow one a warning. */
export function toneOf(status: PingStatus, ms: number, crit: number): "ok" | "warn" | "crit" {
  if (status === "down" || (status !== "waiting" && ms >= crit)) return "crit";
  return status === "slow" ? "warn" : "ok";
}

/** The word that says it, so a state is never colour alone. */
export const STATUS_WORD: Record<PingStatus, string> = { ok: "Up", slow: "Slow", down: "Down", waiting: "Checking" };
