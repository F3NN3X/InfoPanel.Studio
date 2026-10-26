// ServiceHealth's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "ServiceHealth",
  name: "Service Health",
  category: "System",
  icon: "health_and_safety",
  prefixes: [],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Status of every data source",
  tags: "plugins sources status",
  description: "One status board for every data source: Data API, LibreHW, RTSS, Wave Link, Spotify, media, Steam, weather, network.",
  viewKey: "healthLayout",
  views: [
    { id: "list", name: "List" },
    { id: "pills", name: "Pills", blurb: "Every data source as a status pill", tags: "chips badges compact" },
  ],
};
