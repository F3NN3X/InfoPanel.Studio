/** The spring-load pill while a gauge card is dragged: hovering it brings the canvas up under the drag (as on the Library page). */
import { MonitorPlay } from "lucide-react";

export function CanvasDropPill({ onShowCanvas }: { onShowCanvas: () => void }) {
  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        onShowCanvas();
      }}
      onDragOver={(e) => e.preventDefault()}
      className="absolute bottom-6 left-1/2 z-30 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full border border-dashed border-ui-accent bg-ui-raised px-5 text-body text-ui-1 shadow-ui-modal"
    >
      <MonitorPlay className="h-4 w-4 text-ui-accent-text" />
      Drag here to place it on the canvas
    </div>
  );
}
