/** The editor's left column: the parts the shape has, grouped, each with a toggle; a click selects it for the inspector. */
import { cn } from "@/lib/utils";
import { Toggle } from "@/components/ui/toggle";
import { ALWAYS_ON, groupedParts, hasPart, togglePart, type PartId } from "@/lib/gauge-studio/parts";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";

export interface PartsListProps {
  g: VectorGauge;
  selected: PartId;
  onSelect: (id: PartId) => void;
  set: (next: VectorGauge) => void;
}

export function PartsList({ g, selected, onSelect, set }: PartsListProps) {
  return (
    <nav aria-label="Parts" className="w-[220px] shrink-0 overflow-y-auto border-r border-ui-subtle bg-ui-panel py-2 font-ui max-[899px]:flex max-[899px]:max-h-[240px] max-[899px]:w-full max-[899px]:border-b max-[899px]:border-r-0">
      {groupedParts(g.shape).map(({ group, parts }) => (
        <section key={group} className="pb-2 max-[899px]:w-[200px] max-[899px]:shrink-0">
          <h3 className="px-4 pb-1 pt-2 text-micro font-medium uppercase tracking-[0.06em] text-ui-4">{group}</h3>
          {parts.map((p) => {
            const on = hasPart(g, p.id);
            const fixed = ALWAYS_ON.includes(p.id);
            return (
              <div
                key={p.id}
                className={cn("mx-2 flex h-8 items-center gap-2 rounded-[7px] pl-2 pr-1.5 hover:bg-ui-hover", selected === p.id && "bg-ui-active")}
              >
                <button
                  type="button"
                  aria-current={selected === p.id}
                  onClick={() => onSelect(p.id)}
                  className={cn("min-w-0 flex-1 truncate text-left text-[12.5px]", on ? "text-ui-1" : "text-ui-3")}
                >
                  {p.label}
                </button>
                <Toggle
                  checked={on}
                  label={`${p.label} on`}
                  disabled={fixed}
                  onChange={() => {
                    set(togglePart(g, p.id));
                    onSelect(p.id);
                  }}
                  className="[&>span]:bg-ui-1"
                />
              </div>
            );
          })}
        </section>
      ))}
    </nav>
  );
}
