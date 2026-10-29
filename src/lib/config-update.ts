import { CONFIG_VERSION } from "./layout";

/**
 * Updating a saved config to this build's version, once, after an app update. Loading migrates a config in memory
 * only; until a save writes it back, the file on disk keeps the old version. A config with screens below
 * `CONFIG_VERSION` makes the desktop app open the studio (ips-server's `config_guard::needs_update`), which asks the
 * user and saves the migrated copy; the server keeps the old file as a backup before it writes
 * (`config.backup-before-v<N>.json`) and answers with its path.
 */

/** The version a saved config is updated from, when it holds screens and is older than this build's; else none. */
export function updateFrom(stored: { version?: unknown; profiles?: unknown } | null): number | undefined {
  if (!stored || !Array.isArray(stored.profiles)) return undefined;
  const version = typeof stored.version === "number" && Number.isFinite(stored.version) ? stored.version : 0;
  return version < CONFIG_VERSION ? version : undefined;
}
