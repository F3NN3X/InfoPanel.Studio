// GameSpotlight's composite-layout settings (same keys, defaults and groups as the old Steam widget).
import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import type { GameSpotlightProps } from "./GameSpotlight";

export const SPOTLIGHT_COMPOSITE_SETTINGS: ModuleSetting[] = [
  { key: "showStats", label: "Stats", type: "boolean", default: true, group: "Composite" },
  { key: "showNews", label: "News line", type: "boolean", default: true, group: "Composite" },
];

/** The template's own `layout` prop is stored as `spotlightLayout`; `layout` keeps the standard meaning. */
export const SPOTLIGHT_LAYOUT_SETTING: ModuleSetting = {
  key: "spotlightLayout",
  label: "Spotlight layout",
  type: "select",
  default: "hero",
  options: [
    { value: "hero", label: "Hero" },
    { value: "poster", label: "Poster" },
    { value: "logo", label: "Logo" },
    { value: "ticker", label: "Ticker" },
    { value: "combo", label: "Combo (with music)" },
    { value: "composite", label: "Composite (profile, stats, news)" },
  ],
  group: "Layout",
};

type CompositeProps = Pick<GameSpotlightProps, "showStats" | "showNews">;

/** The stored composite toggles as props (unset = the template's default, on). */
export function compositeProps(s: ModuleSettings): CompositeProps {
  return { showStats: typeof s.showStats === "boolean" ? s.showStats : undefined, showNews: typeof s.showNews === "boolean" ? s.showNews : undefined };
}
