/**
 * A profile template's live thumbnail, drawn by the kiosk's own canvas renderer from the template made for the
 * chosen size, palette variant and a made-up machine's sensors (templates/mock.ts), so what the card shows is what
 * Create makes; and a template's palettes as the "Colours" chips (`paletteChips`). Loaded with the New InfoPanel
 * profile page, never in the studio's first bundle.
 */
import { useMemo } from "react";
import type { SensorMap } from "@/modules/types";
import type { Template } from "@/lib/infopanel/templates/kit";
import { instantiate } from "@/lib/infopanel/templates/instantiate";
import { MOCK_SENSORS } from "@/lib/infopanel/templates/mock";
import { cssOf } from "@/lib/infopanel/elements/palette";
import CanvasZone from "./CanvasZone";
import type { VariantChip } from "../templates/variant-chips";

const MOCK = MOCK_SENSORS as unknown as SensorMap;

/** The template drawn at the size, with mock values. */
export function TemplateThumb({ template, variant, width, height }: { template: Template; variant: string; width: number; height: number }) {
  const canvas = useMemo(() => instantiate(template, { name: template.name, width, height, variant, sensors: MOCK_SENSORS }).stored, [template, variant, width, height]);
  return <CanvasZone canvas={canvas} sensors={MOCK} />;
}

/** A template's palettes as the "Colours" chips, each with its two accents and text colour. */
export const paletteChips = (t: Template): VariantChip[] =>
  t.variants.map((v) => {
    const p = { ...t.palette, ...v.palette };
    return { id: v.id, name: v.name, swatch: [p.accent1, p.accent2, p.text].map(cssOf) };
  });
