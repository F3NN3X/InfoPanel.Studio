// Keys' catalog entry: pure data, so the registry and the generator read it without the component.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "Keys",
  name: "Keys",
  category: "Info",
  icon: "grid_view",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [1, 1],
  blurb: "A grid of keys: tap, hold or double tap each",
  tags: "keys buttons grid launcher macro shortcut command hold double tap folder deck",
  description: "Studio's own key grid. Each key has a name, an icon and its own tap, hold and double tap: a page, the media keys, a mute, an OBS scene, or a command you approve. A folder key opens more keys.",
};
