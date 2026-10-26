/**
 * The built-in appearance presets the screen templates are: one for each template, and one for each palette of
 * it, grouped by template. Kept apart from `looks.ts` because it pulls in the whole catalog: the Theme view loads
 * it on demand.
 */
import type { AppearancePreset } from "../appearance-presets";
import { SCREEN_TEMPLATES } from "./catalog";
import { templatePreset } from "./looks";

export interface TemplatePresetGroup {
  /** The template's id and name. */
  id: string;
  name: string;
  presets: readonly AppearancePreset[];
}

export const TEMPLATE_PRESET_GROUPS: readonly TemplatePresetGroup[] = SCREEN_TEMPLATES.map((t) => ({
  id: t.id,
  name: t.name,
  presets: (t.variants ?? [undefined]).map((v) => templatePreset(t, v)),
}));

export const TEMPLATE_PRESETS: readonly AppearancePreset[] = TEMPLATE_PRESET_GROUPS.flatMap((g) => g.presets);
