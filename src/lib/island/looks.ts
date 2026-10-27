/**
 * The Dynamic Island's built-in looks: how the pill is drawn (shape, colour, opacity, border, shadow, weight) and
 * nothing else, so applying one keeps a screen's idle view, values, size, font, clock and alerts. The Library lists
 * them; the Island tab's Look rows set the same fields by hand.
 */
import type { IslandConfig } from "./config";

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
  { id: "glass", name: "Glass", description: "See-through and blurred, with a faint edge", look: { ...BASE, opacity: 65, border: "subtle", weight: "medium" } },
  { id: "card", name: "Theme card", description: "The theme’s card colour and text", look: { ...BASE, tint: "theme", weight: "medium" } },
  { id: "outline", name: "Accent outline", description: "The theme’s card with an accent border, no shadow", look: { ...BASE, tint: "theme", border: "accent", shadow: false, weight: "bold" } },
  { id: "paper", name: "Paper", description: "A light pill with dark text", look: { ...BASE, tint: "custom", bgColor: "#f4f4f1", fgColor: "#1b1b1f", border: "subtle", weight: "medium" } },
];
