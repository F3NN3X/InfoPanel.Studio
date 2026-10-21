/** A CSS cubic-bezier(x1, y1, x2, y2) timing function as t (0..1) → eased value. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const axis = (a: number, b: number, s: number) => ((1 - 3 * b + 3 * a) * s + (3 * b - 6 * a)) * s * s + 3 * a * s;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Solve x(s) = t by bisection; 20 steps is well under a pixel of any animation here.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (axis(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return axis(y1, y2, (lo + hi) / 2);
  };
}

export const easeInOut = cubicBezier(0.42, 0, 0.58, 1);
export const easeOut = cubicBezier(0, 0, 0.58, 1);

/** 0..1..0 over `durationMs` per leg, eased: a CSS `direction: alternate` at elapsed `ms`. */
export function alternate(ms: number, durationMs: number, ease: (t: number) => number = easeInOut): number {
  const leg = (ms / durationMs) % 2;
  return ease(leg <= 1 ? leg : 2 - leg);
}
