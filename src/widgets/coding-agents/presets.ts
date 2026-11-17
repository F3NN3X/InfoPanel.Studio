// Coding Agents's presets: the views the Add panel offered, as named bundles (studio only, see _docs/widgets/FORMAT.md).
import type { WidgetPreset } from "../define";

const presets: readonly WidgetPreset[] = [
  { id: "full", name: "Full", view: "full", settings: {}, size: [3, 3], default: true },
  { id: "summary", name: "Summary", view: "summary", blurb: "Plan limits, today and sessions", settings: {}, size: [3, 3] },
  { id: "limits", name: "Limits", view: "limits", blurb: "Plan limit bars only", settings: {}, size: [3, 3] },
  { id: "sessions", name: "Sessions", view: "sessions", blurb: "A card per session: what it is doing, and which one needs you", settings: {}, size: [4, 3] },
];

export default presets;
