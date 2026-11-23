import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The type-scale tokens in settings/tokens.css (--text-*) are font sizes, not colours, the --radius-* steps are radii and the --shadow-ui-* steps shadows.
const twMerge = extendTailwindMerge({
  extend: {
    theme: { radius: ["2", "3", "4", "5", "6", "7", "8", "10", "12", "14", "ui-sm", "ui-md", "ui-lg", "ui-menu"], shadow: ["ui-float", "ui-menu", "ui-modal", "ui-drawer"] },
    classGroups: { "font-size": [{ text: ["nano", "micro", "label", "caption", "small", "body", "lead", "title", "head", "display", "stat", "hero"] }] },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
