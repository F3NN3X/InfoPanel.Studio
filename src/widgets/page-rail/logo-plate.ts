import { useEffect, useState, type RefObject } from "react";
import type { RailPlate } from "@/lib/pinned";
import { logoPlate, logoStats, luma } from "@/lib/rail";

/*
 * The logo's automatic plate (owner Q8): the image drawn small on a canvas, its pixels read against the lightness of the
 * rail's text colour (the computed `color` of the logo's button, which is `--w-fg`). The verdict is `logoPlate`'s
 * (src/lib/rail.ts). Where a canvas can't be read (no canvas, an image that won't load), the card plate stays.
 */

/** The side the image is read at, px: enough for its share of marks, cheap to read. */
const READ_AT = 32;

/** A CSS colour as RGB, read back from a canvas (any syntax the browser takes: rgb, oklch, a token's value). */
function rgbOf(ctx: CanvasRenderingContext2D, color: string): [number, number, number] {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** The plate for `img` on the rail around `el`, or undefined when it can't be read. */
export function measurePlate(img: HTMLImageElement, el: Element): RailPlate | undefined {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = READ_AT;
    canvas.height = READ_AT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;
    const [r, g, b] = rgbOf(ctx, getComputedStyle(el).color);
    ctx.clearRect(0, 0, READ_AT, READ_AT);
    // contained, as the logo is drawn (object-contain)
    const w = img.naturalWidth || READ_AT;
    const h = img.naturalHeight || READ_AT;
    const k = READ_AT / Math.max(w, h);
    ctx.drawImage(img, (READ_AT - w * k) / 2, (READ_AT - h * k) / 2, w * k, h * k);
    return logoPlate(logoStats(ctx.getImageData(0, 0, READ_AT, READ_AT).data, luma(r, g, b)));
  } catch {
    return undefined;
  }
}

/** The logo's plate: the user's, else chosen from the image once it loads (the card plate until then). */
export function useLogoPlate(src: string | undefined, own: RailPlate | undefined, ref: RefObject<Element | null>): RailPlate {
  const [auto, setAuto] = useState<RailPlate>("card");
  useEffect(() => {
    if (own || !src) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      const el = ref.current;
      const plate = alive && el ? measurePlate(img, el) : undefined;
      if (plate) setAuto(plate);
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src, own, ref]);
  return own ?? auto;
}
