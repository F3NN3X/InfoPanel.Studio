import type { Ref } from "react";
import { Download, LayoutGrid, List, Plus, Search, Upload, X } from "lucide-react";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { FIELD_BOX } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Segmented } from "@/components/ui/segmented";
import { SORTS, type ListFilter, type ListSort } from "@/lib/screens/list";
import { cn } from "@/lib/utils";
import { BarFill, BarTitle, PageBar } from "../page-bar";

interface ScreensHeaderProps {
  /** "4 screens · 2 displays live". */
  count: string;
  query: string;
  onQuery: (q: string) => void;
  /** The search field, so `/` and Ctrl+F can focus it. */
  searchRef: Ref<HTMLInputElement>;
  onImport: () => void;
  /** "Export & back up": the whole dashboard, reachable from a workspace page (no top bar there). */
  onExportAll: () => void;
  /** The New page: Blank, the templates and every other way to start. */
  onNew: () => void;
}

/** The page's bar: Screens and its count line, the search, Import, Export & back up and New screen. */
export function ScreensHeader({ count, query, onQuery, searchRef, onImport, onExportAll, onNew }: ScreensHeaderProps) {
  return (
    <PageBar>
      <BarTitle title="Screens" note={count} />
      <BarFill />
      <div className="flex min-w-0 items-center gap-2 max-sm:w-full">
        <label className="relative w-60 min-w-30 shrink max-sm:w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-hint" strokeWidth={1.5} aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search screens"
            aria-label="Search screens"
            aria-keyshortcuts="/ Control+F"
            title="Search screens ( / or Ctrl+F )"
            className={cn(FIELD_BOX, "w-full pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden")}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onQuery("")}
              className={cn("absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-ui-sm text-ui-3 hover:text-ui-1", FOCUS_RING)}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </label>
        <Button title="Import a screen or an InfoPanel profile from a file" icon={<Upload strokeWidth={1.5} />} onClick={onImport}>
          <span className="max-xl:sr-only">Import</span>
        </Button>
        <Button title="Export or back up the whole dashboard" aria-label="Export & back up…" icon={<Download strokeWidth={1.5} />} onClick={onExportAll}>
          <span className="max-xl:sr-only">Export &amp; back up</span>
        </Button>
        <Button variant="primary" icon={<Plus strokeWidth={1.75} />} onClick={onNew}>
          New screen
        </Button>
      </div>
    </PageBar>
  );
}

interface ScreensBarProps {
  /** "grid" or "list". */
  layout: "grid" | "list";
  onLayout: (layout: "grid" | "list") => void;
  sort: ListSort;
  onSort: (s: ListSort) => void;
  /** The kind filter shows only while there is an InfoPanel screen (or a link set it). */
  showFilter: boolean;
  filter: ListFilter;
  onFilter: (f: ListFilter) => void;
  filters: readonly { id: ListFilter; label: string }[];
}

/** The controls over "Your screens": the Show filter (when it has something to say), the grid or list toggle and the sort. */
export function ScreensBar({ layout, onLayout, sort, onSort, showFilter, filter, onFilter, filters }: ScreensBarProps) {
  return (
    <div className="flex items-center gap-2">
      {showFilter && <Segmented label="Show" value={filter} options={filters.map((f) => ({ value: f.id, label: f.label }))} onChange={onFilter} />}
      <div role="group" aria-label="Layout" className="flex gap-0.5 rounded-ui-md border border-ui-strong bg-ui-chrome p-0.5">
        <IconButton label="Grid" size={26} active={layout === "grid"} aria-pressed={layout === "grid"} onClick={() => onLayout("grid")}>
          <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />
        </IconButton>
        <IconButton label="List" size={26} active={layout === "list"} aria-pressed={layout === "list"} onClick={() => onLayout("list")}>
          <List className="h-4 w-4" strokeWidth={1.5} />
        </IconButton>
      </div>
      <label className="flex items-center">
        <span className="sr-only">Sort screens</span>
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as ListSort)}
          aria-label="Sort screens"
          className={cn("h-8 cursor-pointer rounded-ui-md border border-ui-control bg-ui-chrome px-2 text-body text-ui-2 hover:text-ui-1", FOCUS_RING)}
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
