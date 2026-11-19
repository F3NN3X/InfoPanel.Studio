// Device Batteries's presets: the views as named bundles, and the page rail's two slots (studio only, see
// _docs/widgets/FORMAT.md). A rail preset draws its body (`compact: "full"`): a ring or three mini rows, not the summary card.
import type { WidgetPreset } from "../define";

const presets: readonly WidgetPreset[] = [
  { id: "list", name: "List", view: "list", blurb: "One row per device with its charge bar", tags: "rows bars", settings: {}, size: [3, 2], default: true },
  { id: "tiles", name: "Tiles", view: "tiles", blurb: "A ring per device", tags: "rings grid", settings: {}, size: [3, 2] },
  { id: "pills", name: "Pills", view: "pills", blurb: "A chip per device with its icon, battery and charge", tags: "chips compact", settings: {}, size: [3, 2] },
  { id: "single", name: "Single device", view: "single", blurb: "One device's charge, picked in the options", tags: "one ring", settings: {}, size: [3, 2] },
  { id: "lowest", name: "Lowest first", view: "lowest", blurb: "The devices ranked by charge, lowest first", tags: "ranked order", settings: {}, size: [3, 2] },
  { id: "rail-lowest", name: "Rail: lowest charge", view: "lowest", blurb: "The lowest charge as a ring, for the page rail", tags: "rail sidebar", settings: { compact: "full" }, size: "rail" },
  { id: "rail-list", name: "Rail: three devices", view: "list", blurb: "Up to three devices, icon, charge and bar, for the page rail; every device as icon and battery with Charge as Bar", tags: "rail sidebar", settings: { compact: "full" }, size: "rail" },
  { id: "rail-one", name: "Rail: one device", view: "single", blurb: "One device stacked, icon over battery and charge, for the page rail", tags: "rail sidebar", settings: { compact: "full" }, size: "rail" },
];

export default presets;
