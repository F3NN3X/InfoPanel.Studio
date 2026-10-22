// GameSpotlight's composite-layout settings (same keys, defaults and groups as the old Steam widget).
import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import { meta, type GameSpotlightProps } from "./GameSpotlight";
import { viewSetting } from "./registry/settings-kit";

export const SPOTLIGHT_COMPOSITE_SETTINGS: ModuleSetting[] = [
  { key: "showStats", label: "Stats", type: "boolean", default: true, group: "Composite" },
  { key: "showNews", label: "News line", type: "boolean", default: true, group: "Composite" },
];

/** The template's own `layout` prop is stored as `spotlightLayout`; `layout` keeps the standard meaning. */
export const SPOTLIGHT_LAYOUT_SETTING: ModuleSetting = viewSetting(meta, { label: "Spotlight layout", group: "Layout" });

type CompositeProps = Pick<GameSpotlightProps, "showStats" | "showNews">;

/** The stored composite toggles as props (unset = the template's default, on). */
export function compositeProps(s: ModuleSettings): CompositeProps {
  return { showStats: typeof s.showStats === "boolean" ? s.showStats : undefined, showNews: typeof s.showNews === "boolean" ? s.showNews : undefined };
}
