import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AgentStatus,
  AppInfo,
  BrowserKind,
  Diagnostics,
  ForeignInfo,
  LogChunk,
  LogSource,
  ServerStats,
  SetAgentsResult,
  SetResult,
  SettingKey,
  Settings,
  Status,
  StopResult,
  Touchscreen,
  TouchView,
  UpdateState,
} from "./types";

/** The commands of the app windows (src-tauri/src/commands.rs); the settings pages that use them run only in the desktop app. */
export const ipc = {
  getSettings: () => invoke<Settings>("get_settings"),
  setSetting: (key: SettingKey, value: unknown) => invoke<SetResult>("set_setting", { key, value }),
  /** `factor` 1.25 is 125 %. */
  setZoom: (factor: number) => invoke<SetResult>("set_zoom", { factor }),
  serverStatus: () => invoke<Status>("server_status"),
  startServer: () => invoke<Status>("start_server"),
  stopServer: () => invoke<Status>("stop_server"),
  restartServer: () => invoke<Status>("restart_server"),
  serverStats: () => invoke<ServerStats>("server_stats"),
  defaultBrowserKind: () => invoke<BrowserKind>("default_browser_kind"),
  foreignServerInfo: () => invoke<ForeignInfo | null>("foreign_server_info"),
  useForeignServer: () => invoke<StopResult>("use_foreign_server"),
  listLocalAddresses: () => invoke<string[]>("list_local_addresses"),
  /** Opens the first-run setup in the studio, with the rights to start InfoPanel and set the setup's switches. */
  runSetup: () => invoke<void>("run_setup"),
  setAgents: (enabled: boolean) => invoke<SetAgentsResult>("set_agents", { enabled }),
  agentsStatus: () => invoke<AgentStatus[]>("agents_status"),
  repairAgents: () => invoke<AgentStatus[]>("repair_agents"),
  openAgentBackups: () => invoke<void>("open_agent_backups"),
  touchView: () => invoke<TouchView>("touch_view"),
  /** Writes one touch.json key (`null` = back to its default); rejects with the reasons when the file wouldn't apply. */
  touchSet: (key: string, value: unknown) => invoke<void>("touch_set", { key, value }),
  touchScreens: () => invoke<Touchscreen[]>("touch_screens"),
  touchUninstallDriver: (vid: number, pid: number) => invoke<{ changed: boolean; log: string }>("touch_uninstall_driver", { vid, pid }),
  /** Set up panels: resolves once the touch displays are bound (or cancelled), with what was bound. */
  touchSetup: () => invoke<{ port: string; monitor: string }[]>("touch_setup"),
  /** Resolves to the USB port touched on the panel's screen. */
  touchPair: (index: number) => invoke<string>("touch_pair", { index }),
  /** Resolves to the saved fit's error in panel px. */
  touchCalibrate: (index: number) => invoke<number>("touch_calibrate", { index }),
  touchIdentify: (index: number) => invoke<void>("touch_identify", { index }),
  touchCancel: () => invoke<void>("touch_cancel"),
  updateState: () => invoke<UpdateState>("update_state"),
  checkForUpdate: () => invoke<UpdateState>("check_for_update"),
  downloadUpdate: () => invoke<UpdateState>("download_update"),
  cancelUpdate: () => invoke<UpdateState>("cancel_update"),
  installUpdate: () => invoke<void>("install_update"),
  getDiagnostics: () => invoke<Diagnostics>("get_diagnostics"),
  openLogsFolder: () => invoke<void>("open_logs_folder"),
  openDevtools: () => invoke<void>("open_devtools"),
  openWebviewTaskManager: () => invoke<void>("open_webview_task_manager"),
  readLog: (source: LogSource, cursor?: string) => invoke<LogChunk>("read_log", { source, cursor }),
  revealPath: (path: string) => invoke<void>("reveal_path", { path }),
  appInfo: () => invoke<AppInfo>("app_info"),
  changelog: () => invoke<string>("changelog"),
  openExternal: (url: string) => invoke<void>("open_external", { url }),
  openHelp: (target: { article?: string; heading?: string }) => invoke<void>("open_help", target),
  /** The Settings window at a page (Help's "Open settings"). */
  openSettings: (section?: string) => invoke<void>("open_settings", { section }),
};

/** Calls `handler` with the payload of each `event`; resolves to the unsubscribe. */
export async function onEvent<T>(event: "server-status" | "update-state" | "settings-section" | "help-open", handler: (payload: T) => void): Promise<() => void> {
  return listen<T>(event, (e) => handler(e.payload));
}

/** A command's error as text (Tauri rejects with a string). */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
