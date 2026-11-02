/** The image-sequence editor's right pane (spec §6): Frames per second, Recolour and Convert to vector. */
import { InspectorChromeProvider } from "@/components/studio/inspector-layout";
import { NO_RECOLOUR, type Recolour } from "@/lib/infopanel/gauges/raster";
import type { FramesTools } from "./frames-tools";
import { NumRow } from "./inspector/rows";

const BUTTON = "h-8 rounded-ui-md border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40";

export interface FramesInspectorProps {
  tools: FramesTools;
  /** The recolour being previewed; changing it only previews. */
  recolour: Recolour;
  onRecolour: (r: Recolour) => void;
}

export function FramesInspector({ tools, recolour, onRecolour }: FramesInspectorProps) {
  const off = !tools.ready || tools.busy !== null;
  const plain = recolour.hue === NO_RECOLOUR.hue && recolour.saturation === NO_RECOLOUR.saturation && recolour.brightness === NO_RECOLOUR.brightness;
  const apply = () => void tools.recolour(recolour).then((ok) => ok && onRecolour(NO_RECOLOUR));
  return (
    <InspectorChromeProvider value={{ mode: "docked" }}>
      <aside aria-label="Image sequence settings" className="flex w-[300px] shrink-0 flex-col border-l border-ui-subtle bg-ui-panel font-ui max-[899px]:w-full max-[899px]:border-l-0 max-[899px]:border-t">
        <header className="flex h-11 shrink-0 items-center border-b border-ui-subtle px-4">
          <h2 className="truncate text-body font-semibold text-ui-1">Image sequence</h2>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <section className="space-y-3">
            <h3 className="text-micro font-medium uppercase tracking-[0.06em] text-ui-4">Playback</h3>
            <NumRow label="Frames per second" value={tools.animationSpeed} min={0} max={120} onChange={tools.setSpeed} />
            <p className="text-caption leading-snug text-ui-4">How fast the shown frame moves toward the value. 0 jumps straight to it.</p>
          </section>
          <section className="space-y-3">
            <h3 className="text-micro font-medium uppercase tracking-[0.06em] text-ui-4">Recolor</h3>
            <NumRow label="Hue" value={recolour.hue} min={-180} max={180} unit="°" onChange={(hue) => onRecolour({ ...recolour, hue })} />
            <NumRow label="Saturation" value={recolour.saturation} min={0} max={300} unit="%" onChange={(saturation) => onRecolour({ ...recolour, saturation })} />
            <NumRow label="Brightness" value={recolour.brightness} min={0} max={300} unit="%" onChange={(brightness) => onRecolour({ ...recolour, brightness })} />
            <div className="flex gap-2">
              <button type="button" disabled={plain || off} onClick={apply} className={BUTTON}>
                Apply to every frame
              </button>
              <button type="button" disabled={plain} onClick={() => onRecolour(NO_RECOLOUR)} className={BUTTON}>
                Reset
              </button>
            </div>
            <p className="text-caption leading-snug text-ui-4">Previewed here first. Apply makes recolored copies of the frames in one step.</p>
          </section>
          <section className="space-y-3">
            <h3 className="text-micro font-medium uppercase tracking-[0.06em] text-ui-4">Vector</h3>
            <button type="button" disabled={off} onClick={() => void tools.convert()} className={BUTTON}>
              Convert to vector
            </button>
            <p className="text-caption leading-snug text-ui-4">Draws the gauge live from a vector spec sized to these frames, starting from the preset closest in shape. The frames are kept.</p>
          </section>
        </div>
      </aside>
    </InspectorChromeProvider>
  );
}
