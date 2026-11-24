import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Tag } from "@/components/ui/tag";
import { Tooltip } from "@/components/ui/tooltip";
import { CONTROL_HELP, tipOf, type ControlId } from "./help-text";
import { linkedWidget, listGroups, rowHidden, rowStatus, stepWidget, type RowStatus } from "./list";
import { NOTES } from "./notes";
import { GALLERY_IDS } from "./options";
import type { QaState } from "./params";
import type { Section } from "./plan";
import { useWidgetTally } from "./tally";

/** Each status as its dot draws it and as a screen reader hears it. */
const STATUS: Record<RowStatus, { dot: string; text: string }> = {
  issues: { dot: "bg-ui-danger", text: "issues" },
  flags: { dot: "bg-ui-warn", text: "theme flags" },
  clean: { dot: "bg-ui-4", text: "clean so far" },
  unchecked: { dot: "border border-ui-strong", text: "not checked yet" },
};

const ROW = "flex h-7 w-full min-w-0 items-center gap-2 rounded-ui-sm px-2 text-left text-caption focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-accent";
const GALLERIES = new Set(GALLERY_IDS);
const SEARCH = "qa-search";

/** Scrolls the frames column to an anchor once the page has drawn what a change brought (the galleries, the surfaces). */
const scrollTo = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));

/** A plain click on an anchor runs `go`; a modified one (a new tab, a copied link) keeps the anchor's own behaviour. */
const onPlainClick = (go: () => void) => (e: MouseEvent) => {
  if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  go();
};

/** Typing in a field, or a key meant for an open dialog or menu: the list's keys leave it alone. */
const typing = (t: EventTarget | null) => t instanceof Element && !!t.closest("input, textarea, select, [contenteditable], dialog, [role=dialog], [role=menu], [role=listbox]");

function Chip({ id, on, onToggle }: { id: ControlId; on: boolean; onToggle: () => void }) {
  return (
    <Tooltip label={<span className="block max-w-72">{tipOf(id)}</span>} side="bottom">
      <Tag selected={on} onClick={onToggle}>
        {CONTROL_HELP[id].name}
      </Tag>
    </Tooltip>
  );
}

interface WidgetListProps {
  state: QaState;
  /** The page's sections, as the frames draw them (the `module=`, search and Notes filters applied). */
  sections: readonly Section[];
  /** The merged-away widgets: id to the title of the widget each merged into. */
  merged: ReadonlyMap<string, string>;
  /** Whether the app's surfaces are drawn now (on, and no filter or `module=`). */
  surfacesShown: boolean;
  /** Whether the theme check runs (a Look other than Classic or a skin is worn). */
  flagsChecked: boolean;
  /** The top bar, which the list sits under. */
  bar: RefObject<HTMLElement | null>;
  onChange: (patch: Partial<QaState>) => void;
}

/**
 * The widget list, the page's left column: the search and the filter chips (Issues, Theme flags, Notes), the app surfaces and the
 * galleries, then every shown widget by category with a status dot (red: issues, amber: theme flags, in the frames checked so far)
 * and a mark for notes. A row scrolls the frames to its widget and makes it the list's current one, which `j` and `k` move and the
 * galleries entry opens; `/` focuses the search. It reads the frames' counts from the tally, so it re-renders as frames report and
 * the frames never do; every row keeps its elements as its status changes, so the page's settle wait is not reset by the list.
 */
export function WidgetList({ state, sections, merged, surfacesShown, flagsChecked, bar, onChange }: WidgetListProps) {
  const found = useWidgetTally();
  const [current, setCurrent] = useState(() => linkedWidget(window.location.hash, state.module));
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [top, setTop] = useState(0);
  const list = useRef<HTMLElement>(null);

  // The list sits under the top bar, whose height changes with the active changes row.
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const measure = () => setTop(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bar]);

  const filters = { issues: state.issues, flagged: state.flagged, flagsChecked };
  // a row the page hides (Issues, Theme flags) stays in the DOM, hidden, so a report flips an attribute and adds no element
  const groups = listGroups(sections, merged).map((g) => {
    const rows = g.rows.map((r) => ({ ...r, hidden: rowHidden(found.get(r.id), filters) }));
    return { ...g, rows, shown: rows.filter((r) => !r.hidden).length };
  });
  const ids = groups.flatMap((g) => (closed.has(g.id) ? [] : g.rows.filter((r) => !r.hidden).map((r) => r.id)));

  const go = (id: string) => {
    setCurrent(id);
    document.getElementById(id)?.scrollIntoView({ block: "start" });
    list.current?.querySelector(`[data-qa-row="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
  };
  // the keys read the list as it is now, not as it was when they were bound
  const now = useRef({ ids, current, go });
  now.current = { ids, current, go };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        const box = document.getElementById(SEARCH) as HTMLInputElement | null;
        box?.focus();
        box?.select();
      } else if (e.key === "j" || e.key === "k") {
        const next = stepWidget(now.current.ids, now.current.current, e.key === "j" ? 1 : -1);
        if (!next) return;
        e.preventDefault();
        now.current.go(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = (id: string) => setClosed((was) => (was.has(id) ? new Set([...was].filter((x) => x !== id)) : new Set([...was, id])));
  const gallery = GALLERIES.has(current) ? current : "";
  const anyFilter = !!(state.q || state.noted || state.issues || (state.flagged && flagsChecked));
  return (
    <aside data-qa-ui="" aria-label="Widget list" className="sticky z-10 flex w-66 shrink-0 flex-col self-start border-r border-ui-subtle bg-ui-chrome font-ui text-ui-2" style={{ top, height: `calc(100vh - ${top}px)`, marginLeft: -24 }}>
      <div className="space-y-2 border-b border-ui-subtle p-3">
        <Tooltip label={<span className="block max-w-72">{tipOf("q")}</span>} side="bottom">
          <Field
            id={SEARCH}
            aria-label="Filter id or title"
            aria-keyshortcuts="/"
            placeholder="Search widgets   /"
            className="h-7 w-full px-2 text-caption"
            value={state.q}
            onChange={(e) => onChange({ q: e.target.value })}
            onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
          />
        </Tooltip>
        <div role="group" aria-label="Filters" className="flex flex-wrap gap-1.5">
          <Chip id="issues" on={state.issues} onToggle={() => onChange({ issues: !state.issues })} />
          {(flagsChecked || state.flagged) && <Chip id="flagged" on={state.flagged} onToggle={() => onChange({ flagged: !state.flagged })} />}
          <Chip id="noted" on={state.noted} onToggle={() => onChange({ noted: !state.noted })} />
        </div>
      </div>
      <nav ref={list} aria-label="Widgets" className="min-h-0 flex-1 overflow-y-auto p-1.5">
        <ul className="mb-1.5 space-y-0.5 border-b border-ui-subtle pb-1.5">
          <li>
            {surfacesShown ? (
              <a href="#surfaces" className={`${ROW} text-ui-1 hover:bg-ui-hover`} title={tipOf("surfaces")}>
                <span className="truncate">App surfaces</span>
                <span className="ml-auto shrink-0 text-micro text-ui-3">rail, alerts, island</span>
              </a>
            ) : (
              <button type="button" className={`${ROW} hover:bg-ui-hover disabled:hover:bg-transparent`} disabled={state.surfaces} title={state.surfaces ? "Hidden while a filter or module= is set" : tipOf("surfaces")} onClick={() => {
                  onChange({ surfaces: true });
                  scrollTo("surfaces");
                }}>
                <span className="truncate">App surfaces</span>
                <span className="ml-auto shrink-0 text-micro text-ui-3">{state.surfaces ? "hidden while filtered" : "off · show"}</span>
              </button>
            )}
          </li>
          <li>
            <button
              type="button"
              className={`${ROW} text-ui-1 hover:bg-ui-hover`}
              title={gallery ? `Opens ${gallery} in the Skins and Surfaces galleries (gallery=)` : tipOf("gallery")}
              onClick={() => {
                if (gallery && gallery !== state.gallery) onChange({ gallery });
                scrollTo("galleries");
              }}
            >
              <span className="truncate">Skins &amp; surfaces</span>
              <span className="ml-auto min-w-0 truncate text-micro text-ui-3">{gallery || state.gallery || "CpuMonitor, SystemStatus"}</span>
            </button>
          </li>
        </ul>
        {groups.map((g) => {
          const open = !closed.has(g.id);
          return (
            <div key={g.id} hidden={g.shown === 0} className="mb-1">
              <button type="button" aria-expanded={open} onClick={() => toggle(g.id)} className={`${ROW} h-6 text-micro font-semibold uppercase tracking-wider text-ui-3 hover:text-ui-1`}>
                <ChevronDown aria-hidden className={`h-3 w-3 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} strokeWidth={2} />
                <span className="truncate">{g.title}</span>
                <span className="ml-auto font-ui-mono tabular-nums">{g.shown}</span>
              </button>
              <ul hidden={!open} className="space-y-0.5">
                {g.rows.map((r) => {
                  const status = STATUS[rowStatus(found.get(r.id))];
                  const here = r.id === current;
                  return (
                    <li key={r.id} hidden={r.hidden}>
                      <a
                        href={`#${r.id}`}
                        data-qa-row={r.id}
                        aria-current={here ? "true" : undefined}
                        title={r.mergedInto ? `${r.id}, merged into ${r.mergedInto}` : r.id}
                        onClick={onPlainClick(() => go(r.id))}
                        className={`${ROW} ${here ? "bg-ui-active text-ui-1" : "hover:bg-ui-hover hover:text-ui-1"}`}
                      >
                        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
                        <span className="sr-only">{status.text}: </span>
                        <span className="min-w-0 truncate">{r.title}</span>
                        {r.mergedInto && <span className="min-w-0 shrink truncate text-micro text-ui-3">→ {r.mergedInto}</span>}
                        {NOTES[r.id] && (
                          <span role="img" aria-label="has notes" title="Has notes (notes.json)" className="ml-auto shrink-0 text-micro text-ui-warn-text">
                            ✎
                          </span>
                        )}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {groups.every((g) => g.shown === 0) && (
          <div role="status" className="space-y-2 px-2 py-3 text-caption text-ui-3">
            <p>{state.q ? `No widget matches “${state.q}”.` : "No widget matches these filters."}</p>
            {anyFilter && (
              <button type="button" className="rounded-ui-sm text-ui-2 underline decoration-current/40 underline-offset-2 hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-ui-accent" onClick={() => onChange({ q: "", noted: false, issues: false, flagged: false })}>
                Clear the search and filters
              </button>
            )}
          </div>
        )}
      </nav>
    </aside>
  );
}
