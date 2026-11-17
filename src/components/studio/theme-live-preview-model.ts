import type { AppearancePreset } from "@/lib/appearance-presets";
import type { PreviewScope, ThemePreview } from "@/lib/theme-preview";
import { LOOK_IDS } from "@/looks/ids";
import { PACK_IDS } from "@/looks/pack";
import { lookName, lookPreset, lookPresetId } from "./look-gallery-model";
import type { ThemeAt } from "./theme-cards";

/**
 * Theme's live preview as data: the cards it steps through (Next and Previous), the scopes it draws at, and what its bar
 * says. A preview changes nothing: the canvas draws `applyPreview` of the config, Apply is one change of the same. Pure.
 */

/** A card the preview can show: a saved theme, an imported pack or a gallery theme. */
export interface PreviewItem {
  id: string;
  name: string;
  preset: AppearancePreset;
  /** A Look or a pack (it keeps the level's own values), not a saved theme. */
  look: boolean;
}

/** The scope picked in the preview bar: every screen, or the Theme view's level (the screen, or its page). */
export type ScopeChoice = "all" | "screen" | "page";

/** How long the kiosks show a preview before the server drops it (`THEME_PREVIEW_MS` in control_store.rs). */
export const KIOSK_PREVIEW_MS = 60_000;

/** The remembered preview options (localStorage, as the other studio UI preferences). */
export const PREVIEW_HOVER_KEY = "studio.theme.previewOnHover";
export const PREVIEW_COMPARE_KEY = "studio.theme.previewCompare";
export const PREVIEW_KIOSKS_KEY = "studio.theme.previewKiosks";

/**
 * Every card in Browse's order without loading a theme: Yours (saved themes, then imported packs), Theme packs, Plain
 * themes. A pack a built-in theme shadows has no card, as in Browse.
 */
export function previewOrder(
  saved: readonly AppearancePreset[],
  packs: readonly { id: string; name: string }[],
  galleryIds: readonly string[],
  samples: readonly AppearancePreset[]
): PreviewItem[] {
  const gallery = galleryIds.map((id): PreviewItem => {
    const name = lookName(id);
    return { id, name, preset: lookPreset({ id, name, description: "" }, samples.find((p) => p.id === lookPresetId(id))), look: true };
  });
  return [
    ...saved.map((p): PreviewItem => ({ id: p.id, name: p.name, preset: p, look: false })),
    ...packs.filter((k) => !LOOK_IDS.includes(k.id)).map((k): PreviewItem => ({ id: k.id, name: k.name, preset: lookPreset({ id: k.id, name: k.name, description: "" }), look: true })),
    ...gallery.filter((g) => PACK_IDS.has(g.id)),
    ...gallery.filter((g) => !PACK_IDS.has(g.id)),
  ];
}

/**
 * The card before or after `currentId` (wrapping), among `visible` when Browse's filters leave some, else among all.
 * Undefined when there is nothing to step to.
 */
export function stepPreview(order: readonly PreviewItem[], visible: readonly string[] | undefined, currentId: string | undefined, delta: 1 | -1): PreviewItem | undefined {
  const shown = visible && visible.length > 0 ? visible.flatMap((id) => order.filter((i) => i.id === id)) : order;
  if (shown.length === 0) return undefined;
  const at = shown.findIndex((i) => i.id === currentId);
  if (at < 0) return shown[delta === 1 ? 0 : shown.length - 1];
  return shown.length < 2 ? undefined : shown[(at + delta + shown.length) % shown.length];
}

/** The scope a choice names at the Theme view's level. */
export function scopeOf(choice: ScopeChoice, at: ThemeAt): PreviewScope {
  if (choice === "all") return { kind: "all" };
  if (choice === "page" && at.level === "page") return { kind: "page", profileId: at.profileId, pageId: at.pageId };
  return { kind: "profile", profileId: at.profileId };
}

/** The choice the view's level starts with. */
export const choiceOf = (at: ThemeAt): ScopeChoice => (at.level === "page" ? "page" : "screen");

/** Where the bar says the preview draws: "all screens", "Desk", "Desk › Main page". */
export function scopeText(choice: ScopeChoice, screenName: string, pageName: string): string {
  if (choice === "all") return "all screens";
  return choice === "page" ? `${screenName} › ${pageName} page` : screenName;
}

/** The kiosks' countdown: whole seconds left, never below 0. */
export const secondsLeft = (until: number, now: number): number => Math.max(0, Math.ceil((until - now) / 1000));

/** What the kiosks are sent: the preview as `parsePreview` reads it (a preset without its template-only zone looks). */
export function kioskPreview(p: ThemePreview): ThemePreview {
  const { zoneLook: _zones, ...preset } = p.preset;
  return { ...p, preset };
}
