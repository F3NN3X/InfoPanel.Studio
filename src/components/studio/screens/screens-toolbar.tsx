import { Menu } from "@base-ui/react/menu";
import { ChevronDown, LayoutTemplate, Monitor, Plus, Search, Upload, X } from "lucide-react";
import { FILTERS, SORTS, type ListFilter, type ListSort } from "@/lib/screens/list";
import { cn } from "@/lib/utils";
import { ITEM, POPUP } from "../menu-styles";

export interface ScreensToolbarProps {
  query: string;
  onQuery: (q: string) => void;
  filter: ListFilter;
  onFilter: (f: ListFilter) => void;
  sort: ListSort;
  onSort: (s: ListSort) => void;
  onImport: () => void;
  onNewBlank: () => void;
  /** The New screen dialog: Blank, or a screen template from its gallery. */
  onNewTemplate: () => void;
  onNewSample: () => void;
  /** The New InfoPanel profile dialog: Blank, or a template from its gallery. */
  onNewInfoPanel: () => void;
}

const BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-ui-strong bg-transparent px-2.5 text-[12px] text-ui-1 transition-colors hover:bg-ui-hover";

/** Search, the kind filter, the sort, Import and New: the strip above the cards. */
export function ScreensToolbar({ query, onQuery, filter, onFilter, sort, onSort, onImport, onNewBlank, onNewTemplate, onNewSample, onNewInfoPanel }: ScreensToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-[160px] flex-1 basis-[200px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ui-4" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search by name, kind or size"
          aria-label="Search screens"
          className="h-8 w-full rounded-[7px] border border-ui-default bg-ui-raised pl-8 pr-7 text-[12.5px] text-ui-1 outline-none placeholder:text-ui-4 focus:border-ui-accent [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onQuery("")}
            className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ui-4 hover:text-ui-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>
      <div role="group" aria-label="Show" className="flex h-8 items-center rounded-[7px] border border-ui-default bg-ui-raised p-0.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => onFilter(f.id)}
            className={cn(
              "h-full rounded-[5px] px-2.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60",
              filter === f.id ? "bg-ui-active text-ui-1" : "text-ui-3 hover:text-ui-1"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-[12px] text-ui-3">
        <span className="max-sm:sr-only">Sort</span>
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as ListSort)}
          aria-label="Sort screens"
          className="h-8 cursor-pointer rounded-[7px] border border-ui-default bg-ui-raised px-2 text-[12px] text-ui-1 outline-none focus:border-ui-accent"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" title="Import a screen or an InfoPanel profile from a file" onClick={onImport} className={BUTTON}>
        <Upload className="h-3.5 w-3.5" />
        <span className="max-sm:sr-only">Import…</span>
      </button>
      <Menu.Root>
        <Menu.Trigger className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-ui-1 px-3 text-[12px] font-semibold text-ui-inverse-fg outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ui-accent/60">
          <Plus className="h-3.5 w-3.5" />
          New
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
            <Menu.Popup className={cn(POPUP, "w-64")}>
              <Menu.Item className={ITEM} onClick={onNewBlank}>
                <span className="flex items-center gap-2">
                  <Monitor className="h-3.5 w-3.5 text-ui-3" />
                  Blank dashboard screen
                </span>
              </Menu.Item>
              <Menu.Item className={ITEM} onClick={onNewTemplate}>
                <span className="flex items-center gap-2">
                  <LayoutTemplate className="h-3.5 w-3.5 text-ui-3" />
                  Dashboard from a template…
                </span>
              </Menu.Item>
              <Menu.Item className={ITEM} onClick={onNewSample}>
                <span className="flex items-center gap-2">
                  <LayoutTemplate className="h-3.5 w-3.5 text-ui-3" />
                  Dashboard from the sample layout
                </span>
              </Menu.Item>
              <Menu.Item className={ITEM} onClick={onNewInfoPanel}>
                <span className="flex items-center gap-2">
                  <LayoutTemplate className="h-3.5 w-3.5 text-ui-3" />
                  InfoPanel profile or template…
                </span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
