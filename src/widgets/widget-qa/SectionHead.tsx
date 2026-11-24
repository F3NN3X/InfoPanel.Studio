import type { DashboardModule } from "@/modules/types";
import { ClaudeButton } from "./ClaudeButton";
import { notesFor } from "./notes";
import type { SectionChrome, View } from "./Section";
import { select } from "./selection";
import { useSectionTally } from "./tally";

// Whole-pixel rows (24 px actions, a 20 px title line): a half-pixel header puts every frame under it on a half pixel, which
// shifts its pixels (classic.spec's row images are a pixel taller).
const ACTION = "inline-flex h-6 items-center rounded-ui-sm px-1.5 text-micro text-ui-2 hover:bg-ui-hover hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-ui-accent";
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/**
 * A widget's one-line header, on the studio's tokens (`data-qa-ui`): its title (which selects the widget in the inspector), id and
 * category, what its checked frames found and its notes, then Focus, Solo, Copy link and Copy for Claude. The counts stay in the DOM
 * when they are zero (hidden), so a frame reporting changes text, never the element count `mountAllSettled` waits on.
 */
export function SectionHead({ mod, view, chrome }: { mod: DashboardModule; view: View; chrome: SectionChrome }) {
  const t = useSectionTally(mod.id);
  const notes = Object.keys(notesFor(mod.id) ?? {}).length;
  const focused = chrome.focus === mod.id;
  return (
    <div data-qa-ui="" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-ui-md border border-ui-subtle bg-ui-chrome px-3 py-1.5 font-ui text-caption text-ui-2">
      <h3 className="m-0 text-body leading-5 font-semibold text-ui-1">
        <button type="button" title="Inspect this widget" onClick={() => select(mod.id)} className="rounded-ui-sm hover:underline focus-visible:outline-2 focus-visible:outline-ui-accent">
          {mod.title}
        </button>
      </h3>
      <span className="font-ui-mono text-micro text-ui-3">{mod.id}</span>
      <span className="text-micro text-ui-3">{mod.category ?? "Generic"}</span>
      <span hidden={!t.issues} className="text-micro font-medium text-ui-danger-text">
        {plural(t.issues, "issue")}
      </span>
      <span hidden={!t.flags} className="text-micro font-medium text-ui-warn-text">
        {plural(t.flags, "theme flag")}
      </span>
      {notes > 0 && <span className="text-micro text-ui-3">{plural(notes, "note")}</span>}
      <span className="ml-auto flex items-center gap-1">
        <button type="button" aria-pressed={focused} title={focused ? "Leave focus mode (Esc)" : "This widget alone, with a size strip and its galleries inline (focus=)"} onClick={() => chrome.onFocus(focused ? "" : mod.id)} className={`${ACTION} ${focused ? "bg-ui-active text-ui-1" : ""}`}>
          {focused ? "Leave focus" : "Focus"}
        </button>
        <a href={view.links(mod.id).solo} title="Open this widget alone, keeping the settings (module=)" className={ACTION}>
          Solo
        </a>
        <ClaudeButton text={async () => `${window.location.href.split("#")[0]}#${mod.id}`} title="Copy a link to this widget's section" className={ACTION} label="Copy link" />
        {view.claude && <ClaudeButton text={() => view.claude!(mod.id)} title="Copy this widget's frames, with what they found, as text for Claude" className={ACTION} />}
      </span>
    </div>
  );
}
