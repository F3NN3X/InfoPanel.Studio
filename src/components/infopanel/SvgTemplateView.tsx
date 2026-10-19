/**
 * An SVG template drawn live: its own document in a frame sandboxed without
 * scripts, so its CSS and SMIL animations run and nothing in it can. The page
 * (same origin, allowed by the sandbox) sets the value on the root element,
 * so a change moves the drawing without reloading it.
 */
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { sanitizeTemplate } from "@/lib/infopanel/gauges/svg-template.ts";
import { templateVars, type VectorGauge } from "@/lib/infopanel/gauges/vector.ts";

export interface SvgTemplateViewProps {
  gauge: VectorGauge;
  /** 0..1 of the range. */
  p: number;
  width: number;
  height: number;
  style?: CSSProperties;
}

export function SvgTemplateView({ gauge, p, width, height, style }: SvgTemplateViewProps) {
  const template = gauge.template ?? "";
  // Sanitized again here: a template can come from the library or a saved file.
  const url = useMemo(() => {
    try {
      return URL.createObjectURL(new Blob([sanitizeTemplate(template).svg], { type: "image/svg+xml" }));
    } catch {
      return null;
    }
  }, [template]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const frame = useRef<HTMLIFrameElement>(null);
  const { value, percent } = templateVars(gauge, p);
  const apply = useCallback(() => {
    // The frame's own realm: `instanceof SVGSVGElement` from the page would fail.
    const root = frame.current?.contentDocument?.documentElement as SVGSVGElement | undefined;
    if (root?.localName !== "svg") return;
    root.setAttribute("width", "100%");
    root.setAttribute("height", "100%");
    root.style.setProperty("--value", String(value));
    root.style.setProperty("--percent", String(percent));
  }, [value, percent]);
  useEffect(apply, [apply, url]);

  if (!url) return <div style={{ width, height, outline: "1px dashed #f87171", ...style }} title="This SVG template could not be read" />;
  return (
    <iframe
      ref={frame}
      src={url}
      sandbox="allow-same-origin"
      title="SVG gauge"
      width={width}
      height={height}
      onLoad={apply}
      style={{ display: "block", border: 0, pointerEvents: "none", background: "transparent", colorScheme: "normal", ...style }}
    />
  );
}
