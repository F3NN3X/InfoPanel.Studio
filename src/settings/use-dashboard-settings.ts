import { useCallback, useEffect, useRef, useState } from "react";
import { exportConfigFile } from "@/components/studio/config-file";
import { CONFIG_EVENTS_URL, CONFIG_URL, fetchConfig, patchSettings, pushConfig } from "@/lib/dashboard-server";
import { defaultConfig, readConfig, type DashboardConfig, type StoredConfig } from "@/lib/layout";
import { withSettingsPatch, type SettingsPatch } from "@/lib/settings-patch";
import { onStudioMessage, postStudioMessage } from "@/lib/studio-channel";

/** What the last change came to: "Saved", or why it was not. */
export interface SaveNote {
  id: number;
  error?: string;
}

const why = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * The saved config for Settings › Dashboard (PLAN decision 22). It is read from the server, and again on every save
 * the server reports (a Studio save, a Settings change, another window); a change is shown at once, saved with
 * `patchSettings`, and passed to the Studio window (`settings` on the studio channel). Changes go one after another,
 * and a read waits until the last one has landed, so a fast double click never flickers back.
 */
export function useDashboardSettings() {
  /** undefined while loading, null when the server has none or can't be reached. */
  const [config, setConfig] = useState<DashboardConfig | null>();
  const [loadError, setLoadError] = useState<string>();
  const [note, setNote] = useState<SaveNote>();
  const inflight = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const nextId = useRef(0);

  // Only the keys are read here (no canvases), so a read stays small however many canvas zones the config has.
  const load = useCallback(async () => {
    if (inflight.current > 0) return;
    try {
      const res = await fetch(CONFIG_URL, { cache: "no-store" });
      if (res.status === 404) throw new Error("Nothing is saved yet: open the Studio once first.");
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const parsed = (await res.json()) as StoredConfig;
      const read = await readConfig(parsed);
      if (inflight.current === 0) setConfig(read);
      setLoadError(undefined);
    } catch (err) {
      setConfig((c) => c ?? null);
      setLoadError(err instanceof TypeError ? "Can't reach the dashboard server. Is it running?" : why(err));
    }
  }, []);

  useEffect(() => {
    void load();
    // The stream sends the version on connect (and reconnect), then one event per save.
    const events = new EventSource(CONFIG_EVENTS_URL);
    events.onmessage = () => void load();
    const off = onStudioMessage((message) => message.type === "replaced" && void load());
    return () => {
      events.close();
      off();
    };
  }, [load]);

  const settle = useCallback(
    (run: () => Promise<void>, after: () => void) => {
      inflight.current += 1;
      const done = queue.current.then(run).then(
        () => {
          after();
          setNote({ id: nextId.current++ });
        },
        (err: unknown) => setNote({ id: nextId.current++, error: `Not saved: ${why(err)}` })
      );
      queue.current = done.finally(() => {
        inflight.current -= 1;
        if (inflight.current === 0) void load();
      });
    },
    [load]
  );

  const patch = useCallback(
    (p: SettingsPatch) => {
      setConfig((c) => c && withSettingsPatch(c, p));
      let rev = 0;
      settle(
        async () => {
          rev = await patchSettings(p);
        },
        () => postStudioMessage({ type: "settings", patch: p, rev })
      );
    },
    [settle]
  );

  /** Reset everything…: the default dashboard replaces the saved one, and the Studio reads it back. */
  const reset = useCallback(() => {
    setConfig(defaultConfig());
    settle(
      () => pushConfig(defaultConfig(), true).then(() => {}),
      () => postStudioMessage({ type: "replaced" })
    );
  }, [settle]);

  /** Back up first: the saved config with its canvases, as the Export file. */
  const exportFile = useCallback(async () => {
    try {
      const saved = await fetchConfig();
      if (!saved) throw new Error("nothing is saved yet");
      await exportConfigFile(await readConfig(saved), (error) => setNote({ id: nextId.current++, error }));
    } catch (err) {
      setNote({ id: nextId.current++, error: `Not exported: ${why(err)}` });
    }
  }, []);

  return { config, loadError, note, patch, reset, exportFile };
}
