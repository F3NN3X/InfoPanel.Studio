/**
 * The two file doors, opened from anywhere (the title bar, Screens, the Library, the gauge editor): a request
 * goes to the studio view, which owns the Import dialog and the Export sheet. Nothing is queued: with no studio
 * mounted a request is dropped.
 */
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";

export interface ImportRequest {
  /** Files already chosen (a drop, the Library's upload tile); none opens the dialog empty. */
  files?: File[];
  /** Where an InfoPanel file lands when the dialog opens ("Canvas from an .infopanel file → Import"). */
  prefer?: "canvas-zone";
}

export interface ExportRequest {
  /** The row to open on. */
  row?: "backup" | "screen" | "page" | "gauge";
  /** "This screen" is this one, not the edited one (a Screens card). */
  screenId?: string;
  /** "Export a gauge" starts on this gauge (the gauge editor's Export). */
  gauge?: { name: string; gauge: VectorGauge };
}

export type FileDoorEvent = ({ type: "import" } & ImportRequest) | ({ type: "export" } & ExportRequest);

const listeners = new Set<(e: FileDoorEvent) => void>();

export const openImportDoor = (req: ImportRequest = {}): void => listeners.forEach((l) => l({ type: "import", ...req }));
export const openExportSheet = (req: ExportRequest = {}): void => listeners.forEach((l) => l({ type: "export", ...req }));

/** The studio view's subscription; returns its unsubscribe. */
export function onFileDoor(listener: (e: FileDoorEvent) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
