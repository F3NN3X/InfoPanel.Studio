// OnAirBeacon's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "OnAirBeacon",
  name: "On-Air Beacon",
  category: "Streaming",
  icon: "sensors",
  prefixes: [],
  defaultSize: [3, 1],
  minSize: [1, 1],
  blurb: "Live, recording or off air, from OBS",
  tags: "obs stream streaming recording rec live broadcast",
  description: "A large LIVE, REC or Off air state read from OBS, with how long it has been going. Connect OBS under Island › On air.",
};
