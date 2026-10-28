// OsdStrip's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "OsdStrip",
  name: "OSD Strip",
  category: "Gaming",
  icon: "videogame_asset",
  prefixes: [],
  defaultSize: [6, 1],
  minSize: [2, 1],
  blurb: "In-game overlay strip",
  tags: "rtss afterburner osd fps",
  description: "In-game overlay strip (RTSS / Afterburner OSD): fixed cell order, monospace digits, color only when a value drops.",
};
