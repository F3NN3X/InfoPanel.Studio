import type { Scene } from "./particles";

const rnd = Math.random;
const MAX_POINTS = 400;
const MAX_PATHS = 5;

/**
 * Fractal lightning and its flash: one bolt at a time in fixed buffers, a main path plus up to three
 * shorter branches, redrawn with a flicker while its life (in 60 fps frames) runs down. Visual only.
 */
export function createLightning(s: Scene) {
  const pts = new Float32Array(MAX_POINTS * 2);
  const starts = new Int16Array(MAX_PATHS + 1);
  let np = 0;
  let paths = 0;
  let life = 0;
  let flash = 0;
  let next = 0;

  const path = (x0: number, y0: number, bottom: number, spread: number, branch: boolean) => {
    if (paths >= MAX_PATHS) return;
    starts[paths] = np;
    let x = x0, y = y0, branches = 0;
    pts[np * 2] = x;
    pts[np * 2 + 1] = y;
    np++;
    while (y < bottom && np < MAX_POINTS - 1) {
      y += (rnd() * 40 + 20) * s.k;
      x += (rnd() - 0.5) * spread;
      pts[np * 2] = x;
      pts[np * 2 + 1] = y;
      np++;
      if (!branch && branches < 3 && rnd() < 0.12 && s.h - y > 150 * s.k) {
        branches++;
        // a branch is its own path, generated after the main one so the buffers stay contiguous
        pending.push([x, y, y + (rnd() * 250 + 100) * s.k]);
      }
    }
    paths++;
    starts[paths] = np;
  };
  // at most three entries per strike; emptied right after each one
  const pending: [number, number, number][] = [];

  const strike = () => {
    np = 0;
    paths = 0;
    pending.length = 0;
    path(rnd() * s.w, 0, s.h, 100 * s.k, false);
    for (const [x, y, bottom] of pending.splice(0)) path(x, y, bottom, 60 * s.k, true);
    life = 15 + rnd() * 10;
    flash = 0.6 + rnd() * 0.4;
  };

  const stroke = (ctx: CanvasRenderingContext2D, style: string, main: number, side: number) => {
    ctx.strokeStyle = style;
    for (let p = 0; p < paths; p++) {
      ctx.lineWidth = Math.max(0.5, (p === 0 ? main : side) * s.k);
      ctx.beginPath();
      for (let i = starts[p]; i < starts[p + 1]; i++) {
        if (i === starts[p]) ctx.moveTo(pts[i * 2], pts[i * 2 + 1]);
        else ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
      }
      ctx.stroke();
    }
  };

  return {
    /** Schedules the first strike a moment out. */
    arm(now: number) {
      next = now + 1500 + rnd() * 2500;
    },
    update(step: number, now: number, enabled: boolean) {
      if (enabled && now >= next) {
        strike();
        next = now + 6000 + rnd() * 8000;
      }
      if (life > 0) life -= step;
      if (flash > 0) flash = Math.max(0, flash - 0.05 * step);
    },
    draw(ctx: CanvasRenderingContext2D) {
      const base = ctx.globalAlpha;
      if (flash > 0) {
        ctx.globalAlpha = base * flash * 0.4;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, s.w, s.h);
      }
      if (life > 0 && rnd() <= 0.8) {
        ctx.globalAlpha = base * (life < 10 ? life / 10 : 1);
        stroke(ctx, "rgba(180, 210, 255, 0.3)", 8, 4);
        stroke(ctx, "rgba(230, 245, 255, 1)", 2.5, 1);
      }
      ctx.globalAlpha = base;
    },
  };
}
