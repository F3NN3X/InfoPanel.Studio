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
