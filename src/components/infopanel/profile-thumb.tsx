/**
 * A Library InfoPanel profile drawn small: the kiosk's own canvas renderer on the item's stored
 * canvas, with no live values (bound items show as InfoPanel draws them unbound). Fetched and
 * loaded only when a card is on screen, so the Library page and the dialogs don't carry the renderer.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import type { SensorMap } from "@/modules/types";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { LibraryItem } from "@/lib/library";
import { canvasData } from "@/lib/my-library/canvas-link";

const CanvasZone = lazy(() => import("./CanvasZone"));
const NO_SENSORS: SensorMap = {};

export function ProfileThumb({ item }: { item: Pick<LibraryItem, "id" | "updatedAt" | "data" | "dataSize"> }) {
  const [canvas, setCanvas] = useState<StoredCanvas | null>(null);
  useEffect(() => {
    let live = true;
    void canvasData(item).then(
      (c) => live && setCanvas(c ?? null),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [item.id, item.updatedAt, item.data]);
  return <CanvasThumb canvas={canvas} />;
}

/** A stored canvas already in hand (a profile placed in the dashboard) drawn the same way. */
export function CanvasThumb({ canvas }: { canvas: StoredCanvas | null }) {
  return (
    <div aria-hidden="true" className="relative h-full w-full overflow-hidden" style={{ background: "#0a0a0c" }}>
      {canvas && (
        <Suspense fallback={null}>
          <CanvasZone canvas={canvas} sensors={NO_SENSORS} />
        </Suspense>
      )}
    </div>
  );
}
