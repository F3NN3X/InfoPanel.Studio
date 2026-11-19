// Device Batteries's catalog entry: pure data, so the registry and the generator read it without the component.
import type { WidgetMeta } from "../core/types";

/** The server-owned device prefix (`ips-server devices.rs`): `battery.<id>.<field>`, plus `battery.status`. */
export const P = "battery.";

export const meta: WidgetMeta = {
  id: "DeviceBatteries",
  name: "Device Batteries",
  category: "Hardware",
  icon: "battery_full",
  prefixes: [P],
  defaultSize: [3, 2],
  minSize: [2, 1],
  blurb: "Wireless device batteries and charging",
  tags: "battery batteries mouse keyboard headset controller phone charge low wireless",
  description:
    "Every wireless device the server polls — mice, keyboards, headsets, controllers and phones — with its charge, whether it is charging, asleep or low, as one row per device, a ring each or a single device.",
  views: [
    { id: "list", name: "List", blurb: "One row per device with its charge bar", tags: "rows bars" },
    { id: "tiles", name: "Tiles", blurb: "A ring per device", tags: "rings grid" },
    { id: "single", name: "Single device", blurb: "One device's charge, picked in the options", tags: "one ring" },
    { id: "lowest", name: "Lowest first", blurb: "The devices ranked by charge, lowest first", tags: "ranked order" },
  ],
};
