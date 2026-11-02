/**
 * The first-run setup's screen template gallery: each native screen template as a live picture of the template made
 * for the size (`template-shots.tsx`; until it is taken, a plan of its zones on the template's own background and
 * accent), so what the card shows is the screen it makes. Sorted by shape class (`shape-chips.tsx`): chips filter by
 * class, defaulting to the chosen size's; All lists a section per class, the size's first, the starters before the
 * native versions of the InfoPanel templates. A template that offers palettes shows them as chips under the cards, and
 * its card follows the pick. A template that doesn't fit the size is drawn at its own shape. Its thumbnail
 * (`ScreenTemplateThumb`) is also the New wizard's. Loaded with its step, never in the first bundle.
 */
import { useMemo, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { backgroundLayers } from "@/lib/appearance";
import { cn } from "@/lib/utils";
import { shapeClassOf } from "@/lib/infopanel/templates/layout";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import type { MonitorProfile } from "@/lib/layout";
import { SCREEN_TEMPLATES, screenTemplateById } from "@/lib/screen-templates/catalog";
import type { SensorMap } from "@/modules/types";
import { instantiate } from "@/lib/screen-templates/instantiate";
import type { ScreenTemplate } from "@/lib/screen-templates/kit";
import { iconFor } from "@/widgets/core/icons";
import { ALL_MODULES } from "../studio/studio-modules";
import { CLASS_NAMES, COLUMNS, ShapeChips, aspectOf, sectionClasses, type ShapeFilter } from "./shape-chips";
import { SIZE_PRESETS, firstPresetOf, placementOf, thumbSizeOf } from "./size-presets";
import { TemplateShotHost, useInView, useTemplateShot } from "./template-shots";
import { VariantChips } from "./variant-chips";

/** The screen a template makes at the size with this machine's sensors (the first-run setup's Start from a template). */
export function templateScreen(id: string, size: { width: number; height: number }, sensors: SensorMap, variant?: string): MonitorProfile | undefined {
  const t = screenTemplateById(id);
  return t ? instantiate(t, { name: t.name, variant, ...size, sensors: sensors as unknown as Record<string, DataApiValue> }).profile : undefined;
}

const iconOf = (module: string) => iconFor(ALL_MODULES.find((m) => m.id === module)?.icon);
const titleOf = (module: string) => ALL_MODULES.find((m) => m.id === module)?.title ?? module;

interface ScreenTemplateThumbProps {
  template: ScreenTemplate;
  variant: string;
  width: number;
  height: number;
  /** The selected card: its picture is taken before the others'. */
  first?: boolean;
}

/** The template made for the size in a palette: its picture once taken (fading in), until then its first page drawn as its zones. */
export function ScreenTemplateThumb({ template, variant, width, height, first }: ScreenTemplateThumbProps) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const shot = useTemplateShot(template, variant, width, height, inView, first);
  const [loaded, setLoaded] = useState<string | null>(null);
  const profile = useMemo(() => instantiate(template, { name: template.name, variant, width, height }).profile, [template, variant, width, height]);
  const palette = template.variants?.find((v) => v.id === variant);
  const background = palette?.background ?? template.look.background;
  const bg = background ? backgroundLayers(background) : null;
  const style = { ...template.look.style, ...palette?.style };
  const accent = typeof style.accent === "string" ? style.accent : "#a1a1aa";
  return (
    <div ref={ref} aria-hidden className="absolute inset-0 overflow-hidden" style={bg?.fill}>
      {bg?.media && <div className="absolute inset-0" style={bg.media} />}
      {bg?.overlay && <div className="absolute inset-0" style={bg.overlay} />}
      <div
        className="absolute inset-[4%] grid gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${profile.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${profile.rows}, minmax(0, 1fr))` }}
      >
        {profile.pages[0].placements.map((z) => {
          const Icon = iconOf(z.module);
          return (
            <div
              key={z.id}
              title={titleOf(z.module)}
              className="grid min-h-0 min-w-0 place-items-center rounded-[3px] border"
              style={{ gridColumn: `${z.colStart} / span ${z.colSpan}`, gridRow: `${z.rowStart} / span ${z.rowSpan}`, borderColor: `${accent}55`, background: `${accent}14` }}
            >
              <Icon className="h-[min(14px,60%)] w-[min(14px,60%)]" style={{ color: accent }} strokeWidth={1.75} />
            </div>
          );
        })}
      </div>
      {shot && (
        <img
          src={shot}
          alt=""
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(shot)}
          className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-150", loaded === shot ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}

interface ScreenTemplateGalleryProps {
  /** The chosen template's id; null is Blank. */
  choice: string | null;
  onChoice: (id: string | null) => void;
  width: number;
  height: number;
  /** The chosen template's palette (its first when unset), and the pick of another; the palettes are offered when this is given. */
  variant?: string;
  onVariant?: (id: string) => void;
  /** Offer Blank first (the first-run setup asks for Blank a step earlier). */
  blank?: boolean;
}

const CARD = "flex min-w-0 flex-col overflow-hidden rounded-[10px] border text-left outline-none focus-visible:border-ui-accent";

export function ScreenTemplateGallery({ choice, onChoice, width, height, variant, onVariant, blank = true }: ScreenTemplateGalleryProps) {
  const chosen = choice ? screenTemplateById(choice) : undefined;
  const paletteOf = (t: ScreenTemplate) => (t.id === choice ? (variant ?? t.variants?.[0]?.id ?? "") : (t.variants?.[0]?.id ?? ""));
  const sizeClass = shapeClassOf(width, height);
  // Until a chip is picked the filter follows the size's class.
  const [picked, setPicked] = useState<ShapeFilter | null>(null);
  const filter = picked ?? sizeClass;
  const sections = sectionClasses(filter, sizeClass).map((cls) => ({
    cls,
    templates: SCREEN_TEMPLATES.filter((t) => (filter === "all" ? placementOf(t, sizeClass) === cls : t.fits.includes(cls))),
  }));
  return (
    <div>
      <TemplateShotHost />
      <ShapeChips filter={filter} onFilter={setPicked} />
      <div role="radiogroup" aria-label="Start from" className="space-y-3">
        {sections.map(({ cls, templates }, n) => {
          if (n > 0 && templates.length === 0) return null;
          const reference = cls === sizeClass ? { width, height } : SIZE_PRESETS[firstPresetOf(cls)];
          const card = (t: ScreenTemplate) => {
            const size = thumbSizeOf(t, cls, sizeClass, { width, height });
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={choice === t.id}
                aria-label={t.name}
                title={t.blurb}
                onClick={() => onChoice(t.id)}
                className={cn(CARD, choice === t.id ? "border-ui-accent bg-ui-accent/10" : "border-ui-default hover:bg-ui-hover")}
              >
                <div className="relative w-full" style={{ aspectRatio: aspectOf(size.width, size.height) }}>
                  <ScreenTemplateThumb template={t} variant={paletteOf(t)} width={size.width} height={size.height} />
                </div>
                <span className="truncate px-2 pt-1 text-caption font-medium text-ui-1">{t.name}</span>
                <span className="truncate px-2 pb-1.5 text-micro text-ui-4">{t.blurb}</span>
              </button>
            );
          };
          return (
            <section key={cls} aria-label={filter === "all" ? CLASS_NAMES[cls] : undefined}>
              {filter === "all" && <h3 className="mb-1.5 text-caption text-ui-3">{CLASS_NAMES[cls]}</h3>}
              {((blank && n === 0) || templates.length > 0) && (
                <div className={cn("grid items-start gap-2", COLUMNS[cls])}>
                  {blank && n === 0 && (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={choice === null}
                      onClick={() => onChoice(null)}
                      className={cn(CARD, choice === null ? "border-ui-accent bg-ui-accent/10" : "border-ui-default hover:bg-ui-hover")}
                    >
                      <div className="grid w-full place-items-center bg-ui-raised text-ui-4" style={{ aspectRatio: aspectOf(reference.width, reference.height) }}>
                        <FilePlus2 className="h-6 w-6" />
                      </div>
                      <span className="px-2 pb-1.5 pt-1 text-caption font-medium text-ui-1">Blank</span>
                    </button>
                  )}
                  {templates.map(card)}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {chosen?.variants && onVariant && <VariantChips variants={chosen.variants} value={paletteOf(chosen)} onChange={onVariant} />}
    </div>
  );
}
