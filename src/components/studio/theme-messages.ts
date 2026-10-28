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

/** What a theme pick did at a level, for its toast. */
export interface AppliedOutcome {
  /** The level had no snapshot, so the pick replaced its look. */
  replaced: boolean;
  /** The theme's background came with it. */
  background: boolean;
  /** The fine-tune sections the level keeps. */
  kept: number;
  /** The widgets that keep their own look where the theme sets one. */
  widgets: number;
}

const REPLACED: Record<ThemeLevel, string> = { screen: "Replaced this screen's look", page: "Replaced this page's look" };

/** The toast after a theme is applied (SPEC §5.4). */
export function appliedToast(name: string, level: ThemeLevel, outcome: AppliedOutcome, screen: string): ToastText {
  const { replaced, background, kept, widgets } = outcome;
  const parts =
    level === "page"
      ? `${replaced ? `${REPLACED.page}.` : "Skin changed."} ${pageParts(screen)}`
      : replaced
        ? `${REPLACED[level]}${background ? ", background included." : ". Background kept."}`
        : background
          ? "Palette, skin, corners and background changed."
          : "Palette, skin and corners changed. Background kept.";
  const keptText = kept > 0 ? ` ${kept} fine-tune ${kept === 1 ? "change" : "changes"} kept.` : "";
  const widgetText = widgets > 0 ? ` ${widgets} ${widgets === 1 ? "widget keeps its" : "widgets keep their"} own look.` : "";
  return { title: `Applied ${name}.`, sub: `${parts}${keptText}${widgetText}` };
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

/** A saved palette's "used by" line: "Used by Desk look and MyDefault", or "Not in use". */
export const paletteUsedBy = (names: readonly string[]): string => (names.length === 0 ? "Not in use" : `Used by ${listText(names)}`);

/** The Palette picker's footer count: "6 built-in · 2 yours". */
export const paletteCounts = (builtin: number, yours: number): string => `${builtin} built-in · ${yours} yours`;
