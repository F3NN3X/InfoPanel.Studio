// Page Rail's catalog entry: pure data, so the registry and the generator read it without the component.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "PageRail",
  name: "Page Rail",
  category: "Info",
  icon: "view_sidebar",
  prefixes: [],
  defaultSize: [1, 4],
  minSize: [1, 2],
  blurb: "Your pages and actions down one edge",
  tags: "rail sidebar pages navigation pinned dock",
  description: "A column of your pages, actions and small widgets. Tap a page to show it; the page shown is marked. Pinned to an edge, it stays still while pages change.",
};
