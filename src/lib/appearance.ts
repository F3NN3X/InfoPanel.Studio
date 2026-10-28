import type { CSSProperties } from "react";
import type { DashboardConfig, MonitorProfile } from "./layout";

/**
 * Page appearance — the background behind the zone grid: each screen's own
 * (`profile.background`; `{ type: "none" }` or unset: none, since config v16).
 * Values are stored sparse: anything unset falls back to the defaults
 * below when the layers are built.
 */

export type BackgroundType = "none" | "color" | "gradient" | "image" | "video";

/** How an image (or video) fills the page. */
export type BackgroundFit = "cover" | "contain" | "stretch" | "center" | "tile";

/** One axis of the media position (the align vocabulary of AlignGrid). */
export type BackgroundAlign = "start" | "center" | "end";

export interface BackgroundGradient {
  from: string;
  to: string;
  /** CSS angle in degrees (0 = bottom to top, 90 = left to right). */
  angle: number;
}

export interface PageBackground {
  type: BackgroundType;
  /** Type "color": the page color; image / video: the letterbox fill. */
  color?: string;
  gradient?: BackgroundGradient;
  /** Image or video URL (http(s), a server path or a data: image). */
  src?: string;
  /** Video: the still shown before playback (and on reduced motion). */
  poster?: string;
  fit?: BackgroundFit;
  position?: { x: BackgroundAlign; y: BackgroundAlign };
  /** Darken the media, 0–100 %. */
  dim?: number;
  /** A color laid over the media at `tintOpacity` (0–100 %). */
  tint?: string;
  tintOpacity?: number;
  /** Blur radius in px. */
  blur?: number;
  /** Video playback: loop (default on), muted (default on), speed (1 = normal). */
  loop?: boolean;
  muted?: boolean;
  rate?: number;
}

/** The look of a field left unset. */
export const BACKGROUND_DEFAULTS = {
  color: "#0b0b0f",
  gradient: { from: "#1e1b4b", to: "#0b0b0f", angle: 160 },
  fit: "cover" as BackgroundFit,
  position: { x: "center", y: "center" } as { x: BackgroundAlign; y: BackgroundAlign },
  tint: "#000000",
} as const;

export const BACKGROUND_TYPES: readonly BackgroundType[] = ["none", "color", "gradient", "image", "video"];
export const BACKGROUND_FITS: readonly BackgroundFit[] = ["cover", "contain", "stretch", "center", "tile"];
const ALIGNS: readonly BackgroundAlign[] = ["start", "center", "end"];
export const MAX_BLUR = 40;

/* ---------------- normalization (stored / imported input) ---------------- */

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  list.includes(v as T) ? (v as T) : undefined;

/** CSS functions a color value may use (anything else, e.g. `url(`, is refused). */
const COLOR_FUNCTIONS = new Set([
  "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color", "color-mix", "var",
]);

/**
 * A CSS color string: hex, a named color or a color function. Colors are
 * also spliced into gradient and overlay values, so the characters are
 * restricted and only color functions pass — no `url(…)` to fetch from.
 */
export function color(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s.length === 0 || s.length > 64 || !/^[\w#(),.%\s/+-]+$/.test(s)) return undefined;
  const fns = [...s.matchAll(/([a-z-]+)\s*\(/gi)].map((m) => m[1].toLowerCase());
  return fns.every((f) => COLOR_FUNCTIONS.has(f)) ? s : undefined;
}

function num(v: unknown, min: number, max: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
}

/**
 * A media URL: http(s), a same-origin path (server assets such as
 * /assets/… or /api/assets/<id>) or an inline data: image / video. Other
 * schemes, protocol-relative URLs (`//host`, `/\host`) and control
 * characters are refused.
 */
export function mediaUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s.length === 0 || s.length > 4096 || /[\u0000-\u001f]/.test(s)) return undefined;
  if (/^[/\\]{2}/.test(s)) return undefined;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s)?.[1].toLowerCase();
  if (scheme === undefined) return s;
  if (scheme === "http" || scheme === "https") return s;
  return scheme === "data" && /^data:(image|video)\//i.test(s) ? s : undefined;
}

function gradient(v: unknown): BackgroundGradient | undefined {
  if (!isObject(v)) return undefined;
  const from = color(v.from);
  const to = color(v.to);
  const angle = num(v.angle, -360, 720);
  if (!from || !to) return undefined;
  return { from, to, angle: (((angle ?? BACKGROUND_DEFAULTS.gradient.angle) % 360) + 360) % 360 };
}

function position(v: unknown): PageBackground["position"] {
  if (!isObject(v)) return undefined;
  const x = oneOf(ALIGNS, v.x);
  const y = oneOf(ALIGNS, v.y);
  return x || y ? { x: x ?? "center", y: y ?? "center" } : undefined;
}

/**
 * Keep a usable background from stored or imported input: an object with
 * a known `type`; every other field is kept only when valid (numbers
 * clamped). Anything else is `undefined` (no background set).
 */
export function normalizeBackground(input: unknown): PageBackground | undefined {
  if (!isObject(input)) return undefined;
  const type = oneOf(BACKGROUND_TYPES, input.type);
  if (!type) return undefined;
  const fields: Omit<PageBackground, "type"> = {
    color: color(input.color),
    gradient: gradient(input.gradient),
    src: mediaUrl(input.src),
    poster: mediaUrl(input.poster),
    fit: oneOf(BACKGROUND_FITS, input.fit),
    position: position(input.position),
    dim: num(input.dim, 0, 100),
    tint: color(input.tint),
    tintOpacity: num(input.tintOpacity, 0, 100),
    blur: num(input.blur, 0, MAX_BLUR),
    loop: typeof input.loop === "boolean" ? input.loop : undefined,
    muted: typeof input.muted === "boolean" ? input.muted : undefined,
    rate: num(input.rate, 0.25, 4),
  };
  const kept = Object.entries(fields).filter(([, v]) => v !== undefined);
  return { type, ...Object.fromEntries(kept) };
}

/* ---------------- resolution ---------------- */

/**
 * The background a screen shows: its own (`{ type: "none" }` or unset: none — the theme's page color shows).
 */
export function resolveBackground(profile: Pick<MonitorProfile, "background">): PageBackground | undefined {
  const bg = profile.background;
  if (!bg || bg.type === "none") return undefined;
  // An image / video with no file yet shows its fill color, or nothing.
  if ((bg.type === "image" || bg.type === "video") && !bg.src)
    return bg.color ? { ...bg, type: "color" } : undefined;
  return bg;
}

/** Where a background edit goes: one screen. */
export type BackgroundScope = { kind: "profile"; profileId: string };

/** Undo-coalescing key for edits in a scope. */
export function backgroundKey(scope: BackgroundScope): string {
  return `background:${scope.profileId}`;
}

/** Set (or clear, `undefined`) the background of a scope. */
export function withBackground(
  config: DashboardConfig,
  scope: BackgroundScope,
  bg: PageBackground | undefined
): DashboardConfig {
  return {
    ...config,
    profiles: config.profiles.map((p) =>
      p.id === scope.profileId ? { ...p, background: bg } : p
    ),
  };
}

/** The media kind a URL's extension names, or undefined when it has none. */
export function mediaKindOf(src: string | undefined): "image" | "video" | undefined {
  const ext = /.([a-z0-9]+)(?:[?#]|$)/i.exec(src ?? "")?.[1].toLowerCase();
  if (!ext) return undefined;
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp"].includes(ext)) return "image";
  if (["mp4", "m4v", "webm", "mkv", "mov", "ogv"].includes(ext)) return "video";
  return undefined;
}

/**
 * The background switched to another type. Other types' values are kept,
 * but image and video share `src`: an image going to video becomes its
 * poster, and a video going to image leaves the poster as the image, so a
 * file never lands in a field of the wrong kind.
 */
export function withBackgroundType(bg: PageBackground, type: BackgroundType): PageBackground {
  if (type === "video" && mediaKindOf(bg.src) === "image") {
    return { ...bg, type, src: undefined, poster: bg.poster ?? bg.src };
  }
  if (type === "image" && mediaKindOf(bg.src) === "video") return { ...bg, type, src: bg.poster };
  return { ...bg, type };
}

/* ---------------- CSS ---------------- */

export interface BackgroundLayers {
  /** The page fill (color, or the letterbox behind an image). */
  fill: CSSProperties;
  /**
   * The media layer (gradient / image), `null` when the fill is all there
   * is. A video is an element of its own, styled by `videoStyle`.
   */
  media: CSSProperties | null;
  /** The dim + tint overlay, `null` when neither is set. */
  overlay: CSSProperties | null;
}

const CSS_POS: Record<"x" | "y", Record<BackgroundAlign, string>> = {
  x: { start: "left", center: "center", end: "right" },
  y: { start: "top", center: "center", end: "bottom" },
};

/** A CSS url() with the string escaped. */
export function cssUrl(src: string): string {
  return `url("${src.replace(/["\\]/g, "\\$&")}")`;
}

function fitCss(fit: BackgroundFit): CSSProperties {
  switch (fit) {
    case "cover":
    case "contain":
      return { backgroundSize: fit, backgroundRepeat: "no-repeat" };
    case "stretch":
      return { backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" };
    case "center":
      return { backgroundSize: "auto", backgroundRepeat: "no-repeat" };
    case "tile":
      return { backgroundSize: "auto", backgroundRepeat: "repeat" };
  }
}

function mediaCss(bg: PageBackground): CSSProperties | null {
  if (bg.type === "gradient") {
    const g = bg.gradient ?? BACKGROUND_DEFAULTS.gradient;
    return { backgroundImage: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` };
  }
  if (bg.type === "image" && bg.src) {
    const pos = bg.position ?? BACKGROUND_DEFAULTS.position;
    return {
      backgroundImage: cssUrl(bg.src),
      backgroundPosition: `${CSS_POS.x[pos.x]} ${CSS_POS.y[pos.y]}`,
      ...fitCss(bg.fit ?? BACKGROUND_DEFAULTS.fit),
    };
  }
  return null;
}

function overlayCss(bg: PageBackground): CSSProperties | null {
  const layers: string[] = [];
  const tintOpacity = bg.tintOpacity ?? 0;
  if (tintOpacity > 0) {
    const tint = `color-mix(in srgb, ${bg.tint ?? BACKGROUND_DEFAULTS.tint} ${tintOpacity}%, transparent)`;
    layers.push(`linear-gradient(${tint}, ${tint})`);
  }
  const dim = bg.dim ?? 0;
  if (dim > 0) layers.push(`linear-gradient(rgb(0 0 0 / ${dim}%), rgb(0 0 0 / ${dim}%))`);
  return layers.length > 0 ? { backgroundImage: layers.join(", ") } : null;
}

/**
 * The CSS of a background's layers. The media layer is blurred with a
 * `filter`; it then bleeds past the page edge by twice the radius (the
 * container clips it), so the edges stay sharp instead of fading out.
 */
export function backgroundLayers(bg: PageBackground): BackgroundLayers {
  const fillColor = bg.type === "gradient" ? undefined : (bg.color ?? BACKGROUND_DEFAULTS.color);
  const media = mediaCss(bg);
  const blur = bg.blur ?? 0;
  const blurred: CSSProperties | null =
    media && blur > 0 ? { ...media, filter: `blur(${blur}px)`, inset: -2 * blur } : media;
  const hasVideo = bg.type === "video" && Boolean(bg.src);
  return {
    fill: fillColor ? { backgroundColor: fillColor } : {},
    media: blurred,
    overlay: media || hasVideo ? overlayCss(bg) : null,
  };
}

/* ---------------- video ---------------- */

/** How a video's frame fills the page (`tile` can't repeat; it centers). */
const VIDEO_FIT: Record<BackgroundFit, CSSProperties["objectFit"]> = {
  cover: "cover",
  contain: "contain",
  stretch: "fill",
  center: "none",
  tile: "none",
};

/**
 * The style of a background `<video>` (absolutely positioned): fit and
 * position as object-fit / object-position, and the blur with the same
 * edge bleed as the image layer (a video needs an explicit size for it).
 */
export function videoStyle(bg: PageBackground): CSSProperties {
  const pos = bg.position ?? BACKGROUND_DEFAULTS.position;
  const blur = bg.blur ?? 0;
  const box: CSSProperties =
    blur > 0
      ? {
          left: -2 * blur,
          top: -2 * blur,
          width: `calc(100% + ${4 * blur}px)`,
          height: `calc(100% + ${4 * blur}px)`,
          filter: `blur(${blur}px)`,
        }
      : { left: 0, top: 0, width: "100%", height: "100%" };
  return {
    ...box,
    objectFit: VIDEO_FIT[bg.fit ?? BACKGROUND_DEFAULTS.fit],
    objectPosition: `${CSS_POS.x[pos.x]} ${CSS_POS.y[pos.y]}`,
  };
}

/** What a background video does now. */
export type VideoPolicy = "play" | "pause" | "poster";

/**
 * Reduced motion shows only the poster (no video is loaded); a hidden
 * page (minimized, another tab) pauses; otherwise it plays.
 */
export function videoPolicy({ motion, hidden }: { motion: "reduce" | "full"; hidden: boolean }): VideoPolicy {
  if (motion === "reduce") return "poster";
  return hidden ? "pause" : "play";
}

/**
 * A video background shown as its poster: an image background with the
 * same fit, position and effects, or just the fill color without a poster.
 */
export function posterBackground(bg: PageBackground): PageBackground {
  return bg.poster ? { ...bg, type: "image", src: bg.poster } : { ...bg, type: "color", src: undefined };
}
