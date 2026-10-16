/**
 * InfoPanel colours (`SKColor.TryParse`) as CSS. Skia reads `#RGB`, `#ARGB`,
 * `#RRGGBB` and `#AARRGGBB`, with or without the `#`; alpha comes first.
 */
const HEX = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** `rgba()` for an InfoPanel colour, or null when Skia would not parse it. */
export function cssColor(value: string | null | undefined): string | null {
  const m = HEX.exec((value ?? "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  if (h.length === 6) h = "ff" + h;
  const [a, r, g, b] = [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16));
  return a === 255 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${+(a / 255).toFixed(4)})`;
}
