// Cover-art tint: a Vibrant-style palette sampled from the art (moved from the legacy now-playing widget).
import { useEffect, useState } from "react";
import { usePreview } from "@/hooks/use-preview";
import { darken, lighten, type ArtTint, type RGB } from "@/components/surfaces";
import { IMAGE_PROXY_URL } from "@/lib/dashboard-server";

const rgbToHsl = (
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
};

const hslToRgb = (h: number, s: number, l: number): RGB => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
};

/**
 * Vibrant-style palette from the art's pixels: the hue bin whose pixels
 * carry the most saturation-weighted mass becomes the accent. Near-gray art
 * (no saturated mass) returns null, so the surface stays untinted rather
 * than muddy.
 */
export function computeArtTint(data: Uint8ClampedArray): ArtTint | null {
  const bins = 36;
  const weight = new Float64Array(bins);
  const hSum = new Float64Array(bins);
  const sSum = new Float64Array(bins);
  const lSum = new Float64Array(bins);
  let saturatedMass = 0;
  let pixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    pixels += 1;
    const { h, s, l } = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (s < 0.12) continue;
    const bin = Math.min(bins - 1, Math.floor(h / (360 / bins)));
    const w = s * s * (1 - Math.abs(l - 0.5));
    weight[bin] += w;
    hSum[bin] += w * h;
    sSum[bin] += w * s;
    lSum[bin] += w * l;
    saturatedMass += w;
  }
  if (pixels === 0 || saturatedMass < 0.02 * pixels) return null;
  let best = 0;
  for (let b = 1; b < bins; b += 1) if (weight[b] > weight[best]) best = b;
  if (weight[best] <= 0) return null;
  const h = hSum[best] / weight[best];
  const s = Math.max(0.45, sSum[best] / weight[best]);
  const l = Math.min(0.62, Math.max(0.38, lSum[best] / weight[best]));
  const vibrant = hslToRgb(h, s, l);
  return {
    vibrant,
    light: lighten(vibrant, 0.74),
    dark: darken(vibrant, 0.72),
  };
}

const loadImageFrom = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });

/** A root-relative path or a URL on this page's origin. */
export function isSameOrigin(url: string, origin = globalThis.location?.origin): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  if (url.startsWith("data:") || url.startsWith("blob:")) return true;
  try {
    return origin !== undefined && new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/**
 * Load the cover art for pixel sampling. The local cover-art server sends no
 * CORS headers, so a direct cross-origin load taints the canvas and
 * `getImageData` throws. First fetch the bytes through the dashboard server's
 * same-origin image proxy (blob URLs stay untainted); when the server is
 * offline, fall back to a direct load (it works for same-origin or
 * CORS-enabled art, and degrades to no tint otherwise).
 */
async function loadTintableImage(url: string): Promise<HTMLImageElement | null> {
  // The dashboard's own assets are same-origin: no proxy needed (it rejects relative URLs).
  if (isSameOrigin(url)) return loadImageFrom(url).catch(() => null);
  try {
    const res = await fetch(
      `${IMAGE_PROXY_URL}?url=${encodeURIComponent(url)}`
    );
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0) {
        const objectUrl = URL.createObjectURL(blob);
        try {
          return await loadImageFrom(objectUrl);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }
    }
  } catch {
    /* dashboard server offline — fall through to the direct load */
  }
  try {
    return await loadImageFrom(url);
  } catch {
    return null;
  }
}

/**
 * Vibrant-style cover-art palette (the `vibrant` accent + light/dark base
 * roles), sampled through the dashboard server's image proxy. Art the proxy cannot
 * fetch (and that is not same-origin/CORS itself), or near-gray art with no
 * saturated accent, yields null — the surface then stays untinted.
 */
export function useArtTint(url: string | undefined, enabled: boolean): ArtTint | null {
  const [tint, setTint] = useState<ArtTint | null>(null);
  // A thumbnail does not fetch the art: the default colour.
  const preview = usePreview();
  useEffect(() => {
    setTint(null);
    if (!url || !enabled || preview) return;
    let cancelled = false;
    void (async () => {
      const img = await loadTintableImage(url);
      if (!img || cancelled) return;
      try {
        const n = 16;
        const canvas = document.createElement("canvas");
        canvas.width = n;
        canvas.height = n;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, n, n);
        let data: Uint8ClampedArray;
        try {
          data = ctx.getImageData(0, 0, n, n).data;
        } catch {
          return; // tainted canvas (direct cross-origin load): no tint
        }
        const palette = computeArtTint(data);
        if (!cancelled) setTint(palette);
      } catch {
        /* sampling failed: no tint */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, enabled, preview]);
  return tint;
}
