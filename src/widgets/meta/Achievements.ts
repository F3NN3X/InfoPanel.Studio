// Achievements's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "Achievements",
  name: "Achievements",
  category: "Gaming",
  icon: "trophy",
  prefixes: [],
  defaultSize: [2, 1],
  minSize: [1, 1],
  blurb: "Achievement progress for this game",
  tags: "steam",
  description: "Current game achievement completion ring, unlocked / total and the latest unlock.",
};
