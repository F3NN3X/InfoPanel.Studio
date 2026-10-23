/** What the Rust side sends the settings window (src-tauri: settings.rs, state.rs, updater.rs, ...). */

export type Listen = "local" | "lan";
export type Channel = "stable" | "beta";
export type StudioRefresh = "idle" | "daily" | "off";
export type ReleaseHiddenStudio = "after1m" | "after10m" | "after60m" | "never";
export type OpenStudioIn = "appWindow" | "edgeApp" | "defaultBrowser";
/** The default browser's engine (`default_browser_kind`); unknown when it couldn't be read. */
export type BrowserKind = "chromium" | "other" | "unknown";

export interface AgentSettings {
  enabled: boolean;
}

/** The saved app settings (`get_settings`, `set_setting`). */
export interface Settings {
  listen: Listen;
  port: number;
  allowedHosts: string[];
  allowRemoteEdit: boolean;
  autoRestart: boolean;
  startAtLogin: boolean;
  openStudioOnLaunch: boolean;
  startServer: boolean;
  closeToTray: boolean;
  rememberBounds: boolean;
  zoom: number;
  studioRefresh: StudioRefresh;
  releaseHiddenStudio: ReleaseHiddenStudio;
  reduceUnfocusedAnimation: boolean;
  openStudioIn: OpenStudioIn;
  checkForUpdates: boolean;
  updateChannel: Channel;
  autoDownload: boolean;
  agents: AgentSettings;
  debug: boolean;
}

/** The settings `set_setting` takes by key (everything but agents, which `set_agents` owns). */
export type SettingKey = Exclude<keyof Settings, "agents">;

export interface SetResult {
  ok: boolean;
  error?: string;
  restartRequired: boolean;
  settings: Settings;
}

export type Phase =
  | "starting"
  | "running"
  | "stopped"
  | "restarting"
  | "failed"
  | "foreign_dashboard"
  | "port_in_use";

export type ErrorCode = "EADDRINUSE" | "EACCES" | "OTHER";

/** What the running server was started with. */
export interface RunningConfig {
  listen: Listen;
  port: number;
  debug: boolean;
  allowedHosts: string[];
  allowRemoteEdit: boolean;
}

export interface Status {
  state: Phase;
  owned: boolean;
  host: string;
  port: number;
  origin: string;
  studioUrl: string;
  kioskUrl: string;
  message: string | null;
  foreignVersion: string | null;
  appVersion: string;
  debug: boolean;
  pid: number | null;
  startedAt: number | null;
  runningConfig: RunningConfig | null;
  errorCode: ErrorCode | null;
  failedAt: number | null;
  suggestedPort: number | null;
}

export interface ServerStats {
  clients: number | null;
  rssBytes: number | null;
  uptimeMs: number | null;
}

export interface ForeignInfo {
  pid: number;
  exe: string;
  name: string;
  stoppable: boolean;
  adoptable: boolean;
}

export interface StopResult {
  ok: boolean;
  message: string;
}

export type UpdatePhase = "current" | "checking" | "available" | "downloading" | "ready" | "installing" | "error";

export interface UpdateState {
  state: UpdatePhase;
  currentVersion: string;
  version?: string;
  notes?: string;
  date?: string;
  checkedAt?: number;
  downloaded?: number;
  total?: number;
  error?: string;
}

export type AgentName = "claude" | "codex";
export type HookState = "installed" | "not_connected" | "needs_repair" | "not_found";

export interface AgentStatus {
  agent: AgentName;
  path: string;
  status: HookState;
}

export interface AgentStep {
  step: string;
  ok: boolean;
  output?: { results?: { agent?: string; status?: string; message?: string }[] } | null;
  error?: string | null;
}

export interface SetAgentsResult {
  ok: boolean;
  enabled: boolean;
  steps: AgentStep[];
  agents: AgentStatus[];
}

export interface Growth {
  from: number;
  to: number;
  pct: number | null;
  minutes: number;
}

export interface Series {
  name: string;
  latest: number;
  growth30: Growth | null;
  growth60: Growth | null;
  growing: boolean;
}

export interface Diagnostics {
  debug: boolean;
  samples: number;
  latestTime: number | null;
  series: Series[];
  logsDir: string;
  sampleEverySecs: number;
  status: Status;
}

export type LogSource = "server" | "app" | "studio";

export interface LogChunk {
  lines: string[];
  cursor: string;
  file: string;
  reset: boolean;
}

export interface AppInfo {
  version: string;
  channel: Channel;
  buildDate: string;
  node: string | null;
  webview: string | null;
  os: string;
  paths: { settingsFile: string; dataDir: string; logsDir: string };
}
