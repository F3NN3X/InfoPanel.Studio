import type { ThemeTokens } from "@/lib/theme";

export type TokenRow = [keyof ThemeTokens, string];

/** Tokens with an editor row; the first six are always shown (DECISIONS.md #8), the rest are Advanced. */
export const VISIBLE_TOKENS: TokenRow[] = [
  ["primary", "Primary"],
  ["accent", "Accent"],
  ["background", "Background"],
  ["foreground", "Foreground"],
  ["card", "Card"],
  ["card-foreground", "Card text"],
];

export const ADVANCED_TOKENS: TokenRow[] = [
  ["primary-foreground", "Primary text"],
  ["secondary", "Secondary"],
  ["muted", "Muted"],
  ["muted-foreground", "Muted text"],
  ["destructive", "Destructive"],
  ["border", "Border"],
  ["ring", "Ring"],
];

/** All 19 tokens in the theme's own order (Colors › More, handoff SPEC §4.3.2). */
export const ALL_TOKENS: TokenRow[] = [
  ["background", "Background"],
  ["foreground", "Foreground"],
  ["card", "Card"],
  ["card-foreground", "Card text"],
  ["popover", "Popover"],
  ["popover-foreground", "Popover text"],
  ["primary", "Primary"],
  ["primary-foreground", "Primary text"],
  ["secondary", "Secondary"],
  ["secondary-foreground", "Secondary text"],
  ["muted", "Muted"],
  ["muted-foreground", "Muted text"],
  ["accent", "Accent"],
  ["accent-foreground", "Accent text"],
  ["destructive", "Destructive"],
  ["destructive-foreground", "Destructive text"],
  ["border", "Border"],
  ["input", "Input"],
  ["ring", "Ring"],
];
