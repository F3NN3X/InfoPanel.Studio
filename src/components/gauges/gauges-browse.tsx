/** The Gauges page's main area (spec §6): Presets, In <profile> and My library, each a grid of live square thumbnails. */
import { cn } from "@/lib/utils";
import type { GaugeEntry } from "@/lib/gauge-studio/model";
import { GaugeView } from "./gauge-view";

export interface GaugeSection {
  id: string;
  title: string;
  note?: string;
  entries: GaugeEntry[];
  /** The one quiet line when there is nothing. */
  empty: string;
}

export interface GaugesBrowseProps {
  sections: GaugeSection[];
  selectedKey: string | null;
  /** The slow value every thumbnail shows. */
  p: number;
  scope: Record<string, string>;
  onSelect: (entry: GaugeEntry) => void;
  onOpen: (entry: GaugeEntry) => void;
}

export function GaugesBrowse({ sections, selectedKey, p, scope, onSelect, onOpen }: GaugesBrowseProps) {
  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-6 font-ui">
      {sections.map((s) => (
        <section key={s.id} aria-label={s.title} className="mb-8">
          <h2 className="text-[13px] font-semibold text-ui-1">
            {s.title}
            {s.entries.length > 0 && <span className="ml-2 font-ui-mono text-[11px] font-normal text-ui-4">{s.entries.length}</span>}
          </h2>
          {s.note && <p className="mb-3 text-[12px] text-ui-4">{s.note}</p>}
          {s.entries.length === 0 ? (
            <p className="mt-2 text-[12px] text-ui-4">{s.empty}</p>
          ) : (
            <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3">
              {s.entries.map((e) => (
                <Thumb key={e.key} entry={e} selected={e.key === selectedKey} p={p} scope={scope} onSelect={onSelect} onOpen={onOpen} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function Thumb({ entry, selected, p, scope, onSelect, onOpen }: { entry: GaugeEntry; selected: boolean; p: number; scope: Record<string, string>; onSelect: (e: GaugeEntry) => void; onOpen: (e: GaugeEntry) => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={`${entry.name}: double-click to ${entry.source.kind === "preset" ? "customise" : "edit"}`}
      onClick={() => onSelect(entry)}
      onDoubleClick={() => onOpen(entry)}
      className={cn(
        "group flex flex-col overflow-hidden rounded-[10px] border bg-ui-panel text-left outline-none focus-visible:border-ui-accent",
        selected ? "border-ui-accent shadow-[0_0_0_1px_var(--ui-accent)]" : "border-ui-subtle hover:border-ui-menu",
      )}
    >
      <span className="flex aspect-square w-full items-center justify-center bg-[#0b0b0e]">
        <GaugeView gauge={entry.gauge} frames={entry.frames} p={p} size={96} scope={scope} />
      </span>
      <span className="truncate px-2.5 py-2 text-[12px] text-ui-1">{entry.name}</span>
    </button>
  );
}
