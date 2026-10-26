import { FolderOpen, Plus, Search, Upload, X } from "lucide-react";
import { SORTS, type ListFilter, type ListSort } from "@/lib/screens/list";
import { cn } from "@/lib/utils";

export interface ScreensToolbarProps<F extends string = ListFilter> {
  query: string;
  onQuery: (q: string) => void;
  filter: F;
  onFilter: (f: F) => void;
  /** The Show filter's choices (Screens' kinds, `FILTERS`). */
  filters: readonly { id: F; label: string }[];
  sort: ListSort;
  onSort: (s: ListSort) => void;
  onImport: () => void;
  /** Import .infopanel: the import flow for an InfoPanel profile, which opens in Edit. */
  onImportInfoPanel?: () => void;
  /** The New page: Blank, the templates and every other way to start. */
  onNew: () => void;
  /** What the list holds, in the search's and the sort's names ("screens"). */
  noun?: string;
  placeholder?: string;
  importTitle?: string;
}

const BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-ui-strong bg-transparent px-2.5 text-[12px] text-ui-1 transition-colors hover:bg-ui-hover";

/** Search, the Show filter, the sort, Import, Import .infopanel and New: the strip above the cards on Screens. */
export function ScreensToolbar<F extends string = ListFilter>({
  query,
  onQuery,
  filter,
  onFilter,
  filters,
  sort,
  onSort,
  onImport,
  onImportInfoPanel,
  onNew,
  noun = "screens",
  placeholder = "Search by name, kind or size",
  importTitle = "Import a screen or an InfoPanel profile from a file",
}: ScreensToolbarProps<F>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-[160px] flex-1 basis-[200px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ui-4" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={`Search ${noun}`}
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
        {filters.map((f) => (
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
          aria-label={`Sort ${noun}`}
          className="h-8 cursor-pointer rounded-[7px] border border-ui-default bg-ui-raised px-2 text-[12px] text-ui-1 outline-none focus:border-ui-accent"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" title={importTitle} onClick={onImport} className={BUTTON}>
        <Upload className="h-3.5 w-3.5" />
        <span className="max-sm:sr-only">Import…</span>
      </button>
      {onImportInfoPanel && (
        <button type="button" title="Import an InfoPanel profile (.infopanel); it opens in Edit" onClick={onImportInfoPanel} className={BUTTON}>
          <FolderOpen className="h-3.5 w-3.5" />
          <span className="max-sm:sr-only">Import .infopanel</span>
        </button>
      )}
      <button
        type="button"
        onClick={onNew}
        className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-ui-1 px-3 text-[12px] font-semibold text-ui-inverse-fg outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ui-accent/60"
      >
        <Plus className="h-3.5 w-3.5" />
        New
      </button>
    </div>
  );
}
