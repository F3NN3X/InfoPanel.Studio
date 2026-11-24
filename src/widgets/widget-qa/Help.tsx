import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { CONTROL_GROUP, CONTROL_HELP, HELP_GROUPS, type ControlId } from "./help-text";

/** The top bar's controls by group, in the bar's order: the same lines their tooltips show. */
const GROUPS = HELP_GROUPS.map((g) => [g, (Object.keys(CONTROL_HELP) as ControlId[]).filter((id) => CONTROL_GROUP[id] === g).map((id): [string, string] => [CONTROL_HELP[id].name, CONTROL_HELP[id].text])] as const);

/** What the rest of the page shows. */
const PAGE: [string, string][] = [
  ["Summary", "Beside the title: the widgets and frames shown, then the issues and theme flags in the frames checked so far. Frames are checked as they scroll into view; Check all mounts the rest. The issues count turns on the Issues filter and the theme flags count the Theme flags filter, as the widget list's chips do."],
  ["Active changes", "Under the bar, every setting not at its default as a chip: its × puts that one back, Reset all puts them all back. Nothing set, no row."],
  ["Widget header", "One line per widget over its frames: its title (click it to inspect the widget), id and category, the issues and theme flags its checked frames found and its notes, then Focus, Solo (the widget alone, keeping the settings), Copy link (to its section) and Copy for Claude (its mounted frames as text for Claude: each frame with an issue, a theme flag or a note, with its link, files, settings and the report command that reads it again)."],
  ["Frames", "Each caption is the span and its size in px. Frames are drawn by the kiosk's own renderer, so what you see here is what a dashboard shows. The sizes under a widget's minimum are hidden behind one line (\"2 sizes under the minimum\"), which shows them (below=1)."],
  ["Select a frame", "Click a frame or its caption to select it: it gets a ring and the inspector opens on the right. On a focused caption, Enter selects and c copies a reference to the frame (\"CodingAgents 2x1 (cell 110, skin default)\" and a link that opens it)."],
  ["Frame menu", "The ⋯ over a frame's corner when you hover it: Inspect, Copy reference, Copy link and Copy for Claude."],
  ["Inspector", "The selected frame's issues (hover one to outline its element in the frame), theme flags, note and actions (Copy for Claude, Copy reference, Copy link, Open solo, Open in galleries), then its widget: category, minimum and default size, the data it reads, blurb, description, tags, views and layouts, notes, its files as paths to copy, and its settings as the studio inspector files them (by tab and section, searchable, its own rows apart from the general ones). Esc or × closes it."],
  ["Issue badge", "A red count beside a caption, and a red outline on the frame: things in the frame that overflow, overlap or are clipped, checked once the widget has settled. The inspector lists them."],
  ["Theme flags", "Under a worn Look, an amber count beside a caption and an amber corner on the frame: what it draws that is not the Look's. The inspector lists them."],
  ["Notes", "Redesign notes, in amber under their frame (dimmed once fixed) and in the inspector, where a frame's Note adds, edits, marks fixed or deletes it. Each is open (to do) or fixed (waiting to be removed). They live in src/widgets/widget-qa/notes.json, by widget id and then span (2x1), view (view:gauge) or * for the whole widget: under npm run dev the inspector saves them there; on a build (the app's debug server) it copies the widget's notes as JSON to paste in."],
  ["Views", "A widget with more than one view (layout) also gets a row of them, each at that view's default size."],
  ["Focus mode", "A widget's Focus (focus=<id>): that widget alone, a strip that steps its frame through the sizes (‹ ›), and its Skins and Surfaces galleries inline. Esc leaves it."],
  ["Copy for Claude", "In the top bar, the same for every frame checked so far. A frame not mounted yet is counted, not read; npm run qa:report reads them all."],
  ["URL", "Every control is mirrored to the URL, so a copied link opens exactly this view. Each control's tooltip names its param. eager=1 mounts every frame on load; it has no control but its chip (⋯ › Mount every frame now does it once)."],
  ["Console", "window.__qa.help() lists the page's tools: state(), set(patch), select(frame), report(filter), notes(which) (the notes queue), copyForClaude(target), options(), and the older __qaOverflow, __qaMountAll, __qaAdoption, __qaSetLook, __qaRoundTrip and __qaSnapshot as members."],
  ["Report", "npm run qa:report -- --module CpuMonitor --look cyberspec/crimson prints every frame's issues, theme flags and note as JSON (--md: as Copy for Claude text); --shots <dir> writes a PNG of only the frames it lists; --notes lists the open notes, each with the command that reads its frame. --help lists the flags."],
  ["Screenshots", "npm run qa:shots writes a PNG per widget, span, view and skin to .cache/qa-shots/<label>/ (--frames-only: the frame's box alone, without its caption); npm run qa:shots -- --compare before after writes a page of the two side by side, changed first (see _docs/redesign/phase9/qa.md)."],
  ["Widget list", "The left column: the search, the Issues, Theme flags and Notes chips, then every shown widget by category (click a heading to fold it), the merged-away ones last, each marked with the widget it merged into. A row scrolls to its widget and makes it current; j and k move to the next and previous one. The summary's issues count turns on Issues too."],
  ["Status dots", "Beside each widget in the list: red when a checked frame has an issue, amber when one has a theme flag, filled grey when every checked frame is clean, hollow when none is checked yet. ✎ marks a widget with an open note, ✓ one whose notes are all fixed."],
  ["App surfaces, Skins & surfaces", "The first two entries of the list. App surfaces scrolls to the app's own surfaces, drawn after the widgets. Skins & surfaces opens the current widget in the Skins and Surfaces galleries (gallery=), after the surfaces."],
];

function Rows({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-caption">
      {rows.map(([term, text]) => (
        <div key={term} className="contents">
          <dt className="text-ui-1">{term}</dt>
          <dd className="m-0 text-ui-2">{text}</dd>
        </div>
      ))}
    </dl>
  );
}

const HEADING = "text-micro font-semibold uppercase tracking-wider text-ui-3";

/** The Help dialog (⋯ › Help): what each control and each part of the page does. The reference; each control's tooltip says it at the point of use. */
export function QaHelp({ dialog }: { dialog: RefObject<HTMLDialogElement | null> }) {
  return (
    <dialog
      ref={dialog}
      aria-label="Widget QA help"
      data-qa-ui=""
      // A click on the backdrop (the dialog element itself, outside its panel) closes it.
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      className="m-auto max-h-[85vh] w-[min(44rem,calc(100vw-2rem))] overflow-auto rounded-ui-lg border border-ui-menu bg-ui-raised p-0 font-ui text-ui-2 shadow-ui-modal backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-body font-semibold text-ui-1">Widget QA</h2>
          <Button variant="ghost" small onClick={() => dialog.current?.close()}>
            Close
          </Button>
        </div>
        <p className="text-caption">Every registered widget, drawn the way a dashboard draws it, to test and to use as the reference for redesigns. The top bar applies to every widget at once; hover or focus a control for what it does.</p>
        {GROUPS.map(([group, rows]) => (
          <div key={group} className="space-y-1.5">
            <h3 className={HEADING}>{group}</h3>
            <Rows rows={rows} />
          </div>
        ))}
        <h3 className={HEADING}>The page</h3>
        <Rows rows={PAGE} />
      </div>
    </dialog>
  );
}
