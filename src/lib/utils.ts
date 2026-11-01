import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The type-scale tokens in index.css (--text-*) are font sizes, not colours.
const twMerge = extendTailwindMerge({ extend: { classGroups: { "font-size": [{ text: ["micro", "caption", "body", "title"] }] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
