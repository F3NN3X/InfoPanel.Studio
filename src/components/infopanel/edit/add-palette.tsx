/**
 * The InfoPanel editor's Add palette: InfoPanel's 14 item kinds in four groups (Text, Data,
 * Media, Layout). A click adds the kind centred on the canvas, a drag onto the canvas adds it
 * where it is dropped; a sensor kind then asks for its sensor, an image kind for its file first.
 */
import { PALETTE, PALETTE_GROUPS, type PaletteEntry } from "@/lib/infopanel/editor/create";
import type { ItemKind } from "@/lib/infopanel/schema";
import { kindIcon } from "./items-tree";

/** The drag type a palette entry carries (its kind). */
export const PALETTE_DRAG = "application/x-infopanel-kind";

/** The kind a palette drag carries; null for anything else. */
export const paletteKindOf = (data: string): ItemKind | null => PALETTE.find((p) => p.kind === data)?.kind ?? null;

interface AddPaletteProps {
  onAdd: (entry: PaletteEntry) => void;
}

/** What InfoPanel calls the kind, where our label differs. */
const NATIVE_NAME: Partial<Record<PaletteEntry["kind"], string>> = { Sensor: "Sensor", TableSensor: "Table sensor", HttpImage: "HttpImage", SensorImage: "Sensor image" };

export function AddPalette({ onAdd }: AddPaletteProps) {
  return (
    <section aria-label="Add" className="shrink-0 border-b border-ui-subtle px-2.5 pb-2.5 pt-3">
      <div className="px-1 pb-1.5 text-[13px] font-semibold text-ui-1">Add</div>
      {PALETTE_GROUPS.map((g) => (
        <div key={g} role="group" aria-label={g} className="mt-1.5">
          <div className="px-1 pb-1 text-[10.5px] font-medium uppercase tracking-wide text-ui-4">{g}</div>
          <div className="grid grid-cols-2 gap-1">
            {PALETTE.filter((p) => p.group === g).map((p) => {
              const Icon = kindIcon(p.kind);
              const native = NATIVE_NAME[p.kind];
              return (
                <button
                  key={p.kind}
                  type="button"
                  onClick={() => onAdd(p)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(PALETTE_DRAG, p.kind);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  title={`Add ${p.label} (or drag it onto the canvas)${native && native !== p.label ? ` (InfoPanel’s ${native})` : ""}${p.sensor ? ", then choose its sensor" : ""}`}
                  className="flex h-8 min-w-0 items-center gap-2 rounded-[7px] px-2 text-left text-[12px] text-ui-2 hover:bg-ui-hover hover:text-ui-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60"
                >
                  <Icon className="h-4 w-4 shrink-0 text-ui-4" strokeWidth={1.75} />
                  <span className="truncate">{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
