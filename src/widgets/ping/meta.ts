// Ping's catalog entry: pure data, so the registry and the generator read it without the component.
import type { WidgetMeta } from "../core/types";

/** The dashboard server's own source (`ips-server ping.rs`): `ping.<host>-<port>.<field>`. */
export const P = "ping.";

export const meta: WidgetMeta = {
  id: "Ping",
  name: "Ping",
  category: "Network",
  icon: "network_check",
  prefixes: [P],
  defaultSize: [2, 1],
  minSize: [1, 1],
  blurb: "How long a host takes to answer",
  tags: "latency ping host server router internet connection lag jitter packet loss",
  description: "The round-trip time to a host you name, with its average, jitter and packet loss over the last 20 checks. The server connects to the host's port (443 unless set) at the interval you pick; it sends nothing.",
};
