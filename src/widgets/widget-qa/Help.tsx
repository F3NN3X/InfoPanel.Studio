import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { CONTROL_GROUP, CONTROL_HELP, HELP_GROUPS, type ControlId } from "./help-text";

/** The top bar's controls by group, in the bar's order: the same lines their tooltips show. */
const GROUPS = HELP_GROUPS.map((g) => [g, (Object.keys(CONTROL_HELP) as ControlId[]).filter((id) => CONTROL_GROUP[id] === g).map((id): [string, string] => [CONTROL_HELP[id].name, CONTROL_HELP[id].text])] as const);

/** What the rest of the page shows. */
const PAGE: [string, string][] = [
  ["Summary", "Beside the title: the widgets and frames shown, then the issues and theme flags in the frames checked so far. Frames are checked as they scroll into view; Check all mounts the rest. The theme flags count turns on Theme flags only."],
  ["Active changes", "Under the bar, every setting not at its default as a chip: its × puts that one back, Reset all puts them all back. Nothing set, no row."],
  ["Widget section", "One per widget: its title, id, links, category, minimum and default size, description, views, tags and data prefixes, then the frames."],
  ["Settings", "Under the info column, every setting as the studio inspector files it: by tab (Show, Style, Data, Behaviour) and section. General sections, the same on every widget, are marked; the widget's own rows are bright, the general ones dim."],
  ["Frames", "Each caption is the span and its size in px. Frames are drawn by the kiosk's own renderer, so what you see here is what a dashboard shows."],
  ["Copy a frame", "Click a caption to copy a reference to that frame (\"CodingAgents 2x1 (cell 110, skin default)\" and a link that opens it). Paste it into a request so it names exactly that frame."],
  ["Issue badge", "A red count beside a caption: things in the frame that overflow, overlap or are clipped, checked once the widget has settled. Hover it for the list."],
  ["Notes", "Redesign notes, in amber under their frame and in the widget's info column. They live in src/widgets/widget-qa/notes.json, by widget id and then span (2x1), view (view:gauge) or * for the whole widget."],
  ["Views", "A widget with more than one view (layout) also gets a row of them, each at that view's default size."],
  ["solo", "Opens the widget alone, keeping the top bar's settings."],
  ["skins & surfaces", "Opens this widget in the Skins and Surfaces galleries."],
  ["#", "A link to this widget's section, to share or bookmark."],
  ["for Claude", "Copies this widget's mounted frames as text for Claude: each frame with an issue, a theme flag or a note, with its link, files, settings and the report command that reads it again."],
  ["Copy for Claude", "In the top bar, the same for every frame checked so far. A frame not mounted yet is counted, not read; npm run qa:report reads them all."],
  ["URL", "Every control is mirrored to the URL, so a copied link opens exactly this view. Each control's tooltip names its param. eager=1 mounts every frame on load; it has no control but its chip (⋯ › Mount every frame now does it once)."],
  ["Console", "window.__qa.help() lists the page's tools: state(), set(patch), select(frame), report(filter), copyForClaude(target), options(), and the older __qaOverflow, __qaMountAll, __qaAdoption, __qaSetLook, __qaRoundTrip and __qaSnapshot as members."],
  ["Report", "npm run qa:report -- --module CpuMonitor --look cyberspec/crimson prints every frame's issues, theme flags and note as JSON (--md: as Copy for Claude text); --shots <dir> writes a PNG of only the frames it lists. --help lists the flags."],
  ["Screenshots", "npm run qa:shots writes a PNG per widget, span, view and skin to .cache/qa-shots/<label>/ (--frames-only: the frame's box alone, without its caption); npm run qa:shots -- --compare before after writes a page of the two side by side, changed first (see _docs/redesign/phase9/qa.md)."],
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
