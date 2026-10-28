/**
 * The Dynamic Island's built-in looks: how the pill is drawn (shape, colour, opacity, border, shadow, weight) and
 * nothing else, so applying one keeps a screen's idle view, values, size, font, clock and alerts. The island
 * settings' Look section offers them; its rows below set the same fields by hand.
 */
import type { DashboardConfig } from "@/lib/layout";
import { withIsland, type IslandConfig } from "./config";

export type IslandLookFields = Pick<IslandConfig, "shape" | "tint" | "bgColor" | "fgColor" | "opacity" | "border" | "shadow" | "weight">;

export interface IslandLookPreset {
  id: string;
  name: string;
  description: string;
  look: IslandLookFields;
}

const BASE: IslandLookFields = { shape: "pill", tint: "black", bgColor: "#000000", fgColor: "#ffffff", opacity: 100, border: "none", shadow: true, weight: "semibold" };

export const ISLAND_LOOKS: readonly IslandLookPreset[] = [
  { id: "classic", name: "Classic pill", description: "A black pill below the top edge", look: BASE },
  { id: "notch", name: "Notch", description: "Black, glued to the top edge with curved corners", look: { ...BASE, shape: "notch", shadow: false } },
  { id: "glass", name: "Frosted pill", description: "See-through and blurred, with a faint edge", look: { ...BASE, opacity: 65, border: "subtle", weight: "medium" } },
  { id: "card", name: "Match theme", description: "The theme’s card color and text", look: { ...BASE, tint: "theme", weight: "medium" } },
  { id: "outline", name: "Accent outline", description: "The theme’s card with an accent border, no shadow", look: { ...BASE, tint: "theme", border: "accent", shadow: false, weight: "bold" } },
  { id: "paper", name: "Light pill", description: "A light pill with dark text", look: { ...BASE, tint: "custom", bgColor: "#f4f4f1", fgColor: "#1b1b1f", border: "subtle", weight: "medium" } },
];

/**
 * An Island look on one screen or on all of them: its shape, colours, border, shadow and weight, and the island
 * switched on (a look you apply is one you want to see). Everything else of the island is kept, as the Look rows
 * would leave it.
 */
export function withIslandLook(config: DashboardConfig, look: IslandLookFields, profileId: string | "all"): DashboardConfig {
  return { ...config, profiles: config.profiles.map((p) => (profileId === "all" || p.id === profileId ? withIsland(p, { ...look, enabled: true }) : p)) };
}
