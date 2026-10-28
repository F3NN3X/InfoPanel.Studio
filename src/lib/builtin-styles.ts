import type { ModuleSettings } from "@/modules/types";

/** A built-in Style: one widget's look, ready to start from (Style tab › Start from a Style). */
export interface BuiltinStyle {
  id: string;
  name: string;
  settings: ModuleSettings;
}

/**
 * The five former "Style preset" choices, now built-in Styles (config v10 drops the zone's `preset` key). They
 * carry look keys only: the `tint` the old Dark / Light / Vivid / Mono options also wrote is gone. Follow theme is the
 * empty look, so applying it clears the widget's own style.
 */
export const BUILTIN_STYLES: readonly BuiltinStyle[] = [
  { id: "default", name: "Follow theme", settings: {} },
  { id: "dark", name: "Matte dark", settings: { surface: "matte-dark" } },
  { id: "light", name: "Matte light", settings: { surface: "matte-light" } },
  { id: "vivid", name: "Frosted", settings: { surface: "glass" } },
  { id: "mono", name: "Monochrome", settings: { surface: "matte-dark", accent: "#fafafa" } },
];
