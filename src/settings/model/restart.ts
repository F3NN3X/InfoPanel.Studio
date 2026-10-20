import type { RunningConfig, Settings } from "../types";

export const MIN_PORT = 1024;
export const MAX_PORT = 65535;

/** The port a text field holds, or null when it is not a whole number from 1024 to 65535. */
export function parsePort(text: string): number | null {
  if (!/^\d{1,5}$/.test(text)) return null;
  const port = Number(text);
  return port >= MIN_PORT && port <= MAX_PORT ? port : null;
}

/** The extra host names a text field holds: separated by commas or spaces. */
export function parseHosts(text: string): string[] {
  return text.split(/[,\s]+/).filter(Boolean);
}

export interface RestartItem {
  key: "port" | "listen" | "debug" | "allowedHosts";
  /** What the restart bar lists. */
  label: string;
  /** The value the running server uses: Undo puts it back. */
  running: number | string | boolean | string[];
}

type Saved = Pick<Settings, "port" | "listen" | "debug" | "allowedHosts">;

/**
 * The saved settings the running server hasn't picked up. Nothing is pending while no server runs
 * (the next start uses the saved settings). `debugForced` is `--debug` / INFOPANEL_STUDIO_DEBUG for
 * this run, which keeps debug mode on whatever the setting says.
 */
export function restartItems(saved: Saved, running: RunningConfig | null, debugForced = false): RestartItem[] {
  if (!running) return [];
  const items: RestartItem[] = [];
  if (running.port !== saved.port) items.push({ key: "port", label: `port ${saved.port}`, running: running.port });
  if (running.listen !== saved.listen) {
    items.push({
      key: "listen",
      label: saved.listen === "lan" ? "local network access" : "local-only access",
      running: running.listen,
    });
  }
  if (running.debug !== (saved.debug || debugForced)) {
    items.push({ key: "debug", label: saved.debug ? "debug mode on" : "debug mode off", running: running.debug });
  }
  if (running.allowedHosts.join("\n") !== saved.allowedHosts.join("\n")) {
    items.push({ key: "allowedHosts", label: "allowed host names", running: running.allowedHosts });
  }
  return items;
}

/** The restart bar's sentence. */
export function restartText(items: RestartItem[]): string {
  return `Restart the server to apply: ${items.map((i) => i.label).join(", ")}.`;
}
