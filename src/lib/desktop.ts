/**
 * The bridge to the Tauri desktop shell. Every wrapper is a no-op in a browser, and
 * `@tauri-apps/api` is only ever imported dynamically, so the kiosk and browser studio
 * bundles never load it.
 */

import { helpPageUrl, type HelpTarget } from "@/help/links";
import type { Settings, Status, UpdateState } from "@/settings/types";

/** True inside the desktop app's webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (!isTauri()) return undefined;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export type FrontendLevel = "error" | "warn";

/** One studio health sample for `report_metrics`. */
export interface MetricsSample {
  ts: number;
  jsHeapUsed: number | null;
  jsHeapTotal: number | null;
  domNodes: number;
  eventSources: number;
  url: string;
}

/** Opens the Settings window, at a section (a `SectionId`) when given one. */
export const openSettings = (section?: string): Promise<void | undefined> => call<void>("open_settings", section ? { section } : undefined);

/**
 * Opens Help at an article and heading (a slug). The desktop app has a Help window; a browser tab
 * opens the Help page the dashboard server hosts next to the studio.
 */
export async function openHelp(target: HelpTarget = {}): Promise<void> {
  if (isTauri()) {
    await call<void>("open_help", { ...target });
    return;
  }
  // A named target, so a held F1 reuses one tab; the opener is cut by hand since a name needs the context.
  const w = window.open(helpPageUrl(target), "infopanel-help");
  if (w) w.opener = null;
}

/**
 * Kiosk view in the desktop window: with a size the window takes exactly that (logical pixels, even
 * past the screen); without one it returns to the geometry the studio had.
 */
export const kioskWindow = (size?: { width: number; height: number }): Promise<void | undefined> =>
  call<void>("kiosk_window", size ? { size } : undefined);

/** Calls `handler` when the shell leaves Kiosk view on its own (a close from it); resolves to the unsubscribe. */
export async function onKioskLeft(handler: () => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen("kiosk-left", handler);
}

/**
 * A read for the status bar that the studio's permission set may not grant yet (`server_status`,
 * `update_state`, `get_settings`): undefined in a browser and when the shell refuses.
 */
async function tryCall<T>(command: string): Promise<T | undefined> {
  try {
    return await call<T>(command);
  } catch {
    return undefined;
  }
}

export const serverStatus = (): Promise<Status | undefined> => tryCall<Status>("server_status");
export const updateState = (): Promise<UpdateState | undefined> => tryCall<UpdateState>("update_state");
export const appSettings = (): Promise<Settings | undefined> => tryCall<Settings>("get_settings");

/** Calls `handler` with each `server-status` / `update-state` event the shell emits; resolves to the unsubscribe. */
export async function onShellEvent<T>(event: "server-status" | "update-state", handler: (payload: T) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(event, (e) => handler(e.payload));
}

/** Native save dialog; resolves to whether a file was written. */
export const saveTextFile = async (defaultName: string, contents: string): Promise<boolean> =>
  (await call<boolean>("save_text_file", { defaultName, contents })) === true;

/**
 * Native Save As for raw bytes (`zip` or `infopanel`); the bytes are the IPC body, the name and
 * extension ride in headers. Resolves to whether a file was written.
 */
export const saveBinaryFile = async (name: string, ext: "zip" | "infopanel", bytes: Uint8Array): Promise<boolean> => {
  if (!isTauri()) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  const saved = await invoke<boolean>("save_binary_file", bytes, {
    headers: { "x-file-name": name, "x-file-ext": ext },
  });
  return saved === true;
};

/** Native open dialog; resolves to the file's text, or null when cancelled. */
export const openTextFile = async (): Promise<string | null> =>
  (await call<string | null>("open_text_file")) ?? null;

export const logFrontend = (level: FrontendLevel, message: string): Promise<void | undefined> =>
  call<void>("log_frontend", { level, message });

export const reportMetrics = (sample: MetricsSample): Promise<void | undefined> =>
  call<void>("report_metrics", { sample });

export const getDebug = async (): Promise<boolean> => (await call<boolean>("get_debug")) === true;

export const flushDone = (): Promise<void | undefined> => call<void>("flush_done");

/** Run `handler` whenever the shell asks the studio to flush; resolves to the unsubscribe. */
export async function onStudioFlush(handler: () => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen("studio://flush", handler);
}

async function currentWindow() {
  if (!isTauri()) return undefined;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

// The window has no native frame: the studio's top bar carries these.
export const minimizeWindow = async (): Promise<void> => void (await (await currentWindow())?.minimize());
export const toggleMaximizeWindow = async (): Promise<void> =>
  void (await (await currentWindow())?.toggleMaximize());
/** Starts a native window drag (call on mousedown). */
export const startWindowDrag = async (): Promise<void> => void (await (await currentWindow())?.startDragging());
/** Asks to close; the shell then flushes and hides to the tray (or quits). */
export const closeWindow = async (): Promise<void> => void (await (await currentWindow())?.close());

/** Calls `handler` with the maximized state now and after every resize; resolves to the unsubscribe. */
export async function onMaximizedChange(handler: (maximized: boolean) => void): Promise<() => void> {
  const win = await currentWindow();
  if (!win) return () => {};
  const sync = async () => handler(await win.isMaximized());
  void sync();
  return win.onResized(() => void sync());
}

/**
 * At most `limit` messages per `windowMs`. When a window that dropped messages ends, the next
 * call reports how many were `suppressed`, for one summary line.
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  let start = 0;
  let count = 0;
  return (): { send: boolean; suppressed: number } => {
    const t = now();
    let suppressed = 0;
    if (count === 0 || t - start >= windowMs) {
      suppressed = Math.max(0, count - limit);
      start = t;
      count = 0;
    }
    count += 1;
    return { send: count <= limit, suppressed };
  };
}

interface HeapInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
}

/** The studio's current numbers; the heap is null where `performance.memory` is missing. */
export function collectMetrics(eventSources: number): MetricsSample {
  const memory = (performance as Performance & { memory?: HeapInfo }).memory;
  return {
    ts: Date.now(),
    jsHeapUsed: memory?.usedJSHeapSize ?? null,
    jsHeapTotal: memory?.totalJSHeapSize ?? null,
    domNodes: document.getElementsByTagName("*").length,
    eventSources,
    url: window.location.href,
  };
}
