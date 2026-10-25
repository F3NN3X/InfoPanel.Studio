/**
 * The New InfoPanel profile gallery: Blank first, then each profile template as a live thumbnail,
 * drawn by the kiosk's own canvas renderer from the template made for the chosen size, palette
 * variant and a made-up machine's sensors (templates/mock.ts), so what the card shows is what
 * Create makes; then the user's Library profiles, drawn from what they saved. Loaded with the
 * dialog, never in the studio's first bundle.
 */
import { useMemo } from "react";
import { FilePlus2 } from "lucide-react";
import type { LibraryItem } from "@/lib/library";
import type { SensorMap } from "@/modules/types";
import { cn } from "@/lib/utils";
import type { Template } from "@/lib/infopanel/templates/kit";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog";
import { instantiate } from "@/lib/infopanel/templates/instantiate";
import { MOCK_SENSORS } from "@/lib/infopanel/templates/mock";
import { cssOf } from "@/lib/infopanel/elements/palette";
import CanvasZone from "./CanvasZone";
import { ProfileThumb } from "./profile-thumb";

const MOCK = MOCK_SENSORS as unknown as SensorMap;

/** The template drawn at the size, with mock values. */
function Thumb({ template, variant, width, height }: { template: Template; variant: string; width: number; height: number }) {
  const canvas = useMemo(() => instantiate(template, { name: template.name, width, height, variant, sensors: MOCK_SENSORS }).stored, [template, variant, width, height]);
  return <CanvasZone canvas={canvas} sensors={MOCK} />;
}

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

export function TemplateGallery({ choice, onChoice, width, height, profiles = [], launch = false }: TemplateGalleryProps) {
  const chosen = TEMPLATES.find((t) => t.id === choice.template);
  // Thumbnails keep the canvas's shape, within a strip from 3:1 to 1:1.
  const aspect = Math.min(3, Math.max(1, width / height));
  return (
    <div>
      <div role={launch ? "group" : "radiogroup"} aria-label="Start from" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <button
          type="button"
          role={launch ? undefined : "radio"}
          aria-checked={launch ? undefined : choice.template === null && !choice.library}
          onClick={() => onChoice({ template: null, variant: "" })}
          className={cn(CARD, choice.template === null && !choice.library ? "border-ui-accent bg-ui-accent/10" : "border-ui-default hover:bg-ui-hover")}
        >
          <div className="grid w-full place-items-center bg-ui-raised text-ui-4" style={{ aspectRatio: aspect }}>
            <FilePlus2 className="h-6 w-6" />
          </div>
          <span className="px-2 pb-1.5 pt-1 text-[12px] font-medium text-ui-1">Blank</span>
        </button>
        {TEMPLATES.map((t) => (
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
            <div aria-hidden="true" className="relative w-full" style={{ aspectRatio: aspect, background: cssOf(t.background) }}>
              <Thumb template={t} variant={choice.template === t.id ? choice.variant : t.variants[0].id} width={width} height={height} />
            </div>
            <span className="truncate px-2 pt-1 text-[12px] font-medium text-ui-1">{t.name}</span>
            <span className="truncate px-2 pb-1.5 text-[11px] text-ui-4">{t.blurb}</span>
          </button>
        ))}
        {profiles.map((item) => (
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
            <div className="relative w-full" style={{ aspectRatio: aspect }}>
              <ProfileThumb item={item} />
            </div>
            <span className="truncate px-2 pt-1 text-[12px] font-medium text-ui-1">{item.name}</span>
            <span className="truncate px-2 pb-1.5 text-[11px] text-ui-4">From your Library</span>
          </button>
        ))}
      </div>
      {chosen && (
        <div role="radiogroup" aria-label="Colours" className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-ui-3">Colours</span>
          {chosen.variants.map((v) => {
            const p = { ...chosen.palette, ...v.palette };
            return (
              <button
                key={v.id}
                type="button"
                role={launch ? undefined : "radio"}
                aria-checked={choice.variant === v.id}
                onClick={() => onChoice({ template: chosen.id, variant: v.id })}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-[7px] border px-2 text-[12px]",
                  choice.variant === v.id ? "border-ui-accent bg-ui-accent/10 text-ui-1" : "border-ui-default text-ui-2 hover:bg-ui-hover",
                )}
              >
                {[p.accent1, p.accent2, p.text].map((c, i) => (
                  <span key={i} className="h-3 w-3 rounded-full border border-black/30" style={{ background: cssOf(c) }} />
                ))}
                {v.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
