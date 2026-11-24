import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { modules } from "@/modules";
import { INSERT_CATEGORIES } from "@/components/studio/insert-panel";
import { THEME_PRESETS, themeVars } from "@/lib/theme";
import { CLASSIC_LOOK, DEFAULT_SKIN_LOOK } from "@/looks/ids";
import { registerSampleCards } from "@/looks/sample-materials";
import { TEMPLATE_MODULES } from "@/widgets/registry";
import { Gallery, galleriesFor } from "./Gallery";
import { QaHelp } from "./Help";
import { TopBar, type BarPanel } from "./TopBar";
import { ChangesRow } from "./ChangesRow";
import { WidgetNav } from "./WidgetNav";
import { activeChanges } from "./changes";
import { copyText } from "./clipboard";
import { WidgetSection, type SectionChrome } from "./Section";
import { Inspector } from "./inspector";
import { forceMountAll, mountAllSettled } from "./Frame";
import { overflowReport, type Issue } from "./probe";
import { NOTES } from "./notes";
import { DEFAULT_STATE, frameRef, parseParams, parseSpans, placementSettings, serializeParams, widgetLinks, type QaState } from "./params";
import { filterModules, framePlan, groupByCategory, layoutPlans, mergedModules, pickModules, viewPlans } from "./plan";
import { installDemoStreams } from "./demo-streams";
import { adoptionReport, adoptionText, lookColours, type CheckOptions, type FrameFlags } from "./adoption";
import { diffSnapshots, qaSnapshot, type QaSnapshot, type TripDiff } from "./round-trip";
import { Surfaces } from "./Surfaces";
import { claudeText, installConsole, type Now } from "./console";
import { QaScreen, qaLookIds, useQaTheme, wornBackground, type QaTheme } from "./theme";

/**
 * Dev-only oracle and reference page for the widget library (`?widget-qa`): every registered widget (or exactly the
 * `module=` ids) at a set of spans and in each of its views, rendered through the kiosk's own `placementContent` from
 * fixture sensors and demo streams, grouped by category. One top bar drives every placement and mirrors itself to the
 * URL (params in `./params.ts`); each widget links to itself alone and to its skin and surface galleries.
 * `window.__qaOverflow()` lists what pokes out of its zone or overlaps (see _docs/redesign/phase9/qa.md).
 */

// Fixture data (the default) also gives the streaming widgets their OBS, chat, mixer, Stream Deck and agents demo data;
// `data=live` reads the server's own streams.
const DATA_PARAM = new URLSearchParams(window.location.search).get("data");
if (DATA_PARAM !== "live") installDemoStreams(DATA_PARAM === "stress");
// The sample themes' cards (`surface=look-…`): a config would load them on read, this page has none.
registerSampleCards();

/** The merged-away widgets, drawn as their placements migrate (`mergedModules`). */
const MERGED = mergedModules(TEMPLATE_MODULES);

const CATEGORY_ORDER = INSERT_CATEGORIES.filter((c) => !["All", "Layouts", "My panels"].includes(c));

// The page the studio's render check frames (`pack-check.tsx`): no toolbar and no `__qa*` tools. A chunk of its own: it brings the
// pack loader, and in this chunk the loader would land before a widget's first measure and change the overflow runner's markup (the
// order of a style's properties).
const PACK_CHECK = new URLSearchParams(window.location.search).has("pack-check");
const PackCheck = lazy(() => import("./pack-check"));

/** The fonts the adoption check holds a worn pack's text to: its Look's faces and the families its CSS names; none for a Look that is not a pack. */
function packFonts(theme: QaTheme): string[] {
  const pack = theme.pack;
  if (!pack) return [];
  return [...new Set([...Object.values(pack.look.fonts ?? {}).filter((f): f is string => !!f), ...(pack.css?.match(/pack-[\w-]+/g) ?? [])])];
}

/** Imports a pack folder or zip for this page only: checked as the studio's import checks it, worn as a candidate, never stored. */
async function importPack(files: FileList): Promise<{ id?: string; error?: string }> {
  const [{ checkImport, describeIssue, filesOfInput }, { wearCandidate }] = await Promise.all([import("@/looks/user-pack-import"), import("@/looks/user-packs")]);
  try {
    const report = checkImport(await filesOfInput(files));
    if (!report.ok) return { error: report.issues.filter((i) => i.severity === "error").map(describeIssue).join("; ") };
    const worn = wearCandidate(report.src);
    return worn ? { id: worn.id } : { error: "the pack could not be worn" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function WidgetQa() {
  const [state, setState] = useState(() => parseParams(window.location.search));
  const [imported, setImported] = useState("");
  const [panel, setPanel] = useState<BarPanel | "">("");
  const apply = (next: QaState) => {
    // The demo streams are installed before anything mounts, so a change of data source loads the page again.
    if (next.data !== state.data) return window.location.assign(serializeParams(next) + window.location.hash);
    setState(next);
    window.history.replaceState(null, "", serializeParams(next) + window.location.hash);
  };
  // The sections render after the browser's own jump to the hash, so jump once they exist (a copied frame link, a # link).
  useEffect(() => document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView({ block: "center" }), []);
  const theme = THEME_PRESETS.find((p) => p.name === state.theme);
  const worn = useQaTheme(state.look, state.lookVariant);
  // the adoption check runs under a worn Look only, never Classic's: its colours are what the others are held to
  const adoption = useMemo((): CheckOptions | undefined => (state.look && state.look !== CLASSIC_LOOK && state.look !== DEFAULT_SKIN_LOOK ? { colours: lookColours(worn.pack?.look, worn.pack?.css), fonts: packFonts(worn) } : undefined), [state.look, worn]);
  const spans = useMemo(() => parseSpans(state.spans), [state.spans]);
  const settings = useMemo(() => placementSettings(state), [state]);
  const picked = useMemo(() => pickModules([...modules, ...MERGED], [...TEMPLATE_MODULES, ...MERGED], state.module).filter((m) => !state.noted || NOTES[m.id]), [state.module, state.noted]);
  // focus mode (`focus=<id>`) draws that widget alone, inside the `module=` set
  const sections = useMemo(() => groupByCategory(state.focus ? picked.filter((m) => m.id === state.focus) : filterModules(picked, state.q), CATEGORY_ORDER), [picked, state.q, state.focus]);
  const shown = sections.reduce((n, s) => n + s.mods.length, 0);
  // the widget frames drawn: each shown widget's sizes at or over its minimum, its views and its layouts
  const frames = useMemo(() => sections.reduce((n, s) => n + s.mods.reduce((k, m) => k + framePlan(m, spans).filter((f) => !f.below).length + viewPlans(m).length + layoutPlans(m).length, 0), 0), [sections, spans]);
  const help = useRef<HTMLDialogElement>(null);
  const live = state.data === "live";
  // the page's tools read the state as it is now, not as it was when they were installed
  const now = useRef<Now>({ state, adoption, variants: worn.variants, apply });
  now.current = { state, adoption, variants: worn.variants, apply };
  // Copy for Claude from the page reads the frames mounted now: it never mounts the rest (`__qa.copyForClaude()` does)
  const claude = (id?: string) => claudeText(now, id, true);
  // the frames' chrome (section headers, selection, the sizes under the minimum, focus mode); entering or leaving focus lands on the widget
  const chrome: SectionChrome = {
    below: state.below,
    onBelow: () => apply({ ...state, below: true }),
    focus: state.focus,
    onFocus: (id) => {
      const at = id || state.focus;
      apply({ ...state, focus: id });
      requestAnimationFrame(() => document.getElementById(at)?.scrollIntoView({ block: "start" }));
    },
  };
  const view = { spans, cell: state.cell, gap: state.gap, live, eager: state.eager || !!state.module, settings, grid: state.grid, links: (id: string) => widgetLinks(state, id), frameRef: (id: string, key: string) => frameRef(state, id, key, `${window.location.origin}${window.location.pathname}`), appearance: worn.appearance, adoption, flagged: state.flagged, layouts: true, claude, chrome };
  const surfaceView = useMemo(() => ({ appearance: worn.appearance, live, adoption }), [worn.appearance, live, adoption]);
  useEffect(() => installTools(now), []);
  const galleryMod = state.gallery ? modules.find((m) => m.id === state.gallery) : undefined;
  const galleries = useMemo(() => galleriesFor(galleryMod), [galleryMod]);
  const style = theme ? ({ ...themeVars(theme.tokens), background: `hsl(${theme.tokens.background})`, color: `hsl(${theme.tokens.foreground})` } as CSSProperties) : undefined;
  // a pack that draws the page (its stage) shows through, as on a kiosk
  const pageBg = theme ? "" : wornBackground(worn) ? "text-zinc-100" : "bg-ui-app text-zinc-100";
  return (
    <QaScreen theme={worn} fx={state.fx} script={state.script}>
    <main className={`min-h-screen px-6 pb-10 ${pageBg}`} style={style}>
      {/* The page's own chrome (`data-qa-ui`): on the studio's tokens, solid, never under a `[data-look]` element, so no worn Look or
          page background restyles it, and never an ancestor of the frames, whose inherited colour the theme check reads. */}
      <header data-qa-ui="" className="sticky top-0 z-10 -mx-6 space-y-2 border-b border-ui-subtle bg-ui-chrome px-6 py-2.5 font-ui text-ui-2">
        <TopBar
          state={state}
          widgets={shown}
          frames={frames}
          looks={qaLookIds()}
          variants={worn.variants}
          lookName={worn.name}
          flagsChecked={!!adoption}
          imported={imported}
          onImport={(files) =>
            void importPack(files).then(({ id, error }) => {
              setImported(error ? `refused: ${error}` : `imported ${id}`);
              if (id) apply({ ...now.current.state, look: id, lookVariant: "" });
            })
          }
          onChange={(patch) => apply({ ...state, ...patch })}
          onReset={() => apply({ ...DEFAULT_STATE })}
          onHelp={() => help.current?.showModal()}
          onCopyLink={() => copyText(window.location.href)}
          onMountAll={mountAllSettled}
          claude={() => claude()}
          panel={panel}
          onPanel={setPanel}
        />
        <ChangesRow changes={activeChanges(state, { look: worn.name, variant: worn.variants.find((v) => v.id === state.lookVariant)?.name })} onClear={(patch) => apply({ ...state, ...patch })} onReset={() => apply({ ...DEFAULT_STATE })} />
        <WidgetNav state={state} sections={sections} onChange={(patch) => apply({ ...state, ...patch })} />
        <QaHelp dialog={help} />
      </header>
      {/* the frames, then the inspector beside them while something is selected */}
      <div className="flex items-start gap-6">
      <div className="min-w-0 flex-1">
      {state.surfaces && !state.module && !state.q && !state.focus && (
        <div id="surfaces" className="scroll-mt-32">
          <h2 className="mt-6 text-xs font-semibold uppercase tracking-wider opacity-70">Surfaces</h2>
          <Surfaces view={surfaceView} />
        </div>
      )}
      {/* in focus mode the widget's galleries are inline, under its frames */}
      <div id="galleries" className="scroll-mt-32 pt-4">
        {!state.focus && galleries.map((g) => (
          <Gallery key={`${g.title}-${g.module}`} def={g} base={settings} cell={state.cell} gap={state.gap} live={live} opened={!!galleryMod} />
        ))}
      </div>
      {sections.map((s) => (
        <div key={s.id}>
          <h2 id={s.id} className="mt-6 scroll-mt-32 text-xs font-semibold uppercase tracking-wider opacity-70">
            {s.category}
          </h2>
          {s.mods.map((m) => (
            <WidgetSection key={m.id} mod={m} view={view} />
          ))}
        </div>
      ))}
      </div>
      <Inspector now={now} />
      </div>
    </main>
    </QaScreen>
  );
}

/** Lets a wear land: the pack's chunk, its CSS and the frames' measures (`mountAllSettled`), then a second for the pack's motion. */
async function settleWear(): Promise<void> {
  await new Promise((r) => setTimeout(r, 1500));
  await mountAllSettled();
  await new Promise((r) => setTimeout(r, 1000));
}

/**
 * The page's theme tools, beside `__qaOverflow`: `__qaAdoption(only)` (each frame's flags under the worn Look, or only the frames whose
 * name starts with `only`, and the report as text),
 * `__qaSetLook(look, variant)` and `__qaRoundTrip(look, variant)`: from the Look worn now (load the page with it, so it is a fresh
 * load), wear the other and come back, then list what stayed (`round-trip.ts`).
 */
function installTools(now: { current: Now }) {
  if (PACK_CHECK) return;
  window.__qaAdoption = (only) => {
    const o = now.current.adoption;
    const report = o ? adoptionReport(o, only) : [];
    return { look: now.current.state.look, report, text: o ? adoptionText(report) : "no Look but Classic's worn: load the page with look=<id>" };
  };
  window.__qaSetLook = async (look, lookVariant = "") => {
    flushSync(() => now.current.apply({ ...now.current.state, look, lookVariant }));
    await settleWear();
  };
  window.__qaRoundTrip = async (look, lookVariant = "") => {
    const { look: from, lookVariant: fromVariant } = now.current.state;
    await settleWear();
    const fresh = qaSnapshot();
    await new Promise((r) => setTimeout(r, 1500));
    const still = qaSnapshot();
    await window.__qaSetLook?.(look, lookVariant);
    await window.__qaSetLook?.(from, fromVariant);
    return { from: `${from || "none"}${fromVariant ? `/${fromVariant}` : ""}`, via: `${look || "none"}${lookVariant ? `/${lookVariant}` : ""}`, diff: diffSnapshots(fresh, qaSnapshot(), still) };
  };
  installConsole(now);
}

declare global {
  interface Window {
    __qaOverflow?: () => { module: string; span: string; issues: Issue[] }[];
    __qaMountAll?: () => Promise<boolean>;
    __qaAdoption?: (only?: string) => { look: string; report: FrameFlags[]; text: string };
    __qaSetLook?: (look: string, variant?: string) => Promise<void>;
    __qaRoundTrip?: (look: string, variant?: string) => Promise<{ from: string; via: string; diff: TripDiff }>;
    __qaSnapshot?: () => QaSnapshot;
  }
}

// Frames mount lazily. `__qaOverflow` mounts the rest itself so it always covers every figure, but
// widgets measure after mounting: `await __qaMountAll()` first (or load with `module=` / `eager=1`) to let them settle.
if (!PACK_CHECK) {
  window.__qaMountAll = mountAllSettled;
  window.__qaSnapshot = qaSnapshot;
  window.__qaOverflow = () => {
    flushSync(forceMountAll);
    return overflowReport();
  };
}

function PackCheckPage() {
  return (
    <Suspense fallback={null}>
      <PackCheck />
    </Suspense>
  );
}

export default PACK_CHECK ? PackCheckPage : WidgetQa;
