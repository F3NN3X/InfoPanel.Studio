// Notifications's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

/** The plugin's key prefix. */
export const P = "plugins.InfoPanel.Notifications.";

export const meta: WidgetMeta = {
  id: "Notifications",
  name: "Notifications",
  category: "Info",
  icon: "notifications",
  prefixes: [P],
  defaultSize: [3, 2],
  minSize: [2, 1],
  blurb: "Latest notification and history",
  tags: "toast alerts",
  description: "The latest toast notification and the history list from the Notifications plugin.",
};
