/**
 * The New InfoPanel profile gallery: Blank first, then each profile template as a live thumbnail,
 * drawn by the kiosk's own canvas renderer from the template made for the chosen size, palette
 * variant and a made-up machine's sensors (templates/mock.ts), so what the card shows is what
 * Create makes; then the user's Library profiles, drawn from what they saved. Sorted by shape class
 * (strip, wide, standard, tall: `shapeClassOf`): chips filter by class, defaulting to the chosen
 * size's; All lists a section per class, the chosen size's first. A template that doesn't fit the
 * chosen size is drawn at its own shape, never squashed into it. A template's palettes are offered on
 * the wizard's next step (`paletteChips`). Loaded with the New InfoPanel profile page, never in the
 * studio's first bundle.
 */
import { useMemo, useState } from "react";
import { FilePlus2 } from "lucide-react";
import type { LibraryItem } from "@/lib/library";
import type { SensorMap } from "@/modules/types";
import { cn } from "@/lib/utils";
import type { Template } from "@/lib/infopanel/templates/kit";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog";
import { instantiate } from "@/lib/infopanel/templates/instantiate";
import { shapeClassOf } from "@/lib/infopanel/templates/layout";
import { MOCK_SENSORS } from "@/lib/infopanel/templates/mock";
import { cssOf } from "@/lib/infopanel/elements/palette";
import CanvasZone from "./CanvasZone";
import { ProfileThumb } from "./profile-thumb";
import { CLASS_NAMES, COLUMNS, ShapeChips, aspectOf, sectionClasses, type ShapeFilter } from "../templates/shape-chips";
import { SIZE_PRESETS, firstPresetOf, placementOf, thumbSizeOf } from "../templates/size-presets";
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

export interface GalleryChoice {
  /** null: Blank, or a Library profile. */
  template: string | null;
  variant: string;
  /** A Library profile's item id; it copies that profile. */
  library?: string;
}

interface TemplateGalleryProps {
  choice: GalleryChoice;
  onChoice: (c: GalleryChoice) => void;
  width: number;
  height: number;
  /** The user's saved InfoPanel profiles, offered after the templates. */
  profiles?: readonly LibraryItem[];
  /** The home page: each card starts something (`onChoice`) instead of choosing, so none is checked. */
  launch?: boolean;
}

const CARD = "flex min-w-0 flex-col overflow-hidden rounded-[10px] border text-left outline-none focus-visible:border-ui-accent";

const profileSize = (item: LibraryItem) => ({ width: Number(item.meta.width) || 800, height: Number(item.meta.height) || 480 });

export function TemplateGallery({ choice, onChoice, width, height, profiles = [], launch = false }: TemplateGalleryProps) {
  const sizeClass = shapeClassOf(width, height);
  // Until a chip is picked the filter follows the size's class; the home page has no size, so it starts on All.
  const [picked, setPicked] = useState<ShapeFilter | null>(null);
  const filter: ShapeFilter = picked ?? (launch ? "all" : sizeClass);
  const sections = sectionClasses(filter, sizeClass).map((cls) => ({
    cls,
    templates: TEMPLATES.filter((t) => (filter === "all" ? placementOf(t, sizeClass) === cls : t.fits.includes(cls))),
    items: profiles.filter((item) => {
      const s = profileSize(item);
      return shapeClassOf(s.width, s.height) === cls;
    }),
  }));
  const blank = choice.template === null && !choice.library;
  return (
    <div>
      <ShapeChips filter={filter} onFilter={setPicked} />
      <div role={launch ? "group" : "radiogroup"} aria-label="Start from" className="space-y-3">
        {sections.map(({ cls, templates, items }, n) => {
          if (n > 0 && templates.length === 0 && items.length === 0) return null;
          const reference = cls === sizeClass ? { width, height } : SIZE_PRESETS[firstPresetOf(cls)];
          return (
            <section key={cls} aria-label={filter === "all" ? CLASS_NAMES[cls] : undefined}>
              {filter === "all" && <h3 className="mb-1.5 text-[12px] text-ui-3">{CLASS_NAMES[cls]}</h3>}
              <div className={cn("grid items-start gap-2", COLUMNS[cls])}>
                {n === 0 && (
                  <button
                    type="button"
                    role={launch ? undefined : "radio"}
                    aria-checked={launch ? undefined : blank}
                    onClick={() => onChoice({ template: null, variant: "" })}
                    className={cn(CARD, blank ? "border-ui-accent bg-ui-accent/10" : "border-ui-default hover:bg-ui-hover")}
                  >
                    <div className="grid w-full place-items-center bg-ui-raised text-ui-4" style={{ aspectRatio: aspectOf(reference.width, reference.height) }}>
                      <FilePlus2 className="h-6 w-6" />
                    </div>
                    <span className="px-2 pb-1.5 pt-1 text-[12px] font-medium text-ui-1">Blank</span>
                  </button>
                )}
                {templates.map((t) => {
                  const size = thumbSizeOf(t, cls, sizeClass, { width, height });
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role={launch ? undefined : "radio"}
                      aria-checked={launch ? undefined : choice.template === t.id}
                      aria-label={t.name}
                      title={t.blurb}
                      onClick={() => onChoice({ template: t.id, variant: choice.template === t.id ? choice.variant : t.variants[0].id })}
                      className={cn(CARD, choice.template === t.id ? "border-ui-accent bg-ui-accent/10" : "border-ui-default hover:bg-ui-hover")}
                    >
                      <div aria-hidden="true" className="relative w-full" style={{ aspectRatio: aspectOf(size.width, size.height), background: cssOf(t.background) }}>
                        <TemplateThumb template={t} variant={choice.template === t.id ? choice.variant : t.variants[0].id} width={size.width} height={size.height} />
                      </div>
                      <span className="truncate px-2 pt-1 text-[12px] font-medium text-ui-1">{t.name}</span>
                      <span className="truncate px-2 pb-1.5 text-[11px] text-ui-4">{t.blurb}</span>
                    </button>
                  );
                })}
                {items.map((item) => {
                  const size = profileSize(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role={launch ? undefined : "radio"}
                      aria-checked={launch ? undefined : choice.library === item.id}
                      aria-label={item.name}
                      title="Your saved profile; Create makes a copy of it"
                      onClick={() => onChoice({ template: null, variant: "", library: item.id })}
                      className={cn(CARD, choice.library === item.id ? "border-ui-accent bg-ui-accent/10" : "border-ui-default hover:bg-ui-hover")}
                    >
                      <div className="relative w-full" style={{ aspectRatio: aspectOf(size.width, size.height) }}>
                        <ProfileThumb item={item} />
                      </div>
                      <span className="truncate px-2 pt-1 text-[12px] font-medium text-ui-1">{item.name}</span>
                      <span className="truncate px-2 pb-1.5 text-[11px] text-ui-4">From your Library</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
