import { flushSync } from "react-dom";
import { WIDGET_MERGES } from "@/lib/settings-migrate.v19";
import type { ResolvedVariant } from "@/looks/look";
import { ADOPTION_SELECTOR, checkAdoption, type CheckOptions } from "./adoption";
import { buildReport, filterFrames, frameMarkdown, frameName, noteEntries, reportMarkdown, type FrameKind, type NoteEntry, type QaFrame, type QaReport, type ReportContext, type ReportFilter, type ReportFrame, type WidgetFiles } from "./claude";
import { copyText } from "./clipboard";
import { WIDGET_FILES } from "./files.generated";
import { mountAllSettled } from "./Frame";
import { allNotes, notesFor, noteStatus, noteText, type NoteStatus } from "./notes";
import { ACCENTS, CELLS, FX, GALLERY_IDS, GRAPHS, METERS, PAGE_THEMES, RADII, SKINS, SURFACES, VARIANTS } from "./options";
import { DATA, type QaState } from "./params";
import { probeBox } from "./probe";
import { select } from "./selection";
import { qaLookIds } from "./theme";

/** What the console reads: the page's state, its theme check and the worn Look's variants as they are now, and the way to change them. */
export interface Now {
  state: QaState;
  adoption?: CheckOptions;
  variants: readonly ResolvedVariant[];
  apply: (next: QaState) => void;
}

/** What `__qa.options()` lists: every value the top bar's controls offer, so a tool reads them without opening one. */
export interface QaOptions {
  looks: string[];
  lookVariants: string[];
  fx: string[];
  skins: readonly string[];
  variants: string[];
  surfaces: readonly string[];
  graphs: string[];
  meters: string[];
  radii: string[];
  accents: string[];
  cells: number[];
  themes: string[];
  galleries: string[];
  data: string[];
}

export interface QaConsole {
  help: () => string;
  state: () => QaState;
  set: (patch: Partial<QaState>) => QaState;
  select: (frame: string) => Promise<ReportFrame | undefined>;
  report: (filter?: ReportFilter) => Promise<QaReport>;
  notes: (which?: NoteStatus | "all") => NoteEntry[];
  markdown: (filter?: ReportFilter) => Promise<string>;
  copyForClaude: (target?: string, opts?: { checked?: boolean }) => Promise<string>;
  options: () => QaOptions;
  overflow?: Window["__qaOverflow"];
  mountAll?: Window["__qaMountAll"];
  snapshot?: Window["__qaSnapshot"];
  adoption?: Window["__qaAdoption"];
  setLook?: Window["__qaSetLook"];
  roundTrip?: Window["__qaRoundTrip"];
}

declare global {
  interface Window {
    __qa?: QaConsole;
  }
}

const HELP: [string, string][] = [
  ["help()", "this list"],
  ["state()", "the page's settings (the URL params as values)"],
  ["set(patch)", "change settings, as the top bar does: set({ look: 'cyberspec', lookVariant: 'crimson' }); a change of data reloads the page"],
  ["select(frame)", "scroll to a frame, open it in the inspector and return its entry: 'CpuMonitor 2x1', 'CpuMonitor--view-gauge' or 'surface:rail'"],
  ["report(filter)", "mount every frame and return the JSON tools/qa/report.mjs prints; filter { module, frame, all, notes, checked }"],
  ["markdown(filter)", "the same report as Copy for Claude text"],
  ["notes(which)", "the notes queue: the open notes ('fixed' or 'all' for the rest), each with its reference, link and report command"],
  ["copyForClaude(target)", "copy and return the Copy for Claude text of a frame, a widget (its id) or, with no target, the page"],
  ["options()", "every value the top bar offers: looks, skins, surfaces, graphs, meters, radii, themes, galleries, data"],
  ["overflow()", "= __qaOverflow(): what pokes out, overlaps or is cut off, per span frame (mounts every frame)"],
  ["mountAll()", "= __qaMountAll(): mount every frame and wait for the page to settle; false if it did not"],
  ["snapshot()", "= __qaSnapshot(): the page's sheets, root properties and frame colours, for round trips"],
  ["adoption(only)", "= __qaAdoption(only): each frame's theme flags under the worn Look, and the report as text"],
  ["setLook(look, variant)", "= __qaSetLook(): wear a Look and wait for it to land"],
  ["roundTrip(look, variant)", "= __qaRoundTrip(): wear another Look and come back; what stayed"],
];

const MERGED_INTO = new Map<string, string>(WIDGET_MERGES.map((m) => [m.from, m.to]));
/** The group widgets: a component beside the registry group that lists them. */
const GROUPED = new Set(["SensorValue", "CustomGauge"]);

/**
 * Where a widget's code lives: its folder and files (`files.generated.ts`, `npm run widgets:gen`; a merged-away widget's survivor's),
 * or a group widget's files; a legacy widget: none.
 */
export function widgetFiles(id: string): WidgetFiles | undefined {
  const own = WIDGET_FILES[MERGED_INTO.get(id) ?? id];
  if (own) return { folder: `src/widgets/${own.folder}/`, files: own.files };
  if (GROUPED.has(id)) return { folder: "src/widgets/", files: [`${id}.tsx`, "registry/b.ts"] };
  return undefined;
}

/** What a frame on the page is: its widget, its key and its kind, from its `data-qa-*` attributes. */
export function partsOf(el: Element): { module: string; key: string; kind: FrameKind } {
  const surface = el.getAttribute("data-qa-surface");
  if (surface) return { module: "", key: `surface:${surface}`, kind: "surface" };
  const view = el.getAttribute("data-qa-view");
  if (view) return { module: el.getAttribute("data-qa-view-of") ?? "", key: `view:${view}`, kind: "view" };
  const layout = el.getAttribute("data-qa-layout");
  if (layout) return { module: el.getAttribute("data-qa-layout-of") ?? "", key: `layout:${layout}`, kind: "layout" };
  return { module: el.getAttribute("data-qa-module") ?? "", key: el.getAttribute("data-qa-span") ?? "", kind: "span" };
}

/** The page's frames (spans, views, layouts, surfaces; none in a hidden section), as named and sized, before anything is read. */
function framesOnPage(): { el: Element; frame: QaFrame }[] {
  return [...document.querySelectorAll(ADOPTION_SELECTOR)]
    .filter((el) => !el.closest("[hidden]"))
    .map((el) => {
      const { module, key, kind } = partsOf(el);
      const box = el.querySelector("[data-qa-box]") ?? el;
      const r = box.getBoundingClientRect();
      const note = module ? notesFor(module)?.[key] : undefined;
      const frame: QaFrame = { frame: frameName(module, key), id: el.id, module, key, kind, size: [Math.round(r.width), Math.round(r.height)], checked: box.childElementCount > 0, issues: [], flags: [], ...(note ? { note: noteText(note), noteStatus: noteStatus(note) } : {}) };
      return { el, frame };
    });
}

/** Reads the kept frames: the probe on a widget frame (a surface is not probed, as the page does not), the theme check under a worn Look. */
function readFrames(now: { current: Now }, filter: ReportFilter): QaFrame[] {
  const all = framesOnPage();
  const kept = new Set(filterFrames(all.map((x) => x.frame), filter));
  const o = now.current.adoption;
  const read = all.filter(({ frame }) => kept.has(frame)).map(({ el, frame }) => ({ el, frame, box: el.querySelector("[data-qa-box]") ?? el }));
  // Every probe before any theme check: the check writes a probe element into each card (`cardPalette`), and a layout read after
  // a write lays the whole page out again, so interleaving the two costs a page layout per element.
  const issues = read.map(({ frame, box }) => (frame.checked && frame.kind !== "surface" ? probeBox(box) : []));
  return read.map(({ el, frame, box }, i) => (frame.checked ? { ...frame, issues: issues[i], flags: o ? checkAdoption(box, { ...o, chrome: el.hasAttribute("data-qa-chrome") }) : [] } : frame));
}

function contextOf(now: { current: Now }): ReportContext {
  return { state: now.current.state, base: `${window.location.origin}${window.location.pathname}`, flagsChecked: !!now.current.adoption, files: widgetFiles, notes: allNotes() };
}

async function reportOf(now: { current: Now }, filter: ReportFilter = {}): Promise<QaReport> {
  if (!filter.checked) await mountAllSettled();
  return buildReport(readFrames(now, filter), filter, contextOf(now));
}

/** The Copy for Claude text of one frame, one widget (an id that names a section) or the page; `checked`: the mounted frames only. */
export async function claudeText(now: { current: Now }, target?: string, checked = false): Promise<string> {
  const ctx = contextOf(now);
  const isWidget = !!target && document.getElementById(target)?.tagName === "SECTION";
  if (target && !isWidget) {
    if (!checked) await mountAllSettled();
    const [frame] = readFrames(now, { frame: target });
    return frame ? frameMarkdown(frame, ctx) : `Widget QA · no frame named ${target} on this page`;
  }
  const filter: ReportFilter = { ...(isWidget ? { module: target } : {}), checked };
  return reportMarkdown(await reportOf(now, filter), ctx, isWidget ? `widget ${target}` : "the page");
}

/** `window.__qa`: the page's console namespace; the six `__qa*` globals stay, as the same functions. */
export function installConsole(now: { current: Now }): void {
  window.__qa = {
    help: () => {
      const text = ["window.__qa: the Widget QA page's tools (_docs/redesign/phase9/qa.md)", ...HELP.map(([name, line]) => `  ${name.padEnd(26)}${line}`)].join("\n");
      console.info(text);
      return text;
    },
    state: () => ({ ...now.current.state }),
    set: (patch) => {
      flushSync(() => now.current.apply({ ...now.current.state, ...patch }));
      return { ...now.current.state };
    },
    select: async (ref) => {
      const at = framesOnPage().find(({ frame }) => filterFrames([frame], { frame: ref }).length > 0);
      if (!at) return undefined;
      at.el.scrollIntoView({ block: "center" });
      // and open it in the inspector (`selection.ts`: a frame by its anchor, a surface by its key)
      select(at.frame.id || at.frame.key);
      if (!at.frame.checked) await mountAllSettled();
      return buildReport(readFrames(now, { frame: ref }), { frame: ref, all: true, checked: true }, contextOf(now)).frames[0];
    },
    report: (filter) => reportOf(now, filter),
    notes: (which = "open") => noteEntries(contextOf(now), which),
    markdown: async (filter = {}) => reportMarkdown(await reportOf(now, filter), contextOf(now)),
    copyForClaude: async (target, opts) => {
      const text = await claudeText(now, target, opts?.checked);
      await copyText(text);
      return text;
    },
    options: () => ({ looks: qaLookIds(), lookVariants: now.current.variants.map((v) => v.id), fx: [...FX], skins: SKINS, variants: [...VARIANTS], surfaces: SURFACES, graphs: [...GRAPHS], meters: [...METERS], radii: [...RADII], accents: [...ACCENTS], cells: [...CELLS], themes: [...PAGE_THEMES], galleries: [...GALLERY_IDS], data: [...DATA] }),
    overflow: window.__qaOverflow,
    mountAll: window.__qaMountAll,
    snapshot: window.__qaSnapshot,
    adoption: window.__qaAdoption,
    setLook: window.__qaSetLook,
    roundTrip: window.__qaRoundTrip,
  };
}
