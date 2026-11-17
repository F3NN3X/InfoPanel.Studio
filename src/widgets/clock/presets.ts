// Clock's presets (studio only, see _docs/widgets/FORMAT.md): the default, and the rail's (owner Q3 of the pinned layer):
// the time over the short date in a rail slot, without seconds.
import type { WidgetPreset } from "../define";

const presets: readonly WidgetPreset[] = [
  { id: "default", name: "Default", settings: {}, size: [2, 1], default: true },
  { id: "rail", name: "Rail", blurb: "The time over the short date, for the page rail", tags: "rail sidebar", settings: { face: "stacked", showSeconds: false }, size: "rail" },
];

export default presets;
