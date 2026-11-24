import { Segmented } from "@/components/ui/segmented";
import { WIDGET_MERGES } from "@/lib/settings-migrate.v19";
import type { DashboardModule } from "@/modules/types";
import { GalleryGrid, galleriesFor } from "./Gallery";
import type { View } from "./Section";

const STEP = "inline-flex h-7 w-7 items-center justify-center rounded-ui-md text-ui-2 hover:bg-ui-hover hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-ui-accent";

/**
 * Focus mode's size strip (`focus=<id>`): All, or one size at a time, stepped with ‹ › (or the arrow keys in the strip); the size
 * picked is selected in the inspector. Esc leaves focus mode.
 */
export function FocusStrip({ sizes, step, onStep }: { sizes: string[]; step: string; onStep: (size: string) => void }) {
  const at = sizes.indexOf(step);
  // from All, › goes to the first size and ‹ to the last
  const go = (by: 1 | -1) => sizes.length > 0 && onStep(sizes[at < 0 ? (by > 0 ? 0 : sizes.length - 1) : (at + by + sizes.length) % sizes.length]);
  return (
    <div data-qa-ui="" className="flex flex-wrap items-center gap-2 rounded-ui-md bg-ui-chrome px-2 py-1 font-ui text-caption text-ui-2">
      <span className="text-ui-3">Size</span>
      <button type="button" aria-label="Previous size" onClick={() => go(-1)} className={STEP}>
        ‹
      </button>
      <Segmented label="Size" mono options={[{ value: "", label: "All" }, ...sizes.map((s) => ({ value: s, label: s }))]} value={step} onChange={onStep} />
      <button type="button" aria-label="Next size" onClick={() => go(1)} className={STEP}>
        ›
      </button>
      <span className="text-micro text-ui-3">Esc leaves focus</span>
    </div>
  );
}

/** Focus mode's galleries: the widget under every skin and every surface at its default size, opened, under its frames. */
export function InlineGalleries({ mod, view }: { mod: DashboardModule; view: View }) {
  // a merged-away widget is drawn as its survivor migrates it, which the galleries do not do
  if (WIDGET_MERGES.some((m) => m.from === mod.id)) return null;
  return galleriesFor(mod).map((def) => (
    <div key={def.title}>
      <p data-qa-ui="" className="mb-1.5 text-nano font-semibold uppercase tracking-wider opacity-50">
        {def.title} · {def.span[0]}x{def.span[1]} · {def.variants.length}
      </p>
      <GalleryGrid def={def} base={view.settings} cell={view.cell} gap={view.gap} live={view.live} />
    </div>
  ));
}
