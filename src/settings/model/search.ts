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

/**
 * The Settings window's pages: the App sections, and where it loads from the Studio's server (PLAN decision 21) the
 * Dashboard and Studio pages. The rescue window (app/settings.html) has the App sections only.
 */
export type PageId = SectionId | "dashboard" | "studio";

export const PAGE_NAMES: Record<PageId, string> = { ...SECTION_NAMES, dashboard: "Dashboard", studio: "Studio" };

/** Whether `value` names a Settings window page. */
export const isPageId = (value: string): value is PageId => Object.hasOwn(PAGE_NAMES, value);

/**
 * A page and the row on it from `page` or `page/row` (a URL hash, the shell's `settings-section` event), when it is one
 * of `pages`.
 */
export function parsePageTarget<P extends PageId>(value: string, pages: readonly P[]): { section: P; row?: string } | null {
  const [id, row] = value.split("/");
  const page = pages.find((p) => p === id);
  return page ? { section: page, ...(row ? { row } : {}) } : null;
}

export interface SearchEntry<P extends PageId = SectionId> {
  /** The `id` of the row that gets the highlight (on Dashboard and Studio: the group's `data-nav-section`). */
  row: string;
  label: string;
  section: P;
}

/** Every row search finds (SPEC 8). */
export const SEARCH_INDEX: SearchEntry[] = [
  { row: "zoom", label: "App zoom", section: "general" },
  { row: "start-at-login", label: "Start at login", section: "general" },
  { row: "open-studio", label: "Open the studio on launch", section: "general" },
  { row: "start-server", label: "Start the server on launch", section: "general" },
  { row: "close-to-tray", label: "Close to tray", section: "general" },
  { row: "remember-bounds", label: "Remember window size", section: "general" },
  { row: "studio-refresh", label: "Refresh the Studio", section: "general" },
  { row: "release-hidden-studio", label: "Release the hidden studio", section: "general" },
  { row: "reduce-unfocused-animation", label: "Reduce studio animation when unfocused", section: "general" },
  { row: "preview-data", label: "Design preview data", section: "general" },
  { row: "open-studio-in", label: "Open the studio in", section: "general" },
  { row: "server-card", label: "Start / stop server", section: "server" },
  { row: "server-card", label: "Restart server", section: "server" },
  { row: "listen", label: "Who can connect (listen on)", section: "server" },
  { row: "port", label: "Port", section: "server" },
  { row: "allowed-hosts", label: "Allowed host names", section: "server" },
  { row: "allow-remote-edit", label: "Allow editing from other devices", section: "server" },
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
  { row: "releases", label: "All releases on GitHub", section: "changelog" },
];

/** The Dashboard and Studio rows search finds, in the window on the Studio's server. */
export const PREFERENCES_INDEX: SearchEntry<PageId>[] = [
  { row: "performance", label: "Frame-rate cap", section: "dashboard" },
  { row: "performance", label: "Animations", section: "dashboard" },
  { row: "performance", label: "Refresh kiosk pages", section: "dashboard" },
  { row: "performance", label: "Ring glides", section: "dashboard" },
  { row: "performance", label: "Limit blur", section: "dashboard" },
  { row: "performance", label: "Blur inside widgets", section: "dashboard" },
  { row: "performance", label: "Live graph glow", section: "dashboard" },
  { row: "clock", label: "Clock (12 / 24 h)", section: "dashboard" },
  { row: "clock", label: "Show seconds", section: "dashboard" },
  { row: "clock", label: "Date locale", section: "dashboard" },
  { row: "kiosk", label: "Page dots & swipe", section: "dashboard" },
  { row: "kiosk", label: "Hide cursor", section: "dashboard" },
  { row: "danger", label: "Reset everything", section: "dashboard" },
  { row: "editor", label: "Quick bar", section: "studio" },
  { row: "editor", label: "Inspector sections", section: "studio" },
  { row: "editor", label: "Advanced settings", section: "studio" },
  { row: "editor", label: "Default zoom", section: "studio" },
  { row: "editor", label: "Show grid", section: "studio" },
  { row: "editor", label: "Show rulers", section: "studio" },
  { row: "editor", label: "Left panel width", section: "studio" },
  { row: "editor", label: "Widget list density", section: "studio" },
  { row: "editor", label: "Preview on hover", section: "studio" },
];

/** The entries whose label or section name contains `query`, ignoring case. */
export function searchSettings<P extends PageId = SectionId>(query: string, index: SearchEntry<P>[] = SEARCH_INDEX as SearchEntry<P>[]): SearchEntry<P>[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return index.filter((e) => `${e.label} ${PAGE_NAMES[e.section]}`.toLowerCase().includes(q));
}
