/**
 * A template's look as the built-in appearance preset it is: the one place a template and a palette of it become
 * a theme, a corner radius, a widget style and a page background. `instantiate` builds a new screen from it, and the
 * Theme view lists the same presets (`template-presets.ts`) to apply to any screen. Only what an appearance preset
 * can't hold stays with the template: the spacing (`Look.gap`, `padding`) and a palette's `swap` and `zones`, which
 * write into the zones' own settings.
 */
import type { ModuleSettings } from "@/modules/types";
import type { AppearancePreset, ZoneLook } from "../appearance-presets";
import { presetTokens } from "../appearance-presets";
import { themedOf } from "../theme-model";
import type { ScreenTemplate, Variant } from "./kit";

/** The id of a template's built-in preset, for one of its palettes (the first when unset); stable, as saved screens may name it. */
export const templatePresetId = (t: Pick<ScreenTemplate, "id" | "variants">, variant?: Pick<Variant, "id">): string =>
  t.variants?.length ? `builtin:tpl-${t.id}-${(variant ?? t.variants[0]).id}` : `builtin:tpl-${t.id}`;

/** The palette of a template an id names: that one, else its first (none when it has no palettes). */
export const variantOf = (t: Pick<ScreenTemplate, "variants">, id?: string): Variant | undefined => t.variants?.find((v) => v.id === id) ?? t.variants?.[0];

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Settings with colours swapped wherever a string value holds them ("#rrggbb" to "#rrggbb", matched without regard to case). */
export function swapColors(settings: ModuleSettings, swap: Readonly<Record<string, string>> | undefined): ModuleSettings {
  const pairs = Object.entries(swap ?? {});
  if (pairs.length === 0) return settings;
  const pattern = new RegExp(pairs.map(([from]) => escaped(from)).join("|"), "gi");
  const to = new Map(pairs.map(([from, hex]) => [from.toLowerCase(), hex]));
  return Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [key, typeof value === "string" ? value.replace(pattern, (m) => to.get(m.toLowerCase()) ?? m) : value]),
  );
}

/** What a variant writes into the zones besides the preset; none when it writes nothing there. */
function zoneLookOf(variant: Variant | undefined): ZoneLook | undefined {
  if (!variant?.swap && !variant?.zones) return undefined;
  return { ...(variant.swap ? { swap: { ...variant.swap } } : {}), ...(variant.zones ? { values: { ...variant.zones } } : {}) };
}

/** The built-in preset of a template in one of its palettes: the template's look with the palette's changes over it. */
export function templatePreset(t: ScreenTemplate, variant?: Variant): AppearancePreset {
  const background = variant?.background ?? t.look.background;
  const zoneLook = zoneLookOf(variant);
  return {
    id: templatePresetId(t, variant),
    name: variant ? `${t.name} · ${variant.name}` : t.name,
    description: t.blurb,
    theme: { ...presetTokens(t.look), ...(variant?.theme ?? {}) },
    radius: t.look.radius,
    style: themedOf({ ...t.look.style, ...variant?.style }),
    ...(background ? { background: { ...background } } : {}),
    ...(zoneLook ? { zoneLook } : {}),
  };
}
