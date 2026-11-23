import { backgroundLayers, posterBackground, type PageBackground } from "@/lib/appearance";
import type { ThemeTokens } from "@/lib/theme";

/** A palette at thumbnail size: its page, a card on it and the primary colour. */
export function PaletteSwatch({ tokens, accent }: { tokens: ThemeTokens; accent?: string }) {
  const c = (key: keyof ThemeTokens) => `hsl(${tokens[key]})`;
  return (
    <div className="flex h-full items-end gap-0.75 p-1.25" style={{ background: c("background") }}>
      <span className="h-2.5 w-2.5 rounded-3" style={{ background: accent ?? c("primary") }} />
      <span className="h-2.5 w-2.5 rounded-3 border" style={{ background: c("card"), borderColor: c("border") }} />
    </div>
  );
}

/** The five palette swatches of the Palette row: page, card, border, text and accent. */
export function TokenSwatches({ tokens }: { tokens: ThemeTokens }) {
  const keys: (keyof ThemeTokens)[] = ["background", "card", "border", "foreground", "primary"];
  return (
    <span className="flex shrink-0 gap-0.75" aria-hidden>
      {keys.map((k) => (
        <span key={k} className="h-3.5 w-3.5 rounded-3 border border-white/10" style={{ background: `hsl(${tokens[k]})` }} />
      ))}
    </span>
  );
}

/** A background at swatch size (a video as its poster); none shows the palette's page color. */
export function BackgroundSwatch({ bg, tokens, className }: { bg: PageBackground | undefined; tokens: ThemeTokens; className?: string }) {
  const layers = bg && bg.type !== "none" ? backgroundLayers(bg.type === "video" ? posterBackground(bg) : bg) : undefined;
  return (
    <span className={className ?? "relative block h-4 w-7 shrink-0 overflow-hidden rounded-3 border border-white/10"} style={layers?.fill ?? { background: `hsl(${tokens.background})` }} aria-hidden>
      {layers?.media && <span className="absolute inset-0" style={{ ...layers.media, filter: undefined, inset: 0 }} />}
      {layers?.overlay && <span className="absolute inset-0" style={layers.overlay} />}
    </span>
  );
}
