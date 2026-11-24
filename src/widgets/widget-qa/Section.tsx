import { useEffect, useState, useSyncExternalStore } from "react";
import { migratePlacementV19 } from "@/lib/settings-migrate.v19";
import { LAYOUT_KEY } from "../layouts";
import { checkAdoption, type CheckOptions, type Flag } from "./adoption";
import type { Appearance } from "@/lib/style-resolve";
import type { DashboardModule, ModuleSettings } from "@/modules/types";
import { copyText } from "./clipboard";
import { withDemo } from "./demo-settings";
import { FocusStrip, InlineGalleries } from "./Focus";
import { Frame } from "./Frame";
import { FrameMenu } from "./FrameMenu";
import { forgetRead, readFrame } from "./inspector/reads";
import { notesFor } from "./notes";
import { frameId } from "./params";
import { framePlan, layoutPlans, placement, spanSize, viewPlans } from "./plan";
import { probeElements, type Issue } from "./probe";
import { SectionHead } from "./SectionHead";
import { getSelection, select, subscribe } from "./selection";
import { forgetFrame, tallyFrame } from "./tally";

export interface View {
  spans: [number, number][];
  cell: number;
  gap: number;
  live: boolean;
  eager: boolean;
  settings: ModuleSettings;
  /** A widget's own links (`widgetLinks`). */
  links: (id: string) => { solo: string; skins: string };
  /** What a frame's caption copies (`frameRef`). */
  frameRef: (id: string, key: string) => { text: string; url: string };
  /** Draw the grid cells over every frame. */
  grid: boolean;
  /** The screen level every frame resolves under (a worn Look); unset: none. */
  appearance?: Appearance;
  /** Run the theme-adoption check on each frame once it settles and badge what it flags (`adoption.ts`); unset: no check. */
  adoption?: CheckOptions;
  /** Only the widgets the check flags: a widget whose every frame came back clean is hidden. */
  flagged?: boolean;
  /** Draw a widget's layouts row (`LAYOUTS`) under its views. */
  layouts?: boolean;
  /** A widget's or a frame's Copy for Claude text (`claudeText`); unset (the render check's page): no button. */
  claude?: (id: string) => Promise<string>;
  /** The page's own chrome around the frames; unset (the render check's page): the frames alone, as before. */
  chrome?: SectionChrome;
}

/**
 * What the QA page draws around a widget's frames (`data-qa-ui`, outside every `[data-qa-box]`): the section header, the frames'
 * hover menu and selection (they open the inspector), the line for the sizes under the minimum and focus mode.
 */
export interface SectionChrome {
  /** Draw the sizes under a widget's minimum as placeholders (`below=1`); else one line counts them, and shows them. */
  below: boolean;
  onBelow: () => void;
  /** The focused widget (`focus=`), "" for none. */
  focus: string;
  onFocus: (id: string) => void;
}

// What the adoption check found per frame (by frame id), for the "flagged only" filter; a frame not read yet is not in it.
const found = new Map<string, number>();
const watchers = new Set<() => void>();
let version = 0;
const watch = (fn: () => void) => (watchers.add(fn), () => void watchers.delete(fn));
function report(id: string, n: number) {
  if (found.get(id) === n) return;
  found.set(id, n);
  version++;
  watchers.forEach((fn) => fn());
}
/** Whether every read frame of a widget came back clean (none read: not known, so not clean). */
const clean = (module: string) => {
  const mine = [...found].filter(([id]) => id.startsWith(`${module}--`));
  return mine.length > 0 && mine.every(([, n]) => n === 0);
};

/** The grid's cells and gaps over a frame (`grid=1`): the dashed squares are cells, the space between them the gap. */
function GridOverlay({ c, r, cell, gap }: { c: number; r: number; cell: number; gap: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {Array.from({ length: c * r }, (_, i) => (
        <div key={i} className="absolute border border-dashed border-sky-400/60" style={{ left: (i % c) * (cell + gap), top: Math.floor(i / c) * (cell + gap), width: cell, height: cell }} />
      ))}
    </div>
  );
}

// The chrome's own geometry is inline: a class no other part of the app uses would land in the app's shared CSS (the kiosk's and
// the studio's), which the QA page must not grow.
const RING = { inset: -6 };
const FLAG_CORNER = { top: -10, right: -10, borderTop: "10px solid var(--color-amber-400)", borderLeft: "10px solid transparent" };

/**
 * The selected frame's ring, outside its box. Its own component, so a selection re-renders the ring and never the frame (a frame's
 * re-render re-arms its settle and probe).
 */
export function SelectedRing({ id }: { id: string }) {
  const on = useSyncExternalStore(subscribe, () => getSelection().frame === id);
  return on ? <div data-qa-ui="" aria-hidden className="pointer-events-none absolute z-20 rounded-ui-md border-2 border-ui-accent" style={RING} /> : null;
}

interface FigureProps {
  mod: DashboardModule;
  /** The frame's key: its span (`2x1`) or view (`view:gauge`), as notes and references name it. */
  frameKey: string;
  c: number;
  r: number;
  settings: ModuleSettings;
  view: View;
  caption: string;
  /** What the frame is to the probes and sweeps. */
  attrs: Record<string, string>;
}

/**
 * One frame at an exact span. Clicking it (or its caption) selects it and opens the inspector, `c` on the caption copies a reference to
 * the frame, and its hover menu has the copy actions; a badge counts what overflows, overlaps or is clipped once the widget has settled
 * (the `__qaOverflow` probe, run on this frame alone); a note from `notes.json` shows under it. On the render check's page (no chrome)
 * the caption copies the reference, as before.
 */
function Figure({ mod, frameKey, c, r, settings, view, caption, attrs }: FigureProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [copied, setCopied] = useState("");
  const w = spanSize(c, view.cell, view.gap);
  const h = spanSize(r, view.cell, view.gap);
  const note = notesFor(mod.id)?.[frameKey];
  const id = frameId(mod.id, frameKey);
  const chrome = view.chrome;
  // The page renders after load, so CSS :target never matches; a copied frame link outlines its frame by the hash itself.
  const targeted = window.location.hash === `#${id}`;
  useEffect(
    () => () => {
      forgetFrame(id);
      forgetRead(id);
    },
    [id]
  );
  const copy = async () => {
    setCopied((await copyText(view.frameRef(mod.id, frameKey).text)) ? "copied" : "copy failed");
    setTimeout(() => setCopied(""), 1500);
  };
  return (
    <figure id={id} {...attrs} className={`m-0 flex scroll-mt-40 flex-col gap-1 rounded ${targeted ? "outline outline-2 outline-offset-4 outline-sky-400" : ""}`}>
      <div className={`relative rounded ${issues.length ? "outline outline-1 outline-offset-2 outline-red-500/70" : ""}`} onClick={chrome ? () => select(id) : undefined}>
        <Frame p={{ ...migratePlacementV19(placement(mod.id, c, r, withDemo(mod.id, settings, view.live))), id: `qa-${mod.id}-${attrs["data-qa-view"] ?? ""}${c}x${r}` }} w={w} h={h} live={view.live} eager={view.eager} appearance={view.appearance} onSettled={(box) => {
          const probed = probeElements(box);
          const list = probed.map((p) => p.issue);
          setIssues(list);
          const out = view.adoption ? checkAdoption(box, view.adoption) : [];
          // the top bar's summary counts (`tally.ts`) and the inspector's lists (`inspector/reads.ts`), outside the frames' render path
          tallyFrame(id, list.length, out.length);
          if (chrome) readFrame(id, { probed, flags: out });
          if (!view.adoption) return;
          setFlags(out);
          report(id, out.length);
        }} />
        {view.grid && <GridOverlay c={c} r={r} cell={view.cell} gap={view.gap} />}
        {chrome && view.adoption && flags.length > 0 && <span data-qa-ui="" aria-hidden className="pointer-events-none absolute z-20 h-0 w-0" style={FLAG_CORNER} />}
        {chrome && <SelectedRing id={id} />}
        {chrome && <FrameMenu name={`${mod.id} ${frameKey}`} reference={() => view.frameRef(mod.id, frameKey)} claude={view.claude ? () => view.claude!(id) : undefined} onInspect={() => select(id)} />}
      </div>
      <figcaption className="flex items-center gap-2 font-mono text-nano">
        <button
          type="button"
          title={chrome ? "Select this frame and open it in the inspector (c copies a reference to it)" : "Copy a reference to this frame"}
          onClick={chrome ? () => select(id) : copy}
          onKeyDown={chrome ? (e) => e.key === "c" && !e.ctrlKey && !e.metaKey && void copy() : undefined}
          className="opacity-60 hover:underline hover:opacity-100"
        >
          {caption} · {w}x{h}px
        </button>
        {copied && <span className="opacity-80">{copied}</span>}
        {issues.length > 0 && (
          <span title={issues.map((x) => `${x.kind} ${x.dx}/${x.dy}  ${x.selector}`).join("\n")} className="rounded bg-red-500/20 px-1 text-red-400">
            {issues.length} {issues.length === 1 ? "issue" : "issues"}
          </span>
        )}
        {view.adoption && flags.length > 0 && (
          <span data-qa-flags={flags.length} title={flags.map((f) => `${f.kind} ${f.prop} ${f.value}  ${f.at}`).join("\n")} className="rounded bg-amber-500/20 px-1 text-amber-400">
            {flags.length} theme {flags.length === 1 ? "flag" : "flags"}
          </span>
        )}
      </figcaption>
      {note && (
        <p className="text-[11px] text-amber-400" style={{ maxWidth: w }}>
          {note}
        </p>
      )}
    </figure>
  );
}

/**
 * One widget: on the QA page a one-line header (`SectionHead`), then its span frames, its views and its layouts; what the info column
 * held is in the inspector. In focus mode (`focus=<id>`) a strip steps one size at a time and the widget's galleries follow inline.
 */
export function WidgetSection({ mod, view }: { mod: DashboardModule; view: View }) {
  const min = `${mod.minCols ?? 1}x${mod.minRows ?? 1}`;
  const views = viewPlans(mod);
  const layouts = view.layouts ? layoutPlans(mod) : [];
  const chrome = view.chrome;
  const focused = !!chrome && chrome.focus === mod.id;
  const [step, setStep] = useState("");
  useSyncExternalStore(watch, () => version);
  const hidden = !!view.flagged && clean(mod.id);
  const plan = framePlan(mod, view.spans);
  // sizes under the minimum: dimmed placeholders on the render check's page and with `below=1`, else one line that shows them
  const showBelow = !chrome || chrome.below;
  const under = showBelow ? 0 : plan.filter((f) => f.below).length;
  const sizes = plan.filter((f) => showBelow || !f.below);
  const shown = focused && step ? sizes.filter(({ c, r }) => `${c}x${r}` === step) : sizes;
  return (
    <section id={mod.id} hidden={hidden} className="flex scroll-mt-32 flex-col items-start gap-3 border-t border-current/10 py-5">
      {chrome && <SectionHead mod={mod} view={view} chrome={chrome} />}
      {focused && (
        <FocusStrip
          sizes={sizes.map(({ c, r }) => `${c}x${r}`)}
          step={step}
          onStep={(s) => {
            setStep(s);
            if (s) select(frameId(mod.id, s));
          }}
        />
      )}
      <div className="flex min-w-0 max-w-full flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-start gap-6">
          {shown.map(({ c, r, below }) =>
            below ? (
              <div key={`${c}x${r}`} data-qa-below className="flex flex-col gap-1 opacity-40">
                <div className="flex items-center justify-center rounded border border-dashed border-current/40 font-mono text-nano" style={{ width: spanSize(c, view.cell, view.gap), height: spanSize(r, view.cell, view.gap) }}>
                  below min {min}
                </div>
                <span className="font-mono text-nano">{`${c}x${r}`}</span>
              </div>
            ) : (
              <Figure key={`${c}x${r}`} mod={mod} frameKey={`${c}x${r}`} c={c} r={r} settings={view.settings} view={view} caption={`${c}x${r}`} attrs={{ "data-qa-module": mod.id, "data-qa-span": `${c}x${r}` }} />
            )
          )}
        </div>
        {under > 0 && (
          <button type="button" data-qa-ui="" title="Show the sizes under each widget's minimum as placeholders (below=1)" onClick={chrome?.onBelow} className="self-start font-mono text-nano opacity-60 underline decoration-current/30 underline-offset-2 hover:opacity-100">
            {under} {under === 1 ? "size" : "sizes"} under the minimum ({min})
          </button>
        )}
        {views.length > 0 && (
          <div>
            <p className="mb-1.5 text-nano font-semibold uppercase tracking-wider opacity-50">Views</p>
            <div className="flex min-w-0 flex-wrap items-start gap-6">
              {views.map((v) => (
                <Figure key={v.id} mod={mod} frameKey={`view:${v.id}`} c={v.c} r={v.r} settings={{ ...view.settings, ...v.settings }} view={view} caption={`${v.name} · ${v.c}x${v.r}`} attrs={{ "data-qa-view": v.id, "data-qa-view-of": mod.id }} />
              ))}
            </div>
          </div>
        )}
        {layouts.length > 0 && (
          <div>
            <p className="mb-1.5 text-nano font-semibold uppercase tracking-wider opacity-50">Layouts</p>
            <div className="flex min-w-0 flex-wrap items-start gap-6">
              {layouts.map((l) => (
                <Figure key={l.id} mod={mod} frameKey={`layout:${l.id}`} c={l.c} r={l.r} settings={{ ...view.settings, [LAYOUT_KEY]: l.id }} view={view} caption={`${l.name} · ${l.c}x${l.r}`} attrs={{ "data-qa-layout": l.id, "data-qa-layout-of": mod.id }} />
              ))}
            </div>
          </div>
        )}
        {focused && <InlineGalleries mod={mod} view={view} />}
      </div>
    </section>
  );
}
