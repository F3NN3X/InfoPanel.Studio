/**
 * The InfoPanel editor's Add palette: InfoPanel's 14 item kinds in four groups (Text, Data,
 * Media, Layout), then the studio's Elements. A click adds one centred on the canvas, a drag onto
 * the canvas adds it where it is dropped; a sensor kind then asks for its sensor, an image kind
 * for its file first.
 */
import type { LucideIcon } from "lucide-react";
import { PALETTE, PALETTE_GROUPS, type PaletteEntry } from "@/lib/infopanel/editor/create";
import { ELEMENTS, type ElementEntry } from "@/lib/infopanel/elements/create";
import { ELEMENT_ICONS } from "./element-ui";
import { kindIcon } from "./items-tree";

/** The drag type a palette entry carries: its kind, or `element:<type>`. */
export const PALETTE_DRAG = "application/x-infopanel-kind";

/** What a palette button adds: an InfoPanel kind or a studio element. */
export type AddEntry = { kind: "item"; entry: PaletteEntry } | { kind: "element"; entry: ElementEntry };

const idOf = (a: AddEntry) => (a.kind === "item" ? a.entry.kind : `element:${a.entry.type}`);

/** The entry a palette drag carries; null for anything else. */
export function paletteEntryOf(data: string): AddEntry | null {
  const item = PALETTE.find((p) => p.kind === data);
  if (item) return { kind: "item", entry: item };
  const element = ELEMENTS.find((e) => `element:${e.type}` === data);
  return element ? { kind: "element", entry: element } : null;
}

interface AddPaletteProps {
  onAdd: (entry: AddEntry) => void;
}

const BUTTON =
  "flex h-8 min-w-0 items-center gap-2 rounded-[7px] px-2 text-left text-[12px] text-ui-2 hover:bg-ui-hover hover:text-ui-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60";

function AddButton({ add, icon: Icon, label, title, onAdd }: { add: AddEntry; icon: LucideIcon; label: string; title: string; onAdd: (entry: AddEntry) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAdd(add)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PALETTE_DRAG, idOf(add));
        e.dataTransfer.effectAllowed = "copy";
      }}
      title={title}
      className={BUTTON}
    >
      <Icon className="h-4 w-4 shrink-0 text-ui-4" strokeWidth={1.75} />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** What InfoPanel calls the kind, where our label differs. */
const NATIVE_NAME: Partial<Record<PaletteEntry["kind"], string>> = { Sensor: "Sensor", TableSensor: "Table sensor", HttpImage: "HttpImage", SensorImage: "Sensor image" };

export function AddPalette({ onAdd }: AddPaletteProps) {
  return (
    // The left panel's Add tab: Layers has its own tab, so the palette takes the column.
    <section aria-label="Add" className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5 pt-1">
      <div className="px-1 pb-1.5 text-[13px] font-semibold text-ui-1">Add</div>
      {PALETTE_GROUPS.map((g) => (
        <div key={g} role="group" aria-label={g} className="mt-1.5">
          <div className="px-1 pb-1 text-[10.5px] font-medium uppercase tracking-wide text-ui-4">{g}</div>
          <div className="grid grid-cols-2 gap-1">
            {PALETTE.filter((p) => p.group === g).map((p) => {
              const native = NATIVE_NAME[p.kind];
              return (
                <AddButton
                  key={p.kind}
                  add={{ kind: "item", entry: p }}
                  icon={kindIcon(p.kind)}
                  label={p.label}
                  title={`Add ${p.label} (or drag it onto the canvas)${native && native !== p.label ? ` (InfoPanel’s ${native})` : ""}${p.sensor ? ", then choose its sensor" : ""}`}
                  onAdd={onAdd}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div role="group" aria-label="Elements" className="mt-1.5">
        <div className="px-1 pb-1 text-[10.5px] font-medium uppercase tracking-wide text-ui-4">Elements</div>
        <div className="grid grid-cols-2 gap-1">
          {ELEMENTS.map((e) => (
            <AddButton
              key={e.type}
              add={{ kind: "element", entry: e }}
              icon={ELEMENT_ICONS[e.type]}
              label={e.label}
              title={`Add ${e.label}: ${e.hint}${e.sensor ? ". Then choose its sensor" : ""}`}
              onAdd={onAdd}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
