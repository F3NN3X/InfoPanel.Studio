// DriveSpace's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "DriveSpace",
  name: "Drive Space",
  category: "Storage",
  icon: "hard_drive",
  prefixes: ["plugins.drive-info-plugin."],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Used and free space per drive",
  tags: "disk volume ssd",
  description: "Used / free space per volume with label, type and file system.",
  views: [
    { id: "list", name: "List" },
    { id: "segments", name: "Segments", blurb: "Segmented fill bar per drive", defaultSize: [4, 3] },
    { id: "bars", name: "Bars", blurb: "Slim fill bar per drive", defaultSize: [4, 3] },
  ],
};
