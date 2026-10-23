import { usePerformance } from "@/hooks/use-performance";
import { meteoconName, appIconName, type WeatherCondition } from "@/lib/weather-icons";
import { useTick } from "@/hooks/use-tick";
import { AMBIENT_FPS } from "@/lib/ticker";
import { type CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./primitives";

export type MeteoconStyle = "fill" | "flat" | "line" | "monochrome";

// One lazy chunk per file; the path says style/format/name, so a kiosk only fetches what it shows.
const FILES = import.meta.glob<string>("../../assets/meteocons/*/*/*.svg", { query: "?url", import: "default" });

const urlOf = (style: MeteoconStyle, format: "animated" | "static", name: string) => FILES[`../../assets/meteocons/${style}/${format}/${name}.svg`]?.();

export interface WeatherGlyphProps extends WeatherCondition {
  /** "app" (default) is the widget icon set, "meteocons" the vendored Meteocons. */
  set?: "app" | "meteocons";
  style?: MeteoconStyle;
  /** Animated Meteocons; reduced or lite motion falls back to the static file. */
  animated?: boolean;
  /** Sized by the font size, like Icon, unless a pixel size is given. */
  className?: string;
  size?: number;
  fill?: boolean;
}

/** The icon-set choice every weather view passes down. */
export type WeatherIconProps = Pick<WeatherGlyphProps, "set" | "style" | "animated">;

export function WeatherGlyph({ kind, night, set = "app", style = "line", animated = false, className = "", size: px, fill }: WeatherGlyphProps) {
  const { maxFps, reduceMotion } = usePerformance();
  const lite = reduceMotion || (maxFps > 0 && maxFps < 60);
  const format = animated && !lite ? "animated" : "static";
  const name = meteoconName({ kind, night });
  const meteocons = set === "meteocons";
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!meteocons) return;
    let live = true;
    void urlOf(style, format, name)?.then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [meteocons, style, format, name]);
  if (!meteocons) {
    const icon = <Icon name={appIconName({ kind, night })} fill={fill} className={className} />;
    return px ? (
      <span className="inline-flex shrink-0 leading-none" style={{ fontSize: px }}>
        {icon}
      </span>
    ) : (
      icon
    );
  }
  const box = `inline-block shrink-0 select-none ${className}`;
  const size = { width: "1em", height: "1em", ...(px ? { fontSize: px } : null) };
  if (!url) return <span aria-hidden className={box} style={size} />;
  // The monochrome set is drawn in black: masked, it takes the text colour instead.
  if (format === "animated") return <SteppedSvg url={url} mono={style === "monochrome"} className={box} style={size} />;
  if (style === "monochrome")
    return <span aria-hidden className={box} style={{ ...size, backgroundColor: "currentColor", maskImage: `url(${JSON.stringify(url)})`, maskSize: "contain", maskRepeat: "no-repeat", maskPosition: "center", WebkitMaskImage: `url(${JSON.stringify(url)})`, WebkitMaskSize: "contain", WebkitMaskRepeat: "no-repeat", WebkitMaskPosition: "center" }} />;
  return <img aria-hidden alt="" src={url} draggable={false} className={box} style={size} />;
}

/** The SVG's ids (and their `url(#…)` uses) under `prefix`, so two copies of one icon on a page don't share a gradient or clip. */
export const scopeSvgIds = (svg: string, prefix: string): string =>
  svg.replace(/\bid="([^"]+)"/g, `id="${prefix}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`);

/** An icon file's markup. The build inlines small files as `data:` URLs, which the CSP keeps fetch() from loading. */
const svgText = async (url: string): Promise<string> => {
  const data = /^data:image\/svg\+xml(;base64)?,(.*)$/s.exec(url);
  if (!data) return (await fetch(url)).text();
  return data[1] ? new TextDecoder().decode(Uint8Array.from(atob(data[2]), (c) => c.charCodeAt(0))) : decodeURIComponent(data[2]);
};

/** The monochrome set's black in the text colour, as its mask did; a <mask>'s own black and white stay. */
export const monoToCurrentColor = (svg: string): string =>
  svg
    .split(/(<mask[\s\S]*?<\/mask>)/)
    .map((part, i) => (i % 2 ? part : part.replace(/(fill|stroke)="black"/g, '$1="currentColor"')))
    .join("");

/**
 * An animated Meteocon drawn inline with its SMIL paused and stepped on the shared ticker (ambient
 * rate, Max FPS, stopped while hidden). As an <img> it would animate at the display's refresh rate
 * whatever Max FPS says. The markup is one of the vendored files (`src/assets/meteocons`), never user input.
 */
function SteppedSvg({ url, mono, className, style }: { url: string; mono: boolean; className: string; style: CSSProperties }) {
  const prefix = `mc${useId().replace(/:/g, "")}`;
  const [markup, setMarkup] = useState<string>();
  const host = useRef<HTMLSpanElement>(null);
  const start = useRef<number | null>(null);
  useEffect(() => {
    let live = true;
    svgText(url)
      .then((text) => live && setMarkup(scopeSvgIds(mono ? monoToCurrentColor(text) : text, prefix)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [url, prefix, mono]);
  const svg = () => host.current?.querySelector("svg") ?? null;
  // Paused before the first paint, so it never runs at the display's rate between ticks.
  useLayoutEffect(() => {
    svg()?.pauseAnimations();
    start.current = null;
  }, [markup]);
  useTick((now) => {
    const el = svg();
    if (!el) return;
    start.current ??= now;
    el.setCurrentTime((now - start.current) / 1000);
  }, markup !== undefined, AMBIENT_FPS);
  // biome-ignore lint/security/noDangerouslySetInnerHtml: a vendored icon file, scoped above
  return <span ref={host} aria-hidden className={`${className} [&>svg]:block [&>svg]:h-full [&>svg]:w-full`} style={style} dangerouslySetInnerHTML={{ __html: markup ?? "" }} />;
}
