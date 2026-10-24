/**
 * A static studio element (card, glow, divider, icon) drawn live from its spec at its box's size:
 * the same markup the export bakes into its PNG.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { iconsLoaded, loadIcons } from "@/lib/infopanel/elements/icons.ts";
import { elementSvg, type StaticSpec } from "@/lib/infopanel/elements/svg.ts";

export interface ElementSvgProps {
  spec: StaticSpec;
  width: number;
  height: number;
  /** Unique per drawing: gradient and filter ids live in the page's one id space. */
  id: string;
  style?: CSSProperties;
}

export function ElementSvg({ spec, width, height, id, style }: ElementSvgProps) {
  // An icon draws once the icon set has loaded (its own chunk, fetched only when an icon is shown).
  const [icons, setIcons] = useState(iconsLoaded);
  const wantsIcons = spec.type === "icon" && !icons;
  useEffect(() => {
    if (!wantsIcons) return;
    let live = true;
    void loadIcons().then(() => live && setIcons(true));
    return () => {
      live = false;
    };
  }, [wantsIcons]);
  // `icons` redraws an icon once its markup has loaded.
  const html = useMemo(() => elementSvg(spec, width, height, `${id.replace(/[^\w-]/g, "_")}-`), [spec, width, height, id, icons]);
  // biome-ignore lint/security/noDangerouslySetInnerHtml: elementSvg builds the markup from a normalized spec (numbers, checked colours, the icon set's own markup).
  return <span style={{ display: "block", width, height, lineHeight: 0, ...style }} dangerouslySetInnerHTML={{ __html: html }} />;
}
