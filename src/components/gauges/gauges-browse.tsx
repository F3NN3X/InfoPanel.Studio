/** The Gauges page's main area (spec §6): Presets, In <profile> and My library, each a grid of live square thumbnails. */
import { cn } from "@/lib/utils";
import type { GaugeEntry } from "@/lib/gauge-studio/model";
import { draggableGauge } from "./gauge-drag";
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
  /** A card is dragged (to the canvas). */
  onDragStart: (entry: GaugeEntry, dt: DataTransfer) => void;
  /** Right-click (or the menu key) on a card at a viewport point. */
  onMenu: (entry: GaugeEntry, x: number, y: number) => void;
  /** Delete / Backspace on the focused card (the page decides which cards can). */
  onRemove: (entry: GaugeEntry) => void;
  /** The card whose name is being edited in place. */
  renamingKey: string | null;
  /** The edited name is kept (name) or dropped (null). */
  onRenamed: (entry: GaugeEntry, name: string | null) => void;
}

export function GaugesBrowse({ sections, selectedKey, p, scope, onSelect, onOpen, onDragStart, onMenu, onRemove, renamingKey, onRenamed }: GaugesBrowseProps) {
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
                <Thumb key={e.key} entry={e} selected={e.key === selectedKey} p={p} scope={scope} renaming={e.key === renamingKey} onSelect={onSelect} onOpen={onOpen} onDragStart={onDragStart} onMenu={onMenu} onRemove={onRemove} onRenamed={onRenamed} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

interface ThumbProps extends Pick<GaugesBrowseProps, "onSelect" | "onOpen" | "onDragStart" | "onMenu" | "onRemove" | "onRenamed"> {
  entry: GaugeEntry;
  selected: boolean;
  p: number;
  scope: Record<string, string>;
  renaming: boolean;
}

// A div, not a button: the name turns into a text field when it is renamed.
function Thumb({ entry, selected, p, scope, renaming, onSelect, onOpen, onDragStart, onMenu, onRemove, onRenamed }: ThumbProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      draggable={draggableGauge(entry) && !renaming}
      onDragStart={(e) => onDragStart(entry, e.dataTransfer)}
      title={`${entry.name}: double-click to ${entry.source.kind === "preset" ? "customise" : "edit"}`}
      onClick={() => onSelect(entry)}
      onDoubleClick={() => onOpen(entry)}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect(entry);
        // The menu key fires at 0,0: open from the card instead.
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX === 0 && e.clientY === 0) onMenu(entry, r.left + 12, r.top + 12);
        else onMenu(entry, e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        // The card's own keys, not the name field's.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(entry);
        }
        if ((e.key === "Delete" || e.key === "Backspace") && !e.repeat) {
          e.preventDefault();
          onRemove(entry);
        }
      }}
      className={cn(
        "group flex flex-col overflow-hidden rounded-[10px] border bg-ui-panel text-left outline-none focus-visible:border-ui-accent",
        selected ? "border-ui-accent shadow-[0_0_0_1px_var(--ui-accent)]" : "border-ui-subtle hover:border-ui-menu",
      )}
    >
      <span className="flex aspect-square w-full items-center justify-center bg-[#0b0b0e]">
        <GaugeView gauge={entry.gauge} frames={entry.frames} p={p} size={96} scope={scope} />
      </span>
      {renaming ? (
        <input
          autoFocus
          aria-label="Gauge name"
          defaultValue={entry.name}
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          onBlur={(e) => onRenamed(entry, e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenamed(entry, e.currentTarget.value);
            if (e.key === "Escape") onRenamed(entry, null);
          }}
          className="mx-1.5 my-1.5 h-7 min-w-0 rounded-[6px] border border-ui-accent bg-ui-app px-1.5 text-[12px] text-ui-1 outline-none"
        />
      ) : (
        <span className="truncate px-2.5 py-2 text-[12px] text-ui-1">{entry.name}</span>
      )}
    </div>
  );
}
