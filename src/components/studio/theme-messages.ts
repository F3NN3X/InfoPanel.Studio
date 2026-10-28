import { listText, pageParts, type ThemeLevel } from "./theme-view-model";

/**
 * The Theme view's toast row copy (handoff SPEC §5.4) and the Palette picker's words. Kept out of
 * `theme-view-model.ts`, which the command palette loads with the studio. Pure.
 */

/** A toast row's bold title and its sub-line (SPEC §4.4, §5.4). */
export interface ToastText {
  title: string;
  sub: string;
}

/** The toast after a theme is applied (SPEC §5.4); `kept` counts the fine-tune sections the level keeps. */
export function appliedToast(name: string, level: ThemeLevel, includeBackground: boolean, kept: number, screen: string): ToastText {
  const parts =
    level === "page"
      ? `Skin changed. ${pageParts(screen)}`
      : includeBackground
        ? "Palette, skin, corners and background changed."
        : "Palette, skin and corners changed. Background kept.";
  const keptText = kept > 0 ? ` ${kept} fine-tune ${kept === 1 ? "change" : "changes"} kept.` : "";
  return { title: `Applied ${name}.`, sub: `${parts}${keptText}` };
}

export const paletteToast = (name: string): ToastText => ({ title: `Palette changed to ${name}.`, sub: "Skin, corners, background and fine-tune kept." });

/** A page's skin: its palette, corners and background are its screen's (owner decision 1). */
export const skinToast = (name: string, level: ThemeLevel, screen: string): ToastText => ({
  title: `Skin changed to ${name}.`,
  sub: level === "page" ? `Fine-tune kept. ${pageParts(screen)}` : "Colors, corners, background and fine-tune kept.",
});

export const resetToast = (name: string, level: ThemeLevel, levelName: string, screen: string): ToastText => ({
  title: `Reset to ${name}.`,
  sub: level === "page" ? `Everything on ${levelName} now matches the theme. ${pageParts(screen)}` : `Everything on ${levelName} now matches the theme, including its background.`,
});

/** Saved a theme, or a palette: the sub-line says where its picker lists it. */
export const savedToast = (name: string, kind: "theme" | "palette"): ToastText => ({
  title: `Saved "${name}".`,
  sub: kind === "palette" ? "It's at the top of the picker under Yours." : "It's in Switch theme under saved themes.",
});

/** A saved palette's "used by" line: "Used by Desk look and All screens", or "Not in use". */
export const paletteUsedBy = (names: readonly string[]): string => (names.length === 0 ? "Not in use" : `Used by ${listText(names)}`);

/** The Palette picker's footer count: "6 built-in · 2 yours". */
export const paletteCounts = (builtin: number, yours: number): string => `${builtin} built-in · ${yours} yours`;
