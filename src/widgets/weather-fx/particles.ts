import { poolSize } from "./config";

/** The element being drawn on: CSS px size, the device pixel ratio, the ground line, a size scale and the area. */
export interface Scene {
  w: number;
  h: number;
  dpr: number;
  ground: number;
  /** Speeds, lengths and sizes tuned for a full screen shrink with the element (0.4-1). */
  k: number;
  area: number;
}

export const sceneOf = (w: number, h: number, dpr: number): Scene => ({ w, h, dpr, ground: h - 2, k: Math.min(1, Math.max(0.4, h / 700)), area: w * h });

const rnd = Math.random;

/** Short-lived splash dots where drops land. Fixed pool, swap-and-pop removal. */
export function createSplash(s: Scene) {
  const cap = poolSize(256, s.area, 256);
  const x = new Float32Array(cap), y = new Float32Array(cap), vx = new Float32Array(cap), vy = new Float32Array(cap), life = new Float32Array(cap);
  let n = 0;
  return {
    spawn(sx: number, sy: number) {
      if (n >= cap) return;
      x[n] = sx;
      y[n] = sy;
      vx[n] = (rnd() - 0.5) * 4;
      vy[n] = -(rnd() * 3 + 2) * s.k;
      life[n++] = 1;
    },
    update(step: number) {
      for (let i = 0; i < n; ) {
        vy[i] += 0.2 * step;
        x[i] += vx[i] * step;
        y[i] += vy[i] * step;
        life[i] -= 0.05 * step;
        if (life[i] <= 0) {
          n--;
          x[i] = x[n];
          y[i] = y[n];
          vx[i] = vx[n];
          vy[i] = vy[n];
          life[i] = life[n];
        } else i++;
      }
    },
    draw(ctx: CanvasRenderingContext2D) {
      if (n === 0) return;
      ctx.fillStyle = "rgba(200, 220, 255, 0.6)";
      ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.rect(x[i] - 1, y[i] - 1, 2, 2);
      ctx.fill();
    },
    /** Whether a drop may splash now (keeps the pool from saturating). */
    room: () => n < cap - 8,
  };
}
export type Splash = ReturnType<typeof createSplash>;

// Three opacity bins, one fill each; a drop's bin is its index modulo 3.
const RAIN_FILLS = ["rgba(180, 200, 235, 0.1)", "rgba(180, 200, 235, 0.28)", "rgba(180, 200, 235, 0.48)"];

/** Rain: tapered streaks falling at slightly different speeds, splashing on the ground. */
export function createRain(cap: number, s: Scene, splash: Splash) {
  const x = new Float32Array(cap), y = new Float32Array(cap), v = new Float32Array(cap), len = new Float32Array(cap);
  let n = 0;
  const spawn = (i: number, anywhere: boolean) => {
    x[i] = rnd() * (s.w + 200) - 100;
    y[i] = anywhere ? rnd() * s.h : -len[i];
  };
  return {
    setCount(target: number) {
      const t = Math.min(target, cap);
      while (n < t) {
        v[n] = (rnd() * 15 + 15) * s.k;
        len[n] = (rnd() * 20 + 20) * s.k;
        spawn(n++, true);
      }
      n = t;
    },
    update(step: number, wind: number, speed: number) {
      for (let i = 0; i < n; i++) {
        y[i] += v[i] * speed * step;
        x[i] += wind * step;
        if (y[i] > s.ground) {
          if (splash.room()) {
            splash.spawn(x[i], s.ground);
            if (rnd() < 0.5) splash.spawn(x[i], s.ground);
          }
          spawn(i, false);
        } else if (x[i] > s.w + 100 || x[i] < -100) spawn(i, false);
      }
    },
    draw(ctx: CanvasRenderingContext2D, wind: number) {
      const off = wind * 2;
      for (let b = 0; b < 3; b++) {
        ctx.fillStyle = RAIN_FILLS[b];
        ctx.beginPath();
        for (let i = b; i < n; i += 3) {
          const by = y[i] + len[i];
          ctx.moveTo(x[i] - 0.3, y[i]);
          ctx.lineTo(x[i] + 0.3, y[i]);
          ctx.lineTo(x[i] + off + 1.2, by);
          ctx.lineTo(x[i] + off - 1.2, by);
        }
        ctx.fill();
      }
    },
  };
}

const SNOW_FILLS = ["rgba(255, 255, 255, 0.35)", "rgba(255, 255, 255, 0.6)", "rgba(255, 255, 255, 0.85)"];

/** Snowfall plus a pile along the ground that melts faster above 0 °C. */
export function createSnow(cap: number, s: Scene) {
  const x = new Float32Array(cap), y = new Float32Array(cap), r = new Float32Array(cap), v = new Float32Array(cap), drift = new Float32Array(cap), angle = new Float32Array(cap);
  let n = 0;
  const reset = (i: number) => {
    y[i] = -10;
    x[i] = rnd() * s.w;
  };
  const pileCap = poolSize(500, s.area, 500);
  const px = new Float32Array(pileCap), psize = new Float32Array(pileCap), plife = new Float32Array(pileCap);
  let pn = 0;
  let head = 0;
  const addPile = (at: number) => {
    const i = pn < pileCap ? pn++ : head++ % pileCap;
    px[i] = at;
    psize[i] = (rnd() * 4 + 3) * s.k;
    plife[i] = 1;
  };
  return {
    setCount(target: number) {
      const t = Math.min(target, cap);
      while (n < t) {
        r[n] = (rnd() * 3 + 1) * s.k;
        v[n] = (rnd() * 1.5 + 0.5) * s.k;
        drift[n] = (rnd() - 0.5) * 0.5;
        angle[n] = rnd() * Math.PI * 2;
        x[n] = rnd() * s.w;
        y[n++] = rnd() * s.h;
      }
      n = t;
    },
    update(step: number, wind: number, speed: number, temp: number) {
      for (let i = 0; i < n; i++) {
        y[i] += v[i] * speed * step;
        x[i] += (drift[i] + wind + Math.sin(angle[i]) * 0.5) * step;
        angle[i] += 0.05 * step;
        if (y[i] > s.ground) {
          addPile(x[i]);
          reset(i);
        } else if (x[i] > s.w + 20 || x[i] < -20) {
          x[i] = x[i] < 0 ? s.w + 10 : -10;
        }
      }
      const melt = (temp > 0 ? 0.002 + temp * 0.002 : 0.0001) * step;
      for (let i = 0; i < pn; ) {
        plife[i] -= melt;
        if (plife[i] <= 0) {
          pn--;
          px[i] = px[pn];
          psize[i] = psize[pn];
          plife[i] = plife[pn];
          if (head > pn) head = 0;
        } else i++;
      }
    },
    draw(ctx: CanvasRenderingContext2D, temp: number) {
      for (let b = 0; b < 3; b++) {
        ctx.fillStyle = SNOW_FILLS[b];
        ctx.beginPath();
        for (let i = b; i < n; i += 3) {
          ctx.moveTo(x[i] + r[i], y[i]);
          ctx.arc(x[i], y[i], r[i], 0, Math.PI * 2);
        }
        ctx.fill();
      }
      if (pn === 0) return;
      ctx.fillStyle = temp <= -5 ? "rgba(200, 235, 255, 0.95)" : "rgba(255, 255, 255, 0.9)";
      ctx.beginPath();
      for (let i = 0; i < pn; i++) {
        ctx.moveTo(px[i] - psize[i] * plife[i], s.ground + 2);
        ctx.arc(px[i], s.ground + 2, psize[i] * plife[i], Math.PI, 0);
      }
      ctx.fill();
    },
  };
}

const HAIL_TEX = 4;
const HAIL_BASE = 8;

/** Pre-rendered ice-stone sprites, so no gradient is built per frame. */
export function hailSprites(): HTMLCanvasElement[] {
  return Array.from({ length: HAIL_TEX }, (_, t) => {
    const size = HAIL_BASE + t * 3;
    const c = document.createElement("canvas");
    c.width = c.height = size * 2 + 4;
    const g = c.getContext("2d");
    if (!g) return c;
    const m = c.width / 2;
    g.beginPath();
    for (let v = 0; v < 6; v++) {
      const a = (v / 6) * Math.PI * 2;
      const rad = size * (0.7 + rnd() * 0.3);
      if (v === 0) g.moveTo(m + Math.cos(a) * rad, m + Math.sin(a) * rad);
      else g.lineTo(m + Math.cos(a) * rad, m + Math.sin(a) * rad);
    }
    g.closePath();
    const grad = g.createRadialGradient(m - size * 0.2, m - size * 0.2, size * 0.1, m, m, size);
    grad.addColorStop(0, "rgba(240, 248, 255, 0.85)");
    grad.addColorStop(0.4, "rgba(200, 220, 245, 0.65)");
    grad.addColorStop(1, "rgba(160, 190, 220, 0.35)");
    g.fillStyle = grad;
    g.fill();
    g.beginPath();
    g.ellipse(m - size * 0.15, m - size * 0.2, size * 0.25, size * 0.15, -0.3, 0, Math.PI * 2);
    g.fillStyle = "rgba(255, 255, 255, 0.5)";
    g.fill();
    return c;
  });
}

/** Hail stones that accelerate, tumble and shatter into fragments on the ground. */
export function createHail(cap: number, s: Scene, sprites: HTMLCanvasElement[]) {
  const x = new Float32Array(cap), y = new Float32Array(cap), v = new Float32Array(cap), size = new Float32Array(cap), rot = new Float32Array(cap), rotV = new Float32Array(cap), tex = new Uint8Array(cap);
  let n = 0;
  const init = (i: number, anywhere: boolean) => {
    x[i] = rnd() * (s.w + 200) - 100;
    y[i] = anywhere ? rnd() * s.h : -(rnd() * 300 + 20) * s.k;
    v[i] = (rnd() * 6 + 14) * s.k;
    size[i] = (rnd() * 5 + 4) * s.k;
    rot[i] = rnd() * Math.PI * 2;
    rotV[i] = (rnd() - 0.5) * 0.08;
    tex[i] = Math.floor(rnd() * HAIL_TEX);
  };
  const bcap = poolSize(120, s.area, 120);
  const bx = new Float32Array(bcap), by = new Float32Array(bcap), bvx = new Float32Array(bcap), bvy = new Float32Array(bcap), blife = new Float32Array(bcap), bsize = new Float32Array(bcap);
  let bn = 0;
  const shatter = (sx: number, parent: number) => {
    for (let f = Math.floor(rnd() * 3) + 2; f > 0 && bn < bcap; f--) {
      bx[bn] = sx + (rnd() - 0.5) * parent;
      by[bn] = s.ground;
      bvx[bn] = (rnd() - 0.5) * 8;
      bvy[bn] = -(rnd() * 6 + 3) * s.k;
      blife[bn] = 1;
      bsize[bn++] = parent * (rnd() * 0.35 + 0.15);
    }
  };
  return {
    setCount(target: number) {
      const t = Math.min(target, cap);
      while (n < t) init(n++, true);
      n = t;
    },
    update(step: number, wind: number, speed: number) {
      for (let i = 0; i < n; i++) {
        v[i] += 0.18 * step;
        y[i] += v[i] * speed * step;
        x[i] += wind * 0.3 * step;
        rot[i] += rotV[i] * speed * step;
        if (y[i] > s.ground) {
          shatter(x[i], size[i]);
          init(i, false);
        }
      }
      for (let i = 0; i < bn; ) {
        bvy[i] += 0.3 * step;
        bx[i] += bvx[i] * step;
        by[i] += bvy[i] * step;
        blife[i] -= 0.04 * step;
        if (blife[i] <= 0 || by[i] > s.ground + 10) {
          bn--;
          bx[i] = bx[bn];
          by[i] = by[bn];
          bvx[i] = bvx[bn];
          bvy[i] = bvy[bn];
          blife[i] = blife[bn];
          bsize[i] = bsize[bn];
        } else i++;
      }
    },
    draw(ctx: CanvasRenderingContext2D) {
      const d = s.dpr;
      for (let i = 0; i < n; i++) {
        const t = tex[i];
        const half = sprites[t].width * (size[i] / (HAIL_BASE + t * 3)) * 0.5;
        const c = Math.cos(rot[i]) * d, sn = Math.sin(rot[i]) * d;
        ctx.setTransform(c, sn, -sn, c, x[i] * d, y[i] * d);
        ctx.drawImage(sprites[t], -half, -half, half * 2, half * 2);
      }
      ctx.setTransform(d, 0, 0, d, 0, 0);
      if (bn === 0) return;
      ctx.fillStyle = "rgba(210, 230, 255, 0.4)";
      ctx.beginPath();
      for (let i = 0; i < bn; i++) {
        const sz = bsize[i] * (0.5 + blife[i] * 0.5);
        ctx.moveTo(bx[i], by[i] - sz);
        ctx.lineTo(bx[i] + sz * 0.7, by[i] + sz * 0.3);
        ctx.lineTo(bx[i] - sz * 0.5, by[i] + sz * 0.6);
        ctx.closePath();
      }
      ctx.fill();
    },
  };
}

/** Thin streaks racing sideways, for wind. */
export function createStreaks(cap: number, s: Scene) {
  const x = new Float32Array(cap), y = new Float32Array(cap), v = new Float32Array(cap), len = new Float32Array(cap);
  let n = 0;
  return {
    setCount(target: number) {
      const t = Math.min(target, cap);
      while (n < t) {
        x[n] = rnd() * s.w;
        y[n] = rnd() * s.h;
        v[n] = (rnd() * 5 + 4) * s.k;
        len[n++] = (rnd() * 30 + 15) * s.k;
      }
      n = t;
    },
    update(step: number, dir: number, speed: number) {
      for (let i = 0; i < n; i++) {
        x[i] += v[i] * speed * step * dir;
        if (dir > 0 ? x[i] - len[i] > s.w : x[i] + len[i] < 0) {
          x[i] = dir > 0 ? -len[i] : s.w + len[i];
          y[i] = rnd() * s.h;
        }
      }
    },
    draw(ctx: CanvasRenderingContext2D, dir: number) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        ctx.moveTo(x[i], y[i]);
        ctx.lineTo(x[i] - dir * len[i], y[i]);
      }
      ctx.stroke();
    },
  };
}
