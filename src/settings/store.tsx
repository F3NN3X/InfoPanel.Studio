import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { errorText, ipc, onEvent } from "./ipc";
import { restartItems, type RestartItem } from "./model/restart";
import { isSectionId, type SectionId } from "./model/search";
import type { SetResult, SettingKey, Settings, Status, UpdateState } from "./types";

/** How long "Saved" stays up. */
export const SAVED_MS = 1400;
const ERROR_MS = 4500;
/** How long a row found by search keeps its outline. */
export const FOUND_MS = 1500;

interface Toast {
  id: number;
  message: string;
  error: boolean;
}

interface Found {
  row: string;
  n: number;
}

export interface Store {
  settings: Settings;
  status: Status;
  update: UpdateState;
  /** The machine's LAN IPv4 (what `lan` listens for), if it has one. */
  lanIp: string | null;
  /** Saves one setting right away (SPEC 3); the "Saved" toast follows. */
  save: (key: SettingKey, value: unknown) => Promise<SetResult>;
  setZoom: (percent: number) => Promise<void>;
  /** Re-reads the settings (after the agents switch changed them). */
  refreshSettings: () => Promise<void>;
  setUpdate: (state: UpdateState) => void;
  setStatus: (status: Status) => void;
  toast: (message: string, error?: boolean) => void;
  toastState: Toast | null;
  /** The restart bar's rows: saved settings the running server hasn't picked up. */
  pending: RestartItem[];
  /** A port field holds something that can't be saved; the bar stays hidden. */
  setPortInvalid: (invalid: boolean) => void;
  barVisible: boolean;
  restartBusy: boolean;
  restartServer: () => Promise<void>;
  undoRestart: () => Promise<void>;
  section: SectionId;
  go: (section: SectionId, row?: string) => void;
  found: Found | null;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore outside a StoreProvider");
  return store;
}

/** For a row search can jump to: scrolls it into view and outlines it for 1.5 s when it is the target. */
export function useFound(id: string | undefined): { ref: (el: HTMLElement | null) => void; className: string } {
  const { found } = useContext(StoreContext) ?? { found: null };
  const el = useRef<HTMLElement | null>(null);
  const hit = id !== undefined && found?.row === id;
  useEffect(() => {
    if (hit) el.current?.scrollIntoView?.({ block: "center" });
  }, [hit, found?.n]);
  return { ref: (node) => void (el.current = node), className: hit ? "row-found" : "" };
}

interface Loaded {
  settings: Settings;
  status: Status;
  update: UpdateState;
  lanIp: string | null;
  debugForced: boolean;
}

async function load(): Promise<Loaded> {
  const [settings, status, update, addresses, diagnostics] = await Promise.all([
    ipc.getSettings(),
    ipc.serverStatus(),
    ipc.updateState(),
    ipc.listLocalAddresses().catch(() => [] as string[]),
    ipc.getDiagnostics().catch(() => null),
  ]);
  return { settings, status, update, lanIp: addresses[0] ?? null, debugForced: Boolean(diagnostics?.debug && !settings.debug) };
}

/** The section the window was opened at (settings.html#server), else General. */
function sectionFromHash(): SectionId {
  const id = window.location.hash.slice(1);
  return isSectionId(id) ? id : "general";
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [toastState, setToast] = useState<Toast | null>(null);
  const [portInvalid, setPortInvalid] = useState(false);
  const [restartBusy, setRestartBusy] = useState(false);
  const [section, setSection] = useState<SectionId>(sectionFromHash);
  const [found, setFound] = useState<Found | null>(null);
  const settingsRef = useRef<Settings | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const foundTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nextId = useRef(0);
  const saveSeq = useRef(0);
  /** The newest save of each key: an older response or failure for that key changes nothing. */
  const keySeq = useRef(new Map<SettingKey, number>());
  const [debugForced, setDebugForced] = useState(false);

  useEffect(() => {
    let alive = true;
    const unlisten: Array<() => void> = [];
    void onEvent<Status>("server-status", (s) => alive && setStatus(s)).then((u) => (alive ? unlisten.push(u) : u()));
    void onEvent<UpdateState>("update-state", (s) => alive && setUpdate(s)).then((u) => (alive ? unlisten.push(u) : u()));
    // Help asks for a section while this window is already open.
    void onEvent<string>("settings-section", (s) => alive && isSectionId(s) && setSection(s)).then((u) => (alive ? unlisten.push(u) : u()));
    void load().then((l) => {
      if (!alive) return;
      setLoaded(l);
      setDebugForced(l.debugForced);
      setSettings(l.settings);
      // A status event that arrived while loading is newer than the one fetched.
      setStatus((current) => current ?? l.status);
      setUpdate((current) => current ?? l.update);
    });
    return () => {
      alive = false;
      unlisten.forEach((u) => u());
      clearTimeout(toastTimer.current);
      clearTimeout(foundTimer.current);
    };
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const toast = useCallback((message: string, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ id: nextId.current++, message, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? ERROR_MS : SAVED_MS);
  }, []);

  /** Whether `seq` is still the newest save of `key`. */
  const latestFor = useCallback((key: SettingKey, seq: number) => keySeq.current.get(key) === seq, []);

  // Only the newest save may replace the whole settings; an older one only its own key, and only
  // while no newer save of that key is in flight (else a fast double toggle flickers back).
  const applyResult = useCallback(
    (key: SettingKey, result: SetResult, seq: number) => {
      if (seq === saveSeq.current) setSettings(result.settings);
      else if (latestFor(key, seq)) setSettings((s) => (s ? { ...s, [key]: result.settings[key] } : s));
    },
    [latestFor]
  );

  const save = useCallback(
    async (key: SettingKey, value: unknown): Promise<SetResult> => {
      setSettings((s) => (s ? { ...s, [key]: value } : s));
      const seq = ++saveSeq.current;
      keySeq.current.set(key, seq);
      try {
        const result = await ipc.setSetting(key, value);
        applyResult(key, result, seq);
        if (result.ok) toast("Saved");
        else toast(result.error ?? "Not saved.", true);
        return result;
      } catch (e) {
        const message = errorText(e);
        toast(message, true);
        const current = await ipc.getSettings().catch(() => settingsRef.current);
        // A newer save of this key already shows its value: keep it.
        if (current && latestFor(key, seq)) setSettings((s) => (s && seq !== saveSeq.current ? { ...s, [key]: current[key] } : current));
        return { ok: false, error: message, restartRequired: false, settings: current ?? (settingsRef.current as Settings) };
      }
    },
    [toast, applyResult, latestFor]
  );

  const setZoom = useCallback(
    async (percent: number) => {
      setSettings((s) => (s ? { ...s, zoom: percent } : s));
      const seq = ++saveSeq.current;
      keySeq.current.set("zoom", seq);
      try {
        const result = await ipc.setZoom(percent / 100);
        applyResult("zoom", result, seq);
        if (result.ok) toast("Saved");
        else toast(result.error ?? "Not saved.", true);
      } catch (e) {
        toast(errorText(e), true);
      }
    },
    [toast, applyResult]
  );

  const refreshSettings = useCallback(async () => {
    setSettings(await ipc.getSettings());
  }, []);

  const pending = useMemo(
    () => (settings && status ? restartItems(settings, status.runningConfig, debugForced) : []),
    [settings, status, debugForced]
  );
  const settling = status?.state === "starting" || status?.state === "restarting";
  const barVisible = pending.length > 0 && !portInvalid && !restartBusy && !settling;

  const restartServer = useCallback(async () => {
    setRestartBusy(true);
    try {
      const next = await ipc.restartServer();
      setStatus(next);
      // A server that still runs debug mode after a restart with it off was forced (--debug, env): nothing to apply.
      if (next.runningConfig?.debug && !settingsRef.current?.debug) setDebugForced(true);
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setRestartBusy(false);
    }
  }, [toast]);

  const undoRestart = useCallback(async () => {
    for (const item of pending) await save(item.key, item.running);
  }, [pending, save]);

  const go = useCallback((next: SectionId, row?: string) => {
    setSection(next);
    clearTimeout(foundTimer.current);
    if (!row) return setFound(null);
    setFound((f) => ({ row, n: (f?.n ?? 0) + 1 }));
    foundTimer.current = setTimeout(() => setFound(null), FOUND_MS);
  }, []);

  if (!loaded || !settings || !status || !update) return null;
  const store: Store = {
    settings,
    status,
    update,
    lanIp: loaded.lanIp,
    save,
    setZoom,
    refreshSettings,
    setUpdate,
    setStatus,
    toast,
    toastState,
    pending,
    setPortInvalid,
    barVisible,
    restartBusy,
    restartServer,
    undoRestart,
    section,
    go,
    found,
  };
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
