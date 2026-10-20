/**
 * InfoPanel's marquee (PanelDraw.DrawMarqueeText): content wider than its box
 * scrolls left at `speed` px/s, followed by a second copy `spacing` px behind,
 * so the loop repeats every `contentWidth + spacing` px.
 */

/** Marquee speed and spacing when a widget sets none: InfoPanel's defaults. */
export const MARQUEE_SPEED = 50;
export const MARQUEE_SPACING = 40;

/**
 * The track's translateX (px, 0 or less) after `elapsedMs` of scrolling. From elapsed real time, not
 * a tick count, so a lower frame rate steps further per frame at the same speed.
 */
export function marqueeOffset(elapsedMs: number, speed: number, contentWidth: number, spacing: number): number {
  const period = contentWidth + spacing;
  if (!(period > 0) || !(speed > 0) || !(elapsedMs > 0)) return 0;
  const offset = -(((elapsedMs / 1000) * speed) % period);
  return offset === 0 ? 0 : offset;
}
