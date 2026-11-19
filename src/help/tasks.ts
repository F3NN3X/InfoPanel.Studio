/** A thing a reader came to do, in their words, and the article section that does it. */
export interface HelpTask {
  title: string;
  article: string;
  /** The heading's anchor in that article. */
  heading: string;
}

/** The task cards of Help home, in reading order. `checkTasks` (check.ts) holds each to a real article and heading. */
export const HELP_TASKS: HelpTask[] = [
  { title: "My kiosk shows nothing", article: "problems", heading: "the-display-says-it-cant-connect" },
  { title: "Move a widget to another page", article: "zones", heading: "widget-actions" },
  { title: "Import an InfoPanel profile", article: "import", heading: "the-infopanel-import-flow" },
  { title: "Make it faster", article: "performance", heading: "choosing-a-setting" },
  { title: "Back up my settings", article: "import", heading: "export-back-up" },
  { title: "Connect OBS", article: "connections", heading: "obs" },
  { title: "Connect device batteries", article: "connections", heading: "peripherals" },
];
