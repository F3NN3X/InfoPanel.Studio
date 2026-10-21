import { useEffect, useState } from "react";
import { useSensorsConnected } from "@/hooks/useSensors";
import { kiosksOf, type ControlState } from "@/lib/control";
import { dataApiState, getApiBase, pingApiBase, subscribeApiBase } from "@/lib/data-api";
import { appSettings, isTauri, onShellEvent, serverStatus, updateState } from "@/lib/desktop";
import { restartItems } from "@/settings/model/restart";
import type { Settings, Status, UpdateState } from "@/settings/types";
import type { SaveState, StatusBarData, StatusServer } from "./status-bar";

/** How often the status bar times the Data API (only while the page is visible). */
const PING_MS = 15_000;

/** The last ping of the current Data API base: ms, null when it failed, undefined before the first. */
function useApiLatency(): { base: string; latencyMs: number | null | undefined } {
  const [base, setBase] = useState(getApiBase);
  const [latencyMs, setLatency] = useState<number | null>();
  useEffect(() => subscribeApiBase(setBase), []);
  useEffect(() => {
    let alive = true;
    setLatency(undefined);
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      void pingApiBase(base).then((ms) => alive && setLatency(ms));
    };
    ping();
    const timer = setInterval(ping, PING_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [base]);
  return { base, latencyMs };
}

/**
 * The desktop shell's server and update state: the shell's events, plus a
 * first read where the studio's permissions allow it (`server_status`,
 * `update_state` and `get_settings` are not in STUDIO_PERMISSIONS yet, so
 * today the first values come from the next event).
 */
function useShellState(): { status?: Status; update?: UpdateState; settings?: Settings } {
  const [status, setStatus] = useState<Status>();
  const [update, setUpdate] = useState<UpdateState>();
  const [settings, setSettings] = useState<Settings>();
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    const readSettings = () => void appSettings().then((s) => alive && s && setSettings(s));
    void serverStatus().then((s) => alive && s && setStatus(s));
    void updateState().then((u) => alive && u && setUpdate(u));
    readSettings();
    const offs = [
      onShellEvent<Status>("server-status", (s) => {
        setStatus(s);
        readSettings();
      }),
      onShellEvent<UpdateState>("update-state", setUpdate),
    ];
    return () => {
      alive = false;
      for (const off of offs) void off.then((fn) => fn());
    };
  }, []);
  return { status, update, settings };
}

function serverOf(status: Status | undefined): StatusServer {
  if (!isTauri()) return { kind: "browser", host: window.location.hostname };
  // Until the shell reports, the studio's own origin names the port.
  const port = status?.port ?? (Number(window.location.port) || 80);
  return { kind: "desktop", port, lan: status?.runningConfig ? status.runningConfig.listen === "lan" : undefined, phase: status?.state };
}

/** The status bar's live data (SPEC §3.4) from the page's one control state and the save state. */
export function useStatusBar(control: ControlState | null, save: SaveState): StatusBarData {
  const streamsOpen = useSensorsConnected();
  const { base, latencyMs } = useApiLatency();
  const { status, update, settings } = useShellState();
  const offered = update && (update.state === "available" || update.state === "ready") ? update.version : undefined;
  return {
    dataApi: { state: dataApiState(streamsOpen, latencyMs), latencyMs, base },
    server: serverOf(status),
    kiosks: kiosksOf(control).length,
    update: offered,
    // Debug mode is left out: telling a forced one (--debug) from a pending one needs `get_diagnostics`.
    restartNeeded:
      settings !== undefined && restartItems(settings, status?.runningConfig ?? null).some((item) => item.key !== "debug"),
    save,
  };
}
