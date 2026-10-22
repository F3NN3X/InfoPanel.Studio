import { poolSize, stepScale, type FxPlan } from "./config";
import { createLightning } from "./lightning";
import { createHail, createRain, createSnow, createSplash, createStreaks, hailSprites, sceneOf } from "./particles";
import { createClouds, createFog, createMoon, createStars, createSun } from "./sky";

/** The settings and readings the engine follows live, without a rebuild. */
export interface FxLive {
  /** Celsius. */
  temp: number;
  /** Sideways px per frame, positive = right. */
  wind: number;
  speed: number;
  intensity: number;
  /** Particle density multiplier, 1 = 100 %. */
  density: number;
  lightning: boolean;
  /** Clouds and fog. */
  clouds: boolean;
  /** How strongly it draws, 0-1. */
  opacity: number;
}

export interface FxEngine {
  /** Advances by `dtMs` and draws. */
  frame(dtMs: number, now: number, live: FxLive): void;
  /** Draws the sky layers once, without particles, for reduced motion. */
  still(live: FxLive): void;
  dispose(): void;
}

// Pools are allocated for the most the settings allow (intensity 2 x density 2), scaled to the area.
const HEADROOM = 4;

/** Builds the simulation for one condition on a w x h element; null where there is no 2D canvas (SSR, happy-dom). */
export function createFxEngine(canvas: HTMLCanvasElement, plan: FxPlan, w: number, h: number, dpr: number): FxEngine | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const s = sceneOf(w, h, dpr);
  const cap = (base: number, max: number) => poolSize(base * HEADROOM, s.area, max);
  const splash = createSplash(s);
  const rain = plan.rain > 0 ? createRain(cap(plan.rain, 1200), s, splash) : null;
  const snow = plan.snow > 0 ? createSnow(cap(plan.snow, 800), s) : null;
  const sprites = plan.hail > 0 ? hailSprites() : [];
  const hail = plan.hail > 0 ? createHail(cap(plan.hail, 150), s, sprites) : null;
  const streaks = plan.streaks > 0 ? createStreaks(cap(plan.streaks, 400), s) : null;
  const sun = plan.sun > 0 ? createSun(s) : null;
  const moon = plan.moon ? createMoon(s) : null;
  const stars = plan.stars > 0 ? createStars(plan.stars, s) : null;
  const clouds = plan.clouds > 0 ? createClouds(s) : null;
  const fog = plan.fog > 0 ? createFog(s) : null;
  const bolt = plan.lightning ? createLightning(s) : null;
  bolt?.arm(performance.now());

  const sky = (now: number, live: FxLive) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = live.opacity;
    const power = Math.min(1, live.intensity);
    sun?.draw(ctx, now, plan.sun * power);
    moon?.draw(ctx);
    stars?.draw(ctx, now, power);
    if (live.clouds) {
      clouds?.draw(ctx, Math.min(1, plan.clouds * live.intensity));
      fog?.draw(ctx, Math.min(1, plan.fog * live.intensity));
    }
  };

  return {
    frame(dtMs, now, live) {
      const step = stepScale(dtMs);
      const amount = (base: number) => poolSize(base * live.intensity * live.density, s.area);
      clouds?.update(step * (1000 / 60), live.wind, live.speed);
      fog?.update(step, now, live.wind);
      sky(now, live);
      const dir = live.wind < 0 ? -1 : 1;
      if (streaks) {
        streaks.setCount(amount(plan.streaks));
        streaks.update(step, dir, live.speed * (1 + Math.abs(live.wind) * 0.3));
        streaks.draw(ctx, dir);
      }
      if (rain) {
        rain.setCount(amount(plan.rain));
        rain.update(step, live.wind, live.speed * (hail ? 0.6 : 1));
        rain.draw(ctx, live.wind);
        splash.update(step);
        splash.draw(ctx);
      }
      if (hail) {
        hail.setCount(amount(plan.hail));
        hail.update(step, live.wind, live.speed);
        hail.draw(ctx);
      }
      if (snow) {
        snow.setCount(amount(plan.snow));
        snow.update(step, live.wind, live.speed, live.temp);
        snow.draw(ctx, live.temp);
      }
      if (bolt) {
        bolt.update(step, now, live.lightning);
        bolt.draw(ctx);
      }
      ctx.globalAlpha = 1;
    },
    still(live) {
      sky(performance.now(), live);
      ctx.globalAlpha = 1;
    },
    dispose() {
      sun?.dispose();
      moon?.dispose();
      clouds?.dispose();
      fog?.dispose();
      for (const t of sprites) t.width = 0;
      canvas.width = 0;
    },
  };
}
