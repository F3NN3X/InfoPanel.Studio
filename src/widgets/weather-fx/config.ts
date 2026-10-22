import type { WeatherKind } from "@/lib/weather-icons";

/** The element area (CSS px) the base particle counts are tuned for; a smaller element gets proportionally fewer. */
export const REF_AREA = 1280 * 720;

const MIN_POOL = 6;

/** The longest physics step, in 60 fps frames: a stall or a 5 fps cap must not throw particles across the widget. */
export const MAX_STEP = 3;

/** What runs for a condition, at intensity 1 and density 100 % on a REF_AREA element. */
export interface FxPlan {
  rain: number;
  snow: number;
  hail: number;
  /** Wind streaks. */
  streaks: number;
  stars: number;
  /** Sun glow strength, 0 = no sun. */
  sun: number;
  moon: boolean;
  /** Cloud cover 0-1. */
  clouds: number;
  /** Fog 0-1. */
  fog: number;
  lightning: boolean;
}

const OFF: FxPlan = { rain: 0, snow: 0, hail: 0, streaks: 0, stars: 0, sun: 0, moon: false, clouds: 0, fog: 0, lightning: false };

/** The effects for a condition; night swaps the sun for a moon and stars where the sky is open. */
export function fxPlan(kind: WeatherKind, night: boolean): FxPlan {
  const sky = (sun: number, stars: number, clouds: number): FxPlan => ({ ...OFF, sun: night ? 0 : sun, moon: night, stars: night ? stars : 0, clouds });
  switch (kind) {
    case "clear":
      return sky(1, 70, 0);
    case "mostly-clear":
      return sky(0.9, 55, 0.15);
    case "partly-cloudy":
      return sky(0.7, 30, 0.4);
    case "cloudy":
      return { ...OFF, clouds: 0.7 };
    case "overcast":
      return { ...OFF, clouds: 1 };
    case "fog":
      return { ...OFF, fog: 0.7, clouds: 0.2 };
    case "drizzle":
      return { ...OFF, rain: 120, clouds: 0.6 };
    case "rain":
      return { ...OFF, rain: 300, clouds: 0.8 };
    case "heavy-rain":
      return { ...OFF, rain: 560, clouds: 1 };
    case "sleet":
      return { ...OFF, rain: 160, snow: 90, clouds: 0.8 };
    case "snow":
      return { ...OFF, snow: 200, clouds: 0.5 };
    case "hail":
      return { ...OFF, rain: 20, hail: 30, clouds: 0.9 };
    case "thunder":
      return { ...OFF, rain: 380, clouds: 1, lightning: true };
    case "wind":
      return { ...OFF, streaks: 90, clouds: 0.5 };
  }
}

/** How many particles to run: `base` at REF_AREA scaled to `area`, at least a handful, at most `max`; 0 when off. */
export function poolSize(base: number, area: number, max = Infinity): number {
  if (!(base > 0) || !(area > 0)) return 0;
  return Math.min(max, Math.max(MIN_POOL, Math.ceil((base * area) / REF_AREA)));
}

/** Physics step in 60 fps frames for `dtMs` of real time, capped at MAX_STEP. */
export function stepScale(dtMs: number): number {
  return Number.isFinite(dtMs) && dtMs > 0 ? Math.min(MAX_STEP, dtMs / (1000 / 60)) : 0;
}

/** Sideways drift in px per frame (positive = right) for the Wind setting, `auto` reading wind_speed (m/s) and wind_deg (where it blows from). */
export function windValue(mode: "auto" | "none" | "left" | "right", speed: number, deg: number): number {
  if (mode === "none") return 0;
  if (mode === "left") return -3;
  if (mode === "right") return 3;
  if (!Number.isFinite(speed) || !Number.isFinite(deg)) return 0;
  return -Math.sin((deg * Math.PI) / 180) * Math.min(speed, 15) * 0.4;
}
