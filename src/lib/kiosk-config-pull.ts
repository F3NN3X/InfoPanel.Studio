/** How long the kiosk waits for the config stream's first message before it fetches the config itself. */
export const STREAM_SILENT_MS = 1500;

interface KioskPullDeps<T> {
  fetchConfig: () => Promise<unknown | null>;
  /** The fetched config as the kiosk shows it (migrated, with the pinned profile). */
  resolve: (parsed: unknown) => Promise<T>;
  apply: (config: T) => void;
  /** The fetched config differs from the last one fetched (a studio edit, not a reconnect). */
  onChange: () => void;
  /** A fetch has finished, whether it found a config or not. */
  settled: () => void;
}

/**
 * The kiosk's reads of the shared config: one on every message of the config stream (the stream sends the current
 * version on connect, then one per save) and, if the stream stays silent, one of its own. Only the newest read
 * counts, so a slow older response never replaces a newer one. A failed read leaves the local copy standing.
 */
export function startKioskPull<T>(deps: KioskPullDeps<T>, silentMs = STREAM_SILENT_MS): { message: () => void; stop: () => void } {
  let alive = true;
  let seq = 0;
  let last: string | null = null;
  const pull = async () => {
    const mine = ++seq;
    try {
      const parsed = await deps.fetchConfig();
      if (!alive || mine !== seq) return;
      if (parsed) {
        const text = JSON.stringify(parsed);
        const merged = await deps.resolve(parsed);
        if (!alive || mine !== seq) return;
        if (last !== null && text !== last) deps.onChange();
        last = text;
        deps.apply(merged);
      }
      // Nothing saved yet: the local copy stands.
    } catch {
      // Server offline: the local copy stands (and, if that is all there is, it is what mounts).
    }
    if (alive && mine === seq) deps.settled();
  };
  const silent = setTimeout(() => void pull(), silentMs);
  return {
    message: () => {
      clearTimeout(silent);
      void pull();
    },
    stop: () => {
      alive = false;
      clearTimeout(silent);
    },
  };
}
