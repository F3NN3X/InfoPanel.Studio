// The Widgets page's browse view (Phase 5b, screenshots 01-03): search, the filter chips and the "Third-party code widgets"
// switch, then Yours, Imported and Built in. A user widget is a card with its preview; a built-in a tile with its preset count.
import type { CSSProperties, ReactNode } from "react";
import { Search } from "lucide-react";
import { SEGMENT_OFF, SEGMENT_ON } from "@/components/ui/segmented";
import { StatusChip } from "@/components/ui/status-chip";
import { Toggle } from "@/components/ui/toggle";
import type { Appearance } from "@/lib/style-resolve";
import { cn } from "@/lib/utils";
import { iconFor } from "@/widgets/core/icons";
import { RecipePreview } from "./recipe-preview";
import { onScreensChip, type Use, type UserWidget, type WidgetFilter } from "./widgets-model";

/** A built-in on the page: its id, name, icon and preset count. */
export interface BuiltInEntry {
  id: string;
  name: string;
  icon?: string;
  presets: number;
}

export interface WidgetsBrowseProps {
  query: string;
  onQuery: (q: string) => void;
  filter: WidgetFilter;
  onFilter: (f: WidgetFilter) => void;
  counts: Record<WidgetFilter, number>;
  /** "Third-party code widgets" (Phase 6b): the server's switch; off hides and stops every code widget on every screen. */
  thirdParty: boolean;
  onThirdParty: (on: boolean) => void;
  /** Code widgets are off on the server itself (USER_CODE_WIDGETS=off): the switch cannot turn them on. */
  thirdPartyLocked?: boolean;
  /** A loaded code widget's card picture. */
  codePreview?: (w: UserWidget) => ReactNode;
  yours: readonly UserWidget[];
  imported: readonly UserWidget[];
  builtIns: readonly BuiltInEntry[];
  /** Built in is in the list (All only). */
  showBuiltIns: boolean;
  allBuiltIns: boolean;
  onAllBuiltIns: () => void;
  selected: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  usesOf: (id: string) => Use[];
  appearance?: Appearance;
  pageStyle?: CSSProperties;
  /** Why the list is short: the server has user widgets off, or could not be read. */
  notice?: string;
}

const FILTERS: readonly { id: WidgetFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "recipes", label: "Recipes" },
  { id: "code", label: "Code" },
  { id: "yours", label: "Yours" },
];

/** Built-ins shown before "Show all". */
export const BUILT_INS_AT_FIRST = 8;

function SectionHead({ title, count, note, more }: { title: string; count: number; note: string; more?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="text-lead font-medium text-ui-1">{title}</h2>
      <span className="text-caption text-ui-3">{count}</span>
      <span className="ml-2 text-caption text-ui-3">{note}</span>
      {more}
    </div>
  );
}

function Card({ w, selected, uses, onSelect, onOpen, appearance, pageStyle, codePreview }: { w: UserWidget; selected: boolean; uses: Use[]; onSelect: () => void; onOpen: () => void; appearance?: Appearance; pageStyle?: CSSProperties; codePreview?: (w: UserWidget) => ReactNode }) {
  const chip = onScreensChip(uses);
  const Icon = iconFor(w.icon);
  const refused = (!w.recipe && w.kind === "recipe") || w.trust.kind === "refused";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      onDoubleClick={onOpen}
      data-widget-card={w.id}
      className={cn(
        "group flex min-w-0 flex-col overflow-hidden rounded-ui-lg border bg-ui-panel text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
        selected ? "border-ui-accent" : "border-ui-subtle hover:border-ui-menu",
      )}
    >
      <span className="flex h-39 w-full items-center justify-center overflow-hidden bg-ui-app p-3">
        {w.recipe ? (
          <RecipePreview recipe={w.recipe} cells={w.recipe.size.default} sample appearance={appearance} pageStyle={pageStyle} fit={{ w: 260, h: 132 }} />
        ) : w.def && !w.off && codePreview ? (
          codePreview(w)
        ) : w.fixture ? (
          <span className="flex h-33 w-65 items-center justify-center rounded-ui-md border border-ui-subtle bg-ui-raised text-caption text-ui-2">{w.fixture.preview}</span>
        ) : (
          <span className="px-4 text-center text-caption text-ui-3">{refused ? (w.trust.kind === "refused" ? "Not loaded: the signature does not check out" : "Not drawn: the check refused it") : w.off ? "Turned off" : "No preview"}</span>
        )}
      </span>
      {/* the name and its line get the card's whole width; the chips go on their own line under them, so a name is never cut to "T…" */}
      <span className="flex min-w-0 flex-col gap-2 px-3 py-2.5">
        <span className="flex min-w-0 items-start gap-2.5">
          {w.icon && (
            <span data-card-icon={w.icon} className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-ui-md bg-ui-raised text-ui-3">
              <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-body font-medium text-ui-1">{w.name}</span>
            <span data-card-line="" className="block truncate text-caption text-ui-3">
              {w.trust.kind === "refused" ? `Refused: ${w.trust.why}` : refused ? (w.issues.find((i) => i.severity === "error")?.message ?? "Refused") : [w.category, w.blurb].filter(Boolean).join(" · ")}
            </span>
          </span>
        </span>
        <span data-card-chips="" className="flex flex-wrap items-center gap-2">
          {chip && <StatusChip tone="ok">{chip}</StatusChip>}
          {w.trust.kind === "user-key" && <StatusChip tone="warn">Not reviewed</StatusChip>}
          {w.trust.kind === "refused" && <StatusChip tone="danger">Refused</StatusChip>}
          {w.off && <StatusChip tone="neutral">Off</StatusChip>}
          <StatusChip tone="neutral" dot={false}>
            {w.kind === "code" ? "Code" : "Recipe"}
          </StatusChip>
        </span>
      </span>
    </button>
  );
}

function Tile({ b, selected, onSelect }: { b: BuiltInEntry; selected: boolean; onSelect: () => void }) {
  const Icon = iconFor(b.icon);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      data-widget-card={b.id}
      className={cn(
        "flex h-15.5 min-w-0 items-center gap-3 rounded-ui-lg border bg-ui-panel px-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
        selected ? "border-ui-accent" : "border-ui-subtle hover:border-ui-menu",
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-md bg-ui-raised text-ui-3">
        <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-body text-ui-1">{b.name}</span>
        <span className="block truncate text-caption text-ui-3">
          {b.presets} preset{b.presets === 1 ? "" : "s"}
        </span>
      </span>
    </button>
  );
}

export function WidgetsBrowse(p: WidgetsBrowseProps) {
  const builtIns = p.allBuiltIns ? p.builtIns : p.builtIns.filter((b, k) => k < BUILT_INS_AT_FIRST || b.id === p.selected);
  const cards = (list: readonly UserWidget[]) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {list.map((w) => (
        <Card key={w.id} w={w} selected={p.selected === w.id} uses={p.usesOf(w.id)} onSelect={() => p.onSelect(w.id)} onOpen={() => p.onOpen(w.id)} appearance={p.appearance} pageStyle={p.pageStyle} codePreview={p.codePreview} />
      ))}
    </div>
  );
  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-7 py-5 font-ui">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="flex h-9 w-60 items-center gap-2 rounded-ui-md border border-ui-strong bg-ui-chrome px-3 text-ui-3 focus-within:border-ui-accent">
          <Search className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
          <input aria-label="Search widgets" placeholder="Search" value={p.query} onChange={(e) => p.onQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-body text-ui-1 outline-none placeholder:text-ui-3" />
        </label>
        <div role="radiogroup" aria-label="Show" className="flex gap-0.5 rounded-ui-md border border-ui-strong bg-ui-chrome p-0.5">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={p.filter === f.id} onClick={() => p.onFilter(f.id)} className={cn("rounded-ui-sm px-3 py-1.25 text-body transition-colors duration-(--ui-dur-fast) ease-ui", p.filter === f.id ? SEGMENT_ON : SEGMENT_OFF)}>
              {f.label} <span className="text-ui-3">{p.counts[f.id]}</span>
            </button>
          ))}
        </div>
        <span
          className="ml-auto flex items-center gap-3 text-body text-ui-2"
          title={p.thirdPartyLocked ? "Off on the server (USER_CODE_WIDGETS=off): every code widget is hidden and none loads." : "Off hides every code widget that isn't built in and stops it loading, on every screen this server serves."}
        >
          Third-party code widgets
          <Toggle label="Third-party code widgets" checked={p.thirdParty} onChange={p.onThirdParty} disabled={p.thirdPartyLocked} />
        </span>
        {/* The SDK's types for code widget authors (Phase 6a, written by tools/widgets/sdk-types.mjs into public/). */}
        <a href={`${import.meta.env.BASE_URL}widget-sdk/infopanel-widget-sdk.d.ts`} download className="text-caption text-ui-2 underline hover:text-ui-1">
          Widget SDK types (.d.ts)
        </a>
      </div>
      {p.notice && (
        <p role="status" className="mb-5 rounded-ui-md border border-ui-subtle bg-ui-panel px-3 py-2 text-caption text-ui-2">
          {p.notice}
        </p>
      )}
      {(p.filter === "all" || p.filter === "yours" || p.filter === "recipes") && (
        <section aria-label="Yours" className="mb-7">
          <SectionHead title="Yours" count={p.yours.length} note="Recipes you made in Studio" />
          {p.yours.length ? cards(p.yours) : <p className="rounded-ui-lg border border-dashed border-ui-strong px-4 py-5 text-center text-caption text-ui-3">Nothing made here yet. New widget opens the builder; a built-in's Duplicate as a recipe starts from it.</p>}
        </section>
      )}
      {p.filter !== "yours" && (
        <section aria-label="Imported" className="mb-7">
          <SectionHead title="Imported" count={p.imported.length} note="From files and, later, Themely" />
          {p.imported.length ? cards(p.imported) : <p className="rounded-ui-lg border border-dashed border-ui-strong px-4 py-5 text-center text-caption text-ui-3">No imported widgets. Import takes a widget package (.zip).</p>}
        </section>
      )}
      {p.showBuiltIns && (
        <section aria-label="Built in" className="mb-4">
          <SectionHead
            title="Built in"
            count={p.builtIns.length}
            note="Each with its own presets. Duplicate one as a recipe to start from it"
            more={
              !p.allBuiltIns && p.builtIns.length > BUILT_INS_AT_FIRST ? (
                <button type="button" onClick={p.onAllBuiltIns} className="ml-auto rounded-ui-sm text-body text-ui-2 hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent">
                  Show all {p.builtIns.length}
                </button>
              ) : undefined
            }
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {builtIns.map((b) => (
              <Tile key={b.id} b={b} selected={p.selected === b.id} onSelect={() => p.onSelect(b.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
