export type SectionId = "general" | "server" | "agents" | "updates" | "diagnostics" | "logs" | "about" | "changelog";

/** Whether `value` names a settings section. */
export const isSectionId = (value: string): value is SectionId => Object.hasOwn(SECTION_NAMES, value);

export const SECTION_NAMES: Record<SectionId, string> = {
  general: "General",
  server: "Server",
  agents: "Coding agents",
  updates: "Updates",
  diagnostics: "Diagnostics",
  logs: "Logs",
  about: "About",
  changelog: "Changelog",
};

export interface SearchEntry {
  /** The `id` of the row that gets the highlight. */
  row: string;
  label: string;
  section: SectionId;
}

/** Every row search finds (SPEC 8). */
export const SEARCH_INDEX: SearchEntry[] = [
  { row: "zoom", label: "App zoom", section: "general" },
  { row: "start-at-login", label: "Start at login", section: "general" },
  { row: "open-studio", label: "Open the studio on launch", section: "general" },
  { row: "start-server", label: "Start the server on launch", section: "general" },
  { row: "close-to-tray", label: "Close to tray", section: "general" },
  { row: "remember-bounds", label: "Remember window size", section: "general" },
  { row: "server-card", label: "Start / stop server", section: "server" },
  { row: "server-card", label: "Restart server", section: "server" },
  { row: "listen", label: "Who can connect (listen on)", section: "server" },
  { row: "port", label: "Port", section: "server" },
  { row: "allowed-hosts", label: "Allowed host names", section: "server" },
  { row: "kiosk", label: "Kiosk URL", section: "server" },
  { row: "auto-restart", label: "Restart automatically if it crashes", section: "server" },
  { row: "agents", label: "Connect coding agents", section: "agents" },
  { row: "agent-claude", label: "Claude Code hooks", section: "agents" },
  { row: "agent-codex", label: "Codex hooks", section: "agents" },
  { row: "update-card", label: "Check for updates", section: "updates" },
  { row: "check-updates", label: "Check for updates at startup", section: "updates" },
  { row: "channel", label: "Release channel", section: "updates" },
  { row: "auto-download", label: "Download in the background", section: "updates" },
  { row: "debug", label: "Debug mode", section: "diagnostics" },
  { row: "diag-table", label: "Diagnostics / memory", section: "diagnostics" },
  { row: "diag-actions", label: "Open DevTools", section: "diagnostics" },
  { row: "diag-actions", label: "Copy diagnostics summary", section: "diagnostics" },
  { row: "logs", label: "Logs", section: "logs" },
  { row: "about-hero", label: "Version", section: "about" },
  { row: "about-files", label: "Data folder", section: "about" },
  { row: "changelog", label: "Changelog", section: "changelog" },
];

/** The entries whose label or section name contains `query`, ignoring case. */
export function searchSettings(query: string, index: SearchEntry[] = SEARCH_INDEX): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return index.filter((e) => `${e.label} ${SECTION_NAMES[e.section]}`.toLowerCase().includes(q));
}
