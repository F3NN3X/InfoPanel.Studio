import type { ModuleSettings } from "@/modules/types";

/** A built-in Style: one widget's look, ready to start from (Style tab › Start from a Style). */
export interface BuiltinStyle {
  id: string;
  name: string;
  settings: ModuleSettings;
}

/**
 * The five former "Style preset" choices, now built-in Styles (config v10 drops the zone's `preset` key). They
 * carry look keys only: the `tint` the old Dark / Light / Vivid / Mono options also wrote is gone. Default is the
 * empty look, so applying it clears the widget's own style.
 */
export const BUILTIN_STYLES: readonly BuiltinStyle[] = [
  { id: "default", name: "Default", settings: {} },
  { id: "dark", name: "Dark", settings: { surface: "matte-dark" } },
  { id: "light", name: "Light", settings: { surface: "matte-light" } },
  { id: "vivid", name: "Vivid", settings: { surface: "glass" } },
  { id: "mono", name: "Mono", settings: { surface: "matte-dark", accent: "#fafafa" } },
];
