/** The editor's left column: the parts the shape has, grouped, each with a toggle; a click selects it for the inspector. */
import { Lock } from "lucide-react";
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
    <nav aria-label="Parts" className="w-55 shrink-0 overflow-y-auto border-r border-ui-subtle bg-ui-panel py-2 font-ui max-narrow:flex max-narrow:max-h-60 max-narrow:w-full max-narrow:border-b max-narrow:border-r-0">
      {groupedParts(g.shape).map(({ group, parts }) => (
        <section key={group} className="pb-2 max-narrow:w-50 max-narrow:shrink-0">
          <h3 className="px-4 pb-1 pt-2 text-caption font-medium text-ui-3">{group}</h3>
          {parts.map((p) => {
            const on = hasPart(g, p.id);
            const fixed = ALWAYS_ON.includes(p.id);
            return (
              <div
                key={p.id}
                className={cn("mx-2 flex h-8 items-center gap-2 rounded-8 pl-2 pr-1.5 hover:bg-ui-hover", selected === p.id && "bg-ui-active")}
              >
                <button
                  type="button"
                  aria-current={selected === p.id}
                  onClick={() => onSelect(p.id)}
                  className={cn("min-w-0 flex-1 truncate text-left text-body", on ? "text-ui-1" : "text-ui-3")}
                >
                  {p.label}
                </button>
                {fixed ? (
                  <span title={`${p.label} is always on`} className="grid h-4.5 w-7.5 shrink-0 place-items-center text-ui-hint">
                    <Lock className="h-3.5 w-3.5" aria-label={`${p.label} is always on`} />
                  </span>
                ) : (
                  <Toggle
                    checked={on}
                    label={`${p.label} on`}
                    onChange={() => {
                      set(togglePart(g, p.id));
                      onSelect(p.id);
                    }}
                  />
                )}
              </div>
            );
          })}
        </section>
      ))}
    </nav>
  );
}
