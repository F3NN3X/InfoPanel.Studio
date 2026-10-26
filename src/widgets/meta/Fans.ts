// Fans's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "Fans",
  name: "Fans",
  category: "Hardware",
  icon: "mode_fan",
  prefixes: [],
  defaultSize: [2, 1],
  minSize: [1, 1],
  blurb: "Fan speeds and duty",
  tags: "rpm cooling",
  description: "GPU fans 1–3 with duty %, plus CPU fan. Icons spin at a speed proportional to RPM.",
};
