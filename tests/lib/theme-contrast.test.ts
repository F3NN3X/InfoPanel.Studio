import { describe, expect, it } from "vitest";
import { TEMPLATE_PRESETS } from "@/lib/screen-templates/template-presets";
import { THEME_PRESETS, type ThemeTokens } from "@/lib/theme";

/** "210 40% 98%" (a theme token) to a WCAG relative luminance. */
function luminance(triplet: string): number {
  const [h, s, l] = triplet.split(/[\s%]+/).filter(Boolean).map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The text pairs a widget draws: card text on the card, secondary text on the page and on its chips. */
function failures(name: string, t: ThemeTokens): string[] {
  const pairs: [string, string, string][] = [
    ["card-foreground", "card", "card text on card"],
    ["muted-foreground", "background", "muted text on page"],
    ["muted-foreground", "muted", "muted text on chip"],
  ];
  return pairs.flatMap(([fg, bg, what]) => {
    const ratio = contrast(t[fg as keyof ThemeTokens], t[bg as keyof ThemeTokens]);
    return ratio < 4.5 ? [`${name}: ${what} ${ratio.toFixed(2)}`] : [];
  });
}

describe("built-in theme contrast", () => {
  it("every theme preset keeps its text at 4.5:1", () => {
    expect(THEME_PRESETS.flatMap((p) => failures(p.name, p.tokens))).toEqual([]);
  });

  it("every template palette keeps its text at 4.5:1", () => {
    const own = TEMPLATE_PRESETS.filter((p): p is typeof p & { theme: ThemeTokens } => typeof p.theme !== "string");
    expect(own.flatMap((p) => failures(p.id, p.theme))).toEqual([]);
  });
});
