/**
 * What the Library reads from an image's pixels at upload (spec §3, Smart behaviours): mean and
 * median luminance, the dominant hues, transparency, detail (edge density) and a perceptual hash
 * for "looks identical". Pure: the pixels come from `decode.ts`, sampled small (64 px).
 */

export interface PixelStats {
  /** 0–1, mean relative luminance. */
  luminance: number;
  /** 0–1, median relative luminance (the theme suggestion's contrast reads this). */
  median: number;
  /** Up to two hue names, most frequent first, from the saturated pixels. */
  hues: string[];
  /** The colourful pixels' mean hue in degrees (a circular mean), null for a neutral image. */
  hue: number | null;
  /** 0–1 share of saturated pixels: low means a neutral image. */
  colourful: number;
  /** Some pixel is less than fully opaque. */
  alpha: boolean;
  /** 0–1, mean gradient strength: low detail reads well behind text. */
  edges: number;
}

/** RGBA pixels, row by row. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of an sRGB colour (0–255 channels). */
export const relLuminance = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** Hue (0–360) and saturation (0–1, HSL) of an sRGB colour. */
export function hueSat(r: number, g: number, b: number): { hue: number; sat: number; light: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const light = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { hue: 0, sat: 0, light };
  const sat = d / (1 - Math.abs(2 * light - 1));
  const hue = max === R ? ((G - B) / d + 6) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { hue: hue * 60, sat, light };
}

/** Hue names by the start of their range (degrees). */
const HUES: [number, string][] = [
  [0, "Red"],
  [15, "Orange"],
  [45, "Yellow"],
  [70, "Green"],
  [160, "Teal"],
  [190, "Blue"],
  [255, "Purple"],
  [290, "Pink"],
  [340, "Red"],
];

export function hueName(hue: number): string {
  const h = ((hue % 360) + 360) % 360;
  let name = HUES[0][1];
  for (const [start, n] of HUES) if (h >= start) name = n;
  return name;
}

/** Saturated enough to count as a colour, and neither near black nor near white. */
const colourful = (sat: number, light: number) => sat >= 0.25 && light >= 0.12 && light <= 0.9;

export function pixelStats({ width, height, data }: Pixels): PixelStats {
  const n = width * height;
  if (n === 0) return { luminance: 0, median: 0, hues: [], hue: null, colourful: 0, alpha: false, edges: 0 };
  const lum = new Float64Array(n);
  const counts = new Map<string, number>();
  let sum = 0;
  let alpha = false;
  let coloured = 0;
  let hx = 0;
  let hy = 0;
  for (let i = 0; i < n; i++) {
    const [r, g, b, a] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]];
    if (a < 250) alpha = true;
    // A transparent pixel shows what is behind it: weigh it by its opacity.
    const l = relLuminance(r, g, b) * (a / 255);
    lum[i] = l;
    sum += l;
    if (a < 128) continue;
    const { hue, sat, light } = hueSat(r, g, b);
    if (colourful(sat, light)) {
      coloured++;
      hx += Math.cos((hue * Math.PI) / 180);
      hy += Math.sin((hue * Math.PI) / 180);
      const name = hueName(hue);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const sorted = Float64Array.from(lum).sort();
  const hues = [...counts]
    .sort((a, b) => b[1] - a[1])
    .filter(([, c], i) => i === 0 || c >= coloured * 0.25)
    .slice(0, 2)
    .map(([name]) => name);
  let edge = 0;
  let pairs = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x + 1 < width) {
        edge += Math.abs(lum[i] - lum[i + 1]);
        pairs++;
      }
      if (y + 1 < height) {
        edge += Math.abs(lum[i] - lum[i + width]);
        pairs++;
      }
    }
  }
  return {
    luminance: sum / n,
    median: sorted[Math.floor(n / 2)],
    hues: coloured >= n * 0.05 ? hues : [],
    hue: coloured >= n * 0.05 ? (((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360) : null,
    colourful: coloured / n,
    alpha,
    edges: pairs ? Math.min(1, (edge / pairs) * 4) : 0,
  };
}

/**
 * A 64-bit difference hash (dHash) as 16 hex digits: the image at 9 × 8 grey, one bit per
 * left-right step. Two images "look identical" within a Hamming distance of 4.
 */
export function dHash(px: Pixels): string {
  const grey = (x: number, y: number) => {
    // Box-sample the source into a 9 × 8 grid.
    const x0 = Math.floor((x * px.width) / 9);
    const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * px.width) / 9));
    const y0 = Math.floor((y * px.height) / 8);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * px.height) / 8));
    let s = 0;
    let c = 0;
    for (let yy = y0; yy < Math.min(y1, px.height); yy++) {
      for (let xx = x0; xx < Math.min(x1, px.width); xx++) {
        const i = (yy * px.width + xx) * 4;
        s += (px.data[i] * 299 + px.data[i + 1] * 587 + px.data[i + 2] * 114) / 1000;
        c++;
      }
    }
    return c ? s / c : 0;
  };
  let hex = "";
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (grey(x, y) > grey(x + 1, y) ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Bits that differ between two hashes of the same length (Infinity when they can't compare). */
export function hamming(a: string, b: string): number {
  if (a.length !== b.length || !a) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** Shape tag from the aspect ratio. */
export function aspectTag(width: number, height: number): "Wide" | "Tall" | "Square" | null {
  if (!(width > 0 && height > 0)) return null;
  const r = width / height;
  return r >= 1.2 ? "Wide" : r <= 1 / 1.2 ? "Tall" : "Square";
}
