import { STYLE_SETTINGS } from "@/modules/standard-settings";
import { DEFAULT_SKIN } from "./theme-model";

/**
 * The Default skin's spellings as one, and the skins' names as the UI writes them. Split from `theme-model` so the
 * kiosk, which only stores skins, doesn't carry them.
 */

/** A stored skin with the Default skin's spellings (unset, `auto`, `default`) as one: `DEFAULT_SKIN`. */
export const skinOf = (skin: unknown): string => (typeof skin === "string" && skin && skin !== "default" ? skin : DEFAULT_SKIN);

/** Whether two stored skins are the same skin. */
export const sameSkin = (a: unknown, b: unknown): boolean => skinOf(a) === skinOf(b);

const SKIN_OPTIONS = STYLE_SETTINGS.find((d) => d.key === "skin")?.options ?? [];

/** A skin's name as the Skin select writes it: Default (also for unset and `default`), TUI, HUD, else capitalized. */
export const skinLabel = (skin: unknown): string => {
  const value = skinOf(skin);
  return SKIN_OPTIONS.find((o) => o.value === value)?.label ?? value;
};
