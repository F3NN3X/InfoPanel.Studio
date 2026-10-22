import { usePerformance } from "@/hooks/use-performance";
import { meteoconName, appIconName, type WeatherCondition } from "@/lib/weather-icons";
import { useEffect, useState } from "react";
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
  if (style === "monochrome")
    return <span aria-hidden className={box} style={{ ...size, backgroundColor: "currentColor", maskImage: `url(${JSON.stringify(url)})`, maskSize: "contain", maskRepeat: "no-repeat", maskPosition: "center", WebkitMaskImage: `url(${JSON.stringify(url)})`, WebkitMaskSize: "contain", WebkitMaskRepeat: "no-repeat", WebkitMaskPosition: "center" }} />;
  return <img aria-hidden alt="" src={url} draggable={false} className={box} style={size} />;
}
