import { useEffect, useReducer, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { modules } from "@/modules";
import type { DashboardModule } from "@/modules/types";
import { TEMPLATE_MODULES } from "@/widgets/registry";
import { partsOf, type Now } from "../console";
import { mergedModules } from "../plan";
import { getSelection, NOTES_QUEUE, select, subscribe } from "../selection";
import { FramePart, type InspectedFrame } from "./FramePart";
import { NotesQueue } from "./NotesQueue";
import { WidgetPart } from "./WidgetPart";

/** Every widget the page can draw: the registered ones (legacy included, for `module=`) and the merged-away ones. */
const ALL: DashboardModule[] = [...modules, ...mergedModules(TEMPLATE_MODULES)];

interface Target {
  mod?: DashboardModule;
  frame?: InspectedFrame;
  /** The notes queue (`NOTES_QUEUE`), in place of a frame or a widget. */
  queue?: true;
}

/**
 * What the selection names, as the page draws it now (`selection.ts`): a widget by its id (its section), a frame by its anchor
 * (`CpuMonitor--2x1`, which also brings its widget), a surface by `surface:<name>`, or the notes queue. Gone from the page (a filter,
 * other sizes): none.
 */
function resolve(sel: string | null): Target | undefined {
  if (!sel) return undefined;
  if (sel === NOTES_QUEUE) return { queue: true };
  if (sel.startsWith("surface:")) {
    const el = document.querySelector(`[data-qa-surface="${CSS.escape(sel.slice("surface:".length))}"]`);
    return el ? { frame: { el, id: sel, ...partsOf(el) } } : undefined;
  }
  const el = document.getElementById(sel);
  if (el?.tagName === "SECTION") {
    const mod = ALL.find((m) => m.id === sel);
    return mod ? { mod } : undefined;
  }
  if (el?.tagName !== "FIGURE") return undefined;
  const parts = partsOf(el);
  return { mod: ALL.find((m) => m.id === parts.module), frame: { el, id: sel, ...parts } };
}

/** The sticky top bar's height (`main > header`), so the inspector sticks under it. */
function useBarHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const bar = document.querySelector("main > header");
    if (!bar) return;
    const ro = new ResizeObserver(() => setH(bar.getBoundingClientRect().height));
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  return h;
}

/**
 * Esc leaves focus mode (and scrolls back to the widget), else closes the inspector; not while typing in a field, or while a popover,
 * a menu or the Help is open (they take Esc themselves).
 */
function useEscape(now: { current: Now }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if ((e.target as Element | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector('dialog[open], [role="dialog"], [role="menu"]')) return;
      const { state, apply } = now.current;
      if (state.focus) {
        apply({ ...state, focus: "" });
        requestAnimationFrame(() => document.getElementById(state.focus)?.scrollIntoView({ block: "start" }));
      } else if (getSelection().frame) select(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * The right column: the selected frame (its issues, theme flags, note and actions), then its widget (what the info column held), or the
 * notes queue, on the
 * studio's tokens (`data-qa-ui`), outside every `[data-look]` and never an ancestor of a frame. Nothing selected: nothing drawn.
 */
export function Inspector({ now }: { now: { current: Now } }) {
  const sel = useSyncExternalStore(subscribe, () => getSelection().frame);
  const top = useBarHeight();
  useEscape(now);
  const target = resolve(sel);
  // a selection made with the change that draws its frame (focus mode's strip) is read before that frame is in the DOM: read it again
  const [, again] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (sel && !resolve(sel)) again();
  }, [sel]);
  if (!sel) return null;
  return (
    <aside
      data-qa-ui=""
      aria-label="Inspector"
      className="sticky z-10 w-88 shrink-0 self-start overflow-y-auto rounded-ui-lg border border-ui-subtle bg-ui-chrome p-3 font-ui text-ui-2 shadow-ui-menu"
      style={{ top: top + 12, maxHeight: `calc(100vh - ${top + 24}px)` }}
    >
      <button type="button" aria-label="Close the inspector (Esc)" title="Close the inspector (Esc)" onClick={() => select(null)} className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-ui-md text-ui-3 hover:bg-ui-hover hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-ui-accent">
        <X aria-hidden className="h-4 w-4" />
      </button>
      {!target ? (
        <p className="text-caption text-ui-3">{`${sel} is not on the page now (a filter, or other sizes).`}</p>
      ) : (
        <div className="space-y-5 pr-6">
          {target.queue && <NotesQueue now={now} />}
          {target.frame && <FramePart frame={target.frame} now={now} />}
          {target.mod && <WidgetPart mod={target.mod} now={now} frame={!!target.frame} />}
        </div>
      )}
    </aside>
  );
}
