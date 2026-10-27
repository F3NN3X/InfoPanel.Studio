/**
 * The InfoPanel items and Elements in a grid page's Add panel (one-editor SPEC §5.3), loaded when the panel first
 * shows them so the palette stays out of the studio's first bundle. A click or a drop makes a free area for the
 * entry (`onAdd` gets its drag id, `PALETTE_DRAG`), which the canvas editor then adds it to.
 */
import { idOf, PaletteGroups } from "./add-palette";

export default function GridPalette({ query, onAdd }: { query: string; onAdd: (data: string) => void }) {
  return <PaletteGroups query={query} onAdd={(entry) => onAdd(idOf(entry))} />;
}
