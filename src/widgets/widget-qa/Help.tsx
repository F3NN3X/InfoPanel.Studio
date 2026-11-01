import { useRef } from "react";

/** What each toolbar control does, in the toolbar's order. */
const CONTROLS: [string, string][] = [
  ["Filter", "Shows only the widgets whose id or title contains the text."],
  ["skin", "The skin every widget is drawn in. Blank is the default skin."],
  ["variant", "studio is the dense view (smaller type, more rows); default is the standard one."],
  ["surface", "The material behind each widget (glass, matte, match theme, then the generic surfaces). Blank uses the skin's own card."],
  ["graph", "The style of every graph and sparkline a widget draws (area, line, step, bars, dots, braille). Blank lets each widget choose."],
  ["meter", "The style of every meter and progress bar (bar, pill, segments, blocks, hair, wave, square). Blank lets each widget choose."],
  ["accent", "The accent colour for every widget. Click a swatch again to clear it; the picker sets any colour."],
  ["radius", "The card's corner radius."],
  ["cell", "The size of one grid cell in px. 110 is the default kiosk grid, 150 a large one."],
  ["gap", "The space between grid cells in px, which a span larger than 1 includes."],
  ["spans", "The sizes each widget is shown at, as columns x rows (2x1 is two cells wide, one tall). A size under the widget's minimum shows as a dimmed placeholder."],
  ["page", "The page's theme. paper is the light check."],
  ["gallery", "The widget the Skins and Surfaces galleries show, at its default size. Blank shows CpuMonitor and SystemStatus."],
  ["data", "fixtures is the same demo data every time (sensors, OBS, chat, Wave Link, Stream Deck, agents). stress is that data at its extremes: percentages at 100, other readings ten times larger, long names and text, more sessions. live reads your sensors and streams. Changing it reloads the page."],
  ["grid", "Draws the grid over every frame: the dashed squares are cells, the space between them the gap."],
  ["noted only", "Shows only the widgets with redesign notes."],
  ["Reset", "Puts every control back to its default."],
];

/** What the rest of the page shows. */
const PAGE: [string, string][] = [
  ["Widget section", "One per widget: its title, id, links, category, minimum and default size, description, views, tags and data prefixes, then the frames."],
  ["Settings", "Under the info column, every setting as the studio inspector files it: by tab (Show, Style, Data, Behaviour) and section. General sections, the same on every widget, are marked; the widget's own rows are bright, the general ones dim."],
  ["Frames", "Each caption is the span and its size in px. Frames are drawn by the kiosk's own renderer, so what you see here is what a dashboard shows."],
  ["Copy a frame", "Click a caption to copy a reference to that frame (\"CodingAgents 2x1 (cell 110, skin default)\" and a link that opens it). Paste it into a request so it names exactly that frame."],
  ["Issue badge", "A red count beside a caption: things in the frame that overflow, overlap or are clipped, checked once the widget has settled. Hover it for the list."],
  ["Notes", "Redesign notes, in amber under their frame and in the widget's info column. They live in src/widgets/widget-qa/notes.json, by widget id and then span (2x1), view (view:gauge) or * for the whole widget."],
  ["Views", "A widget with more than one view (layout) also gets a row of them, each at that view's default size."],
  ["solo", "Opens the widget alone, keeping the toolbar."],
  ["skins & surfaces", "Opens this widget in the Skins and Surfaces galleries."],
  ["#", "A link to this widget's section, to share or bookmark."],
  ["URL", "Every control is mirrored to the URL, so a copied link opens exactly this view."],
  ["Console", "window.__qaOverflow() lists what overflows, overlaps or is clipped in each frame; await window.__qaMountAll() first."],
  ["Screenshots", "npm run qa:shots writes a PNG per widget, span, view and skin to .cache/qa-shots/<label>/; npm run qa:shots -- --compare before after writes a page of the two side by side, changed first (see docs/redesign/phase9/qa.md)."],
];

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
      {rows.map(([term, text]) => (
        <div key={term} className="contents">
          <dt className="font-mono opacity-70">{term}</dt>
          <dd className="m-0">{text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The `?` button and the dialog it opens: what each control and each part of the page does. */
export function QaHelp({ background }: { background: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" aria-label="Help" title="What the controls do" onClick={() => ref.current?.showModal()} className="h-6 w-6 rounded-full border border-current/25 text-[11px] font-semibold">
        ?
      </button>
      <dialog
        ref={ref}
        aria-label="Widget QA help"
        // A click on the backdrop (the dialog element itself, outside its panel) closes it.
        onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
        className="m-auto max-h-[85vh] w-[min(42rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-current/20 p-0 text-inherit backdrop:bg-black/50 backdrop:backdrop-blur-sm"
        style={{ background }}
      >
        <div className="space-y-4 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Widget QA</h2>
            <button type="button" onClick={() => ref.current?.close()} className="text-xs opacity-70 hover:opacity-100">
              Close
            </button>
          </div>
          <p className="text-xs opacity-80">Every registered widget, drawn the way a dashboard draws it, to test and to use as the reference for redesigns. The toolbar applies to every widget at once.</p>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider opacity-60">Toolbar</h3>
          <Rows rows={CONTROLS} />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider opacity-60">The page</h3>
          <Rows rows={PAGE} />
        </div>
      </dialog>
    </>
  );
}
