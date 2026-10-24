/**
 * The studio's look for new items (the Add palette), derived from the profile instead of
 * InfoPanel's raw constructor defaults: text in the profile's colour, charts on a muted track
 * with one accent fill and no frame, shapes as a rounded card a little off the background.
 * Every value is an ordinary InfoPanel field, so the export carries it as it is.
 */
import type { Profile } from "../schema.ts";

/** The accent new charts, rings and gauges fill with: the Gauges page's default blue. */
export const ACCENT = "#FF3B82F6";

/** InfoPanel's colour forms (#RGB, #ARGB, #RRGGBB, #AARRGGBB) as [a, r, g, b]; black when unreadable. */
function argb(color: string): [number, number, number, number] {
  let h = color.replace(/^#/, "");
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  if (h.length === 6) h = "FF" + h;
  if (!/^[0-9a-f]{8}$/i.test(h)) return [255, 0, 0, 0];
  return [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number, number];
}

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0").toUpperCase();

/** `from` moved `t` (0–1) of the way to `to`, opaque, as #AARRGGBB. */
export function mix(from: string, to: string, t: number): string {
  const [, r1, g1, b1] = argb(from);
  const [, r2, g2, b2] = argb(to);
  return "#FF" + [r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t].map(hex2).join("");
}

/** A colour with its alpha replaced (0–1), as #AARRGGBB. */
export function withAlpha(color: string, alpha: number): string {
  const [, r, g, b] = argb(color);
  return "#" + [alpha * 255, r, g, b].map(hex2).join("");
}

export interface Look {
  /** Text and values. */
  text: string;
  accent: string;
  /** A chart's track: the background moved a little toward the text colour. */
  track: string;
  /** A card shape: the background moved a touch toward the text colour (lighter on a dark profile). */
  card: string;
}

export function lookOf(profile: Pick<Profile, "BackgroundColor" | "Color">): Look {
  return {
    text: profile.Color,
    accent: ACCENT,
    track: mix(profile.BackgroundColor, profile.Color, 0.14),
    card: mix(profile.BackgroundColor, profile.Color, 0.07),
  };
}
