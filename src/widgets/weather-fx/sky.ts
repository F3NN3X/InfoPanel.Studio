import cloud1 from "@/assets/weather-fx/clouds_1.png";
import cloud2 from "@/assets/weather-fx/clouds_2.png";
import cloud3 from "@/assets/weather-fx/clouds_3.png";
import { poolSize } from "./config";
import type { Scene } from "./particles";

const rnd = Math.random;

const sprite = (size: number, paint: (g: CanvasRenderingContext2D, m: number) => void): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (g) paint(g, size / 2);
  return c;
};

const glow = (g: CanvasRenderingContext2D, m: number, stops: [number, string][]) => {
  const grad = g.createRadialGradient(m, m, 0, m, m, m);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, m * 2, m * 2);
};

/** The sun: one pre-rendered warm glow, breathing slowly. */
export function createSun(s: Scene) {
  const tex = sprite(128, (g, m) => glow(g, m, [[0, "rgba(255, 238, 190, 0.95)"], [0.08, "rgba(255, 222, 150, 0.6)"], [0.35, "rgba(255, 200, 110, 0.18)"], [1, "rgba(255, 200, 110, 0)"]]));
  const r = Math.max(s.w, s.h) * 0.55;
  return {
    draw(ctx: CanvasRenderingContext2D, now: number, strength: number) {
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha *= strength * (0.88 + 0.12 * Math.sin(now / 2500));
      ctx.drawImage(tex, s.w * 0.78 - r, s.h * 0.22 - r, r * 2, r * 2);
      ctx.globalCompositeOperation = "source-over";
    },
    dispose: () => (tex.width = 0),
  };
}

/** The moon: a glowing crescent. */
export function createMoon(s: Scene) {
  const rad = Math.min(26, Math.max(8, Math.min(s.w, s.h) * 0.09));
  const tex = sprite(128, (g, m) => {
    glow(g, m, [[0, "rgba(220, 230, 255, 0.35)"], [0.4, "rgba(200, 215, 255, 0.1)"], [1, "rgba(200, 215, 255, 0)"]]);
    g.fillStyle = "rgb(244, 241, 228)";
    g.beginPath();
    g.arc(m, m, m * 0.28, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = "destination-out";
    g.beginPath();
    g.arc(m + m * 0.14, m - m * 0.06, m * 0.25, 0, Math.PI * 2);
    g.fill();
  });
  const size = rad / 0.14;
  return {
    draw(ctx: CanvasRenderingContext2D) {
      ctx.drawImage(tex, s.w * 0.78 - size / 2, s.h * 0.22 - size / 2, size, size);
    },
    dispose: () => (tex.width = 0),
  };
}

/** Twinkling stars. */
export function createStars(base: number, s: Scene) {
  const n = poolSize(base, s.area, 90);
  const x = new Float32Array(n), y = new Float32Array(n), phase = new Float32Array(n), size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = rnd() * s.w;
    y[i] = rnd() * s.h * 0.8;
    phase[i] = rnd() * Math.PI * 2;
    size[i] = rnd() < 0.2 ? 2 : 1;
  }
  return {
    draw(ctx: CanvasRenderingContext2D, now: number, strength: number) {
      const base = ctx.globalAlpha;
      const a = base * strength;
      ctx.fillStyle = "#fff";
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = a * (0.3 + 0.7 * Math.abs(Math.sin(now / 1400 + phase[i])));
        ctx.fillRect(x[i], y[i], size[i], size[i]);
      }
      ctx.globalAlpha = base;
    },
  };
}

/** Three drifting cloud layers, tiled from the PNG textures; each moves on the frame step like everything else. */
const CLOUDS = [
  { src: cloud2, y: 0, speed: 50, alpha: 0.35 },
  { src: cloud1, y: 0.12, speed: 66, alpha: 0.4 },
  { src: cloud3, y: 0.05, speed: 93, alpha: 0.3 },
];

export function createClouds(s: Scene) {
  const layers = CLOUDS.map((c) => {
    const img = new Image();
    img.src = c.src;
    return { ...c, img, off: 0 };
  });
  return {
    update(dtMs: number, wind: number, speed: number) {
      const dt = (dtMs / 1000) * speed * (1 + Math.abs(wind) * 0.15);
      for (const l of layers) l.off += l.speed * dt;
    },
    draw(ctx: CanvasRenderingContext2D, cover: number) {
      const base = ctx.globalAlpha;
      for (const l of layers) {
        const { img } = l;
        if (!img.complete || img.naturalWidth === 0) continue;
        const sc = Math.min(1, (s.h * 0.8) / img.naturalHeight);
        const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
        ctx.globalAlpha = base * cover * l.alpha;
        for (let x = -((l.off * sc) % w); x < s.w; x += w) ctx.drawImage(img, x, l.y * s.h, w, h);
      }
      ctx.globalAlpha = base;
    },
    dispose() {
      for (const l of layers) l.img.src = "";
    },
  };
}

/** Fog: a tint over the widget plus drifting soft puffs from one cached gradient. */
export function createFog(s: Scene) {
  const tex = sprite(128, (g, m) => glow(g, m, [[0, "rgba(225, 235, 240, 1)"], [0.4, "rgba(215, 225, 235, 0.8)"], [0.7, "rgba(205, 220, 235, 0.3)"], [1, "rgba(205, 220, 235, 0)"]]));
  const n = poolSize(10, s.area, 24);
  const x = new Float32Array(n), y = new Float32Array(n), rad = new Float32Array(n), v = new Float32Array(n), alpha = new Float32Array(n), phase = new Float32Array(n);
  const min = Math.min(s.w, s.h);
  for (let i = 0; i < n; i++) {
    const z = rnd();
    x[i] = rnd() * (s.w + 400) - 200;
    y[i] = rnd() * (s.h + 200) - 100;
    rad[i] = Math.min(min * (0.2 + z * 0.5), 400);
    v[i] = (0.2 + z * 0.5) * (rnd() > 0.5 ? 1 : -1);
    alpha[i] = 0.05 + rnd() * 0.12;
    phase[i] = rnd() * Math.PI * 2;
  }
  return {
    update(step: number, now: number, wind: number) {
      for (let i = 0; i < n; i++) {
        x[i] += (v[i] + wind * 3) * step;
        y[i] += Math.sin(now * 0.0008 + phase[i]) * 0.15 * step;
        const edge = rad[i] + 100;
        if (x[i] > s.w + edge) {
          x[i] = -edge;
          y[i] = rnd() * s.h;
        } else if (x[i] < -edge) {
          x[i] = s.w + edge;
          y[i] = rnd() * s.h;
        }
      }
    },
    draw(ctx: CanvasRenderingContext2D, density: number) {
      const base = ctx.globalAlpha;
      ctx.globalAlpha = base * density * 0.5;
      ctx.fillStyle = "rgb(180, 195, 210)";
      ctx.fillRect(0, 0, s.w, s.h);
      for (let i = 0; i < n; i++) {
        if (x[i] + rad[i] < 0 || x[i] - rad[i] > s.w || y[i] + rad[i] < 0 || y[i] - rad[i] > s.h) continue;
        ctx.globalAlpha = base * alpha[i] * (0.6 + density * 0.8);
        ctx.drawImage(tex, x[i] - rad[i], y[i] - rad[i], rad[i] * 2, rad[i] * 2);
      }
      ctx.globalAlpha = base;
    },
    dispose: () => (tex.width = 0),
  };
}
