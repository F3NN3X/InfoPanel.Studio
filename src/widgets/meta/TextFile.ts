// TextFile's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

/** The plugin's key prefix. */
export const P = "plugins.InfoPanel.TextFile.";

export const meta: WidgetMeta = {
  id: "TextFile",
  name: "Text File",
  category: "Info",
  icon: "description",
  prefixes: [P],
  defaultSize: [3, 2],
  minSize: [2, 1],
  blurb: "A watched text file, live",
  tags: "text file log",
  description: "Shows a text file the TextFile plugin watches, with its size, line count and status.",
};
